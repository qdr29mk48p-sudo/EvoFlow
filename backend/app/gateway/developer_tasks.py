"""Safe, plan-only Cursor task dispatch for EVO-0006.2.

This module deliberately has no code-execution path.  A task is planned in a
detached, per-task worktree with Cursor's read-only plan mode.  The later
EVO-0006.3 execution service must require a separate immutable approval.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath

from app.gateway.developer_agents import cursor_preflight

_PLAN_TIMEOUT_SECONDS = 600
_MAX_PLAN_OUTPUT_CHARS = 16_000
_SECRET_PATTERNS = (
    re.compile(r"\b(sk-[A-Za-z0-9_-]{12,})\b"),
    re.compile(r"\b(Bearer\s+)[A-Za-z0-9._~+/-]+", re.IGNORECASE),
    re.compile(r"\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD))\s*[=:]\s*([^\s,;]+)"),
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def redact(value: str) -> str:
    """Remove common credential and account forms before an event is stored."""
    text = value
    text = _SECRET_PATTERNS[0].sub("[REDACTED]", text)
    text = _SECRET_PATTERNS[1].sub(r"\1[REDACTED]", text)
    text = _SECRET_PATTERNS[2].sub(r"\1=[REDACTED]", text)
    return _SECRET_PATTERNS[3].sub("[REDACTED_EMAIL]", text)


def validate_allowed_paths(paths: list[str]) -> tuple[str, ...]:
    """Accept only clean repository-relative paths; never accept a filesystem path."""
    if not paths:
        raise ValueError("At least one allowed repository path is required.")
    normalized: list[str] = []
    for path in paths:
        value = str(path or "").strip().replace("\\", "/")
        candidate = PurePosixPath(value)
        if not value or candidate.is_absolute() or ".." in candidate.parts or value == ".":
            raise ValueError("Allowed paths must be non-empty repository-relative paths.")
        normalized.append(value.rstrip("/"))
    return tuple(dict.fromkeys(normalized))


@dataclass
class DeveloperTask:
    id: str
    evo_id: str
    summary: str
    instructions: str
    allowed_paths: tuple[str, ...]
    acceptance_criteria: tuple[str, ...]
    status: str = "draft"
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    plan_worktree: str | None = None
    plan_output: str | None = None
    error: str | None = None
    events: list[dict[str, object]] = field(default_factory=list)

    def public_dict(self, *, include_events: bool = True) -> dict[str, object]:
        payload: dict[str, object] = {
            "id": self.id,
            "provider": "cursor",
            "evo_id": self.evo_id,
            "summary": redact(self.summary),
            "allowed_paths": list(self.allowed_paths),
            "acceptance_criteria": [redact(item) for item in self.acceptance_criteria],
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "plan_worktree": self.plan_worktree,
            "plan_output": self.plan_output,
            "error": self.error,
            "execution_available": False,
        }
        if include_events:
            payload["events"] = list(self.events)
        return payload


class DeveloperTaskStore:
    """Small in-process store for the V1 local Gateway process.

    The API never claims durability: a restart loses plan tasks, while no
    credentials, raw environment, or command argv are persisted.
    """

    def __init__(self, repo_root: Path | None = None, worktree_root: Path | None = None) -> None:
        self.repo_root = repo_root or self._resolve_repo_root()
        self.worktree_root = worktree_root or Path(tempfile.gettempdir()) / "evoflow-developer-plans"
        self._tasks: dict[str, DeveloperTask] = {}
        self._lock = threading.RLock()

    @staticmethod
    def _resolve_repo_root() -> Path:
        configured = os.getenv("EVOFLOW_DEVELOPER_TASK_REPO", "").strip()
        if configured:
            return Path(configured).expanduser().resolve()
        return Path(__file__).resolve().parents[3]

    def create(
        self,
        *,
        evo_id: str,
        summary: str,
        instructions: str,
        allowed_paths: list[str],
        acceptance_criteria: list[str],
    ) -> DeveloperTask:
        if not re.fullmatch(r"EVO-\d{4}(?:\.\d+)?", evo_id.strip()):
            raise ValueError("evo_id must use the EVO-0000 or EVO-0000.1 format.")
        if not summary.strip() or not instructions.strip():
            raise ValueError("summary and instructions are required.")
        task = DeveloperTask(
            id=f"devtask-{uuid.uuid4().hex[:12]}",
            evo_id=evo_id.strip(),
            summary=summary.strip(),
            instructions=instructions.strip(),
            allowed_paths=validate_allowed_paths(allowed_paths),
            acceptance_criteria=tuple(item.strip() for item in acceptance_criteria if item.strip()),
        )
        with self._lock:
            self._tasks[task.id] = task
            self._transition(task, "routing_complete", "Task routed to Cursor plan-only adapter.")
            self._transition(task, "queued", "Waiting to start isolated read-only planning.")
        return task

    def get(self, task_id: str) -> DeveloperTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def list(self) -> list[DeveloperTask]:
        with self._lock:
            return sorted(self._tasks.values(), key=lambda task: task.created_at, reverse=True)

    def cancel(self, task_id: str) -> DeveloperTask | None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            if task.status in {"awaiting_approval", "queued", "preflight_failed"}:
                self._transition(task, "cancelled", "Task cancelled before execution; no code was written.")
            return task

    def run_plan(self, task_id: str) -> None:
        """Run fixed read-only Cursor argv in a detached worktree, never a shell."""
        task = self.get(task_id)
        if task is None:
            return
        with self._lock:
            if task.status != "queued":
                return
            preflight = cursor_preflight()
            if preflight.status != "ready" or not preflight.executable_path:
                self._transition(task, "preflight_failed", "Cursor preflight is not ready; complete local login first.")
                return
            self._transition(task, "planning", "Starting Cursor in read-only plan mode.")
        try:
            worktree = self._create_plan_worktree(task)
            prompt = self._plan_prompt(task)
            completed = subprocess.run(
                [
                    preflight.executable_path,
                    "--print",
                    "--output-format",
                    "json",
                    "--mode",
                    "plan",
                    "--sandbox",
                    "enabled",
                    "--trust",
                    "--workspace",
                    str(worktree),
                    prompt,
                ],
                cwd=worktree,
                capture_output=True,
                text=True,
                timeout=_PLAN_TIMEOUT_SECONDS,
                check=False,
            )
            output = self._safe_plan_output(completed.stdout, completed.stderr)
            if completed.returncode != 0:
                raise RuntimeError("Cursor plan mode did not complete successfully.")
            if self._worktree_changed(worktree):
                raise RuntimeError("Plan mode changed its isolated worktree; the task was blocked before approval.")
            with self._lock:
                task.plan_worktree = str(worktree)
                task.plan_output = output
                self._event(task, "plan_ready", output or "Cursor returned an empty plan.")
                self._transition(task, "awaiting_approval", "Plan is ready. Execution is unavailable until EVO-0006.3.")
        except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
            with self._lock:
                task.error = redact(str(exc))
                self._transition(task, "failed", task.error)

    def _create_plan_worktree(self, task: DeveloperTask) -> Path:
        self.worktree_root.mkdir(parents=True, exist_ok=True)
        target = self.worktree_root / task.id
        if target.exists():
            raise RuntimeError("A plan worktree already exists for this task.")
        completed = subprocess.run(
            ["git", "-C", str(self.repo_root), "worktree", "add", "--detach", str(target), "develop"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError("Gateway could not create an isolated plan worktree.")
        return target

    @staticmethod
    def _worktree_changed(worktree: Path) -> bool:
        completed = subprocess.run(
            ["git", "-C", str(worktree), "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        return completed.returncode != 0 or bool(completed.stdout.strip())

    @staticmethod
    def _safe_plan_output(stdout: str, stderr: str) -> str:
        raw = stdout.strip() or stderr.strip()
        if raw:
            try:
                raw = json.dumps(json.loads(raw), ensure_ascii=False, indent=2)
            except json.JSONDecodeError:
                pass
        return redact(raw[:_MAX_PLAN_OUTPUT_CHARS])

    @staticmethod
    def _plan_prompt(task: DeveloperTask) -> str:
        return "\n".join(
            [
                "You are preparing a read-only implementation plan for EvoFlow.",
                f"EVO task: {task.evo_id}",
                f"Summary: {task.summary}",
                "Allowed implementation paths only: " + ", ".join(task.allowed_paths),
                "Acceptance criteria:",
                *(f"- {item}" for item in task.acceptance_criteria),
                "Instructions:",
                task.instructions,
                "Do not edit files, run write commands, create branches, commit, push, or open a PR.",
                "Return a concise plan, impacted files, risks, and verification steps.",
            ]
        )

    @staticmethod
    def _event(task: DeveloperTask, kind: str, message: str) -> None:
        task.events.append(
            {"sequence": len(task.events) + 1, "kind": kind, "message": redact(message), "created_at": _utc_now()}
        )

    def _transition(self, task: DeveloperTask, status: str, message: str) -> None:
        task.status = status
        task.updated_at = _utc_now()
        self._event(task, "status", message)

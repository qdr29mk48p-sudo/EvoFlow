"""Tests for EVO-0006.2 plan-only Cursor developer task dispatch."""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.developer_agents import CursorPreflight
from app.gateway.developer_tasks import DeveloperTaskStore, redact, validate_allowed_paths
from app.gateway.routers import developer_tasks


def _client(store: DeveloperTaskStore) -> TestClient:
    app = FastAPI()
    app.include_router(developer_tasks.router)
    developer_tasks.task_store = store
    return TestClient(app)


def _payload() -> dict[str, object]:
    return {
        "evo_id": "EVO-0006.2",
        "summary": "Plan chat @cursor task dispatch",
        "instructions": "Add the plan-only API without changing runtime model providers.",
        "allowed_paths": ["backend/app/gateway", "evopanel/src"],
        "acceptance_criteria": ["No shared checkout writes before approval."],
    }


def test_paths_are_repository_relative() -> None:
    assert validate_allowed_paths(["backend/app", "evopanel/src/"]) == ("backend/app", "evopanel/src")
    for path in ["/tmp/no", "../no", "."]:
        try:
            validate_allowed_paths([path])
        except ValueError:
            pass
        else:
            raise AssertionError(f"Expected {path!r} to be rejected")


def test_create_reaches_preflight_failed_without_running_cursor(tmp_path: Path) -> None:
    store = DeveloperTaskStore(repo_root=tmp_path, worktree_root=tmp_path / "plans")
    with patch("app.gateway.developer_tasks.cursor_preflight", return_value=CursorPreflight(status="unavailable")):
        response = _client(store).post("/api/developer-tasks", json=_payload())
        task_id = response.json()["id"]
        store.run_plan(task_id)

    assert response.status_code == 202
    body = store.get(task_id).public_dict()  # type: ignore[union-attr]
    assert body["status"] == "preflight_failed"
    assert body["execution_available"] is False
    assert [event["kind"] for event in body["events"]] == ["status", "status", "status"]


def test_plan_uses_fixed_read_only_cursor_argv_and_redacts_output(tmp_path: Path) -> None:
    store = DeveloperTaskStore(repo_root=tmp_path, worktree_root=tmp_path / "plans")
    task = store.create(**_payload())
    worktree = tmp_path / "plans" / task.id
    completed = subprocess.CompletedProcess(
        ["cursor-agent"], 0, '{"text":"email a@example.com and sk-abcdefghijklmnop"}', ""
    )
    with patch("app.gateway.developer_tasks.cursor_preflight", return_value=CursorPreflight(
        available=True, authenticated=True, executable_path="/usr/local/bin/cursor-agent", status="ready"
    )), patch.object(store, "_create_plan_worktree", return_value=worktree), patch(
        "app.gateway.developer_tasks.subprocess.run", side_effect=[completed, subprocess.CompletedProcess(["git"], 0, "", "")]
    ) as run:
        store.run_plan(task.id)

    argv = run.call_args_list[0].args[0]
    assert "--mode" in argv and argv[argv.index("--mode") + 1] == "plan"
    assert "--sandbox" in argv and argv[argv.index("--sandbox") + 1] == "enabled"
    assert "--force" not in argv and "--yolo" not in argv
    assert task.status == "awaiting_approval"
    assert "a@example.com" not in (task.plan_output or "")
    assert "sk-abcdefghijklmnop" not in (task.plan_output or "")


def test_redact_hides_tokens_and_emails() -> None:
    text = redact("CURSOR_API_KEY=secret Bearer abc.def user@example.com sk-abcdefghijklmnop")
    assert "secret" not in text
    assert "user@example.com" not in text
    assert "sk-abcdefghijklmnop" not in text

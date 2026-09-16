"""Safe, local discovery for developer-agent CLIs.

This module deliberately contains *no* task execution.  It is the first
integration boundary for EVO-0006: discover a locally installed Cursor CLI
and report a redacted readiness result that the EvoPanel can display.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import asdict, dataclass

_CURSOR_COMMAND = "cursor-agent"
_PROBE_TIMEOUT_SECONDS = 5


@dataclass(frozen=True)
class CursorPreflight:
    provider: str = "cursor"
    available: bool = False
    authenticated: bool = False
    executable_path: str | None = None
    version: str | None = None
    status: str = "unavailable"
    detail: str | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _run_cursor(executable: str, *args: str) -> subprocess.CompletedProcess[str] | None:
    """Run a fixed Cursor CLI probe without shell interpolation.

    The output is intentionally kept private to this module: CLI status can
    contain account metadata, which must not be returned by the Gateway API.
    """
    try:
        return subprocess.run(
            [executable, *args],
            capture_output=True,
            text=True,
            timeout=_PROBE_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None


def cursor_preflight() -> CursorPreflight:
    """Return a credential-free Cursor CLI readiness result."""
    executable = shutil.which(_CURSOR_COMMAND)
    if not executable:
        return CursorPreflight(
            status="unavailable",
            detail="Cursor CLI is not installed or is not on the Gateway PATH.",
        )

    version_probe = _run_cursor(executable, "--version")
    if version_probe is None or version_probe.returncode != 0:
        return CursorPreflight(
            available=True,
            executable_path=executable,
            status="unhealthy",
            detail="Cursor CLI could not report its version.",
        )

    version = (version_probe.stdout or version_probe.stderr).strip() or None
    status_probe = _run_cursor(executable, "status")
    if status_probe is None:
        return CursorPreflight(
            available=True,
            executable_path=executable,
            version=version,
            status="unhealthy",
            detail="Cursor CLI did not respond to the authentication check.",
        )

    # Do not expose raw output: it can include an account email or endpoint.
    output = f"{status_probe.stdout}\n{status_probe.stderr}".lower()
    authenticated = status_probe.returncode == 0 and "logged in" in output and "not logged in" not in output
    return CursorPreflight(
        available=True,
        authenticated=authenticated,
        executable_path=executable,
        version=version,
        status="ready" if authenticated else "authentication_required",
        detail=None if authenticated else "Cursor CLI is installed but not authenticated.",
    )

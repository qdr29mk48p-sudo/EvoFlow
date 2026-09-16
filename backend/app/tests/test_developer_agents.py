"""Tests for the credential-free Cursor CLI preflight API."""

from __future__ import annotations

import subprocess
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.routers import developer_agents


def _completed(*, stdout: str = "", stderr: str = "", returncode: int = 0) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(["cursor-agent"], returncode, stdout, stderr)


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(developer_agents.router)
    return TestClient(app)


def test_preflight_reports_missing_cli() -> None:
    with patch("app.gateway.developer_agents.shutil.which", return_value=None):
        response = _client().post("/api/developer-agents/cursor/preflight")

    assert response.status_code == 200
    assert response.json() == {
        "provider": "cursor",
        "available": False,
        "authenticated": False,
        "executable_path": None,
        "version": None,
        "status": "unavailable",
        "detail": "Cursor CLI is not installed or is not on the Gateway PATH.",
    }


def test_preflight_redacts_authenticated_account_output() -> None:
    probes = iter([
        _completed(stdout="2026.09.10-fd3934a\n"),
        _completed(stdout="Logged in as private@example.com\n"),
    ])
    with patch("app.gateway.developer_agents.shutil.which", return_value="/usr/local/bin/cursor-agent"), patch(
        "app.gateway.developer_agents.subprocess.run", side_effect=lambda *_args, **_kwargs: next(probes)
    ):
        response = _client().get("/api/developer-agents")

    assert response.status_code == 200
    agent = response.json()["agents"][0]
    assert agent["status"] == "ready"
    assert agent["authenticated"] is True
    assert agent["version"] == "2026.09.10-fd3934a"
    assert "private@example.com" not in response.text


def test_preflight_requires_authentication_without_leaking_status_output() -> None:
    probes = iter([
        _completed(stdout="2026.09.10-fd3934a\n"),
        _completed(stdout="Not logged in as private@example.com\n"),
    ])
    with patch("app.gateway.developer_agents.shutil.which", return_value="/usr/local/bin/cursor-agent"), patch(
        "app.gateway.developer_agents.subprocess.run", side_effect=lambda *_args, **_kwargs: next(probes)
    ):
        response = _client().post("/api/developer-agents/cursor/preflight")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "authentication_required"
    assert payload["authenticated"] is False
    assert "private@example.com" not in response.text

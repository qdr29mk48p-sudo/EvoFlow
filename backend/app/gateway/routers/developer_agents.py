"""Developer-agent discovery endpoints.

EVO-0006.1 intentionally exposes preflight only.  Task execution, worktree
creation, and approvals are separate follow-up tasks with their own review.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.gateway.developer_agents import cursor_preflight

router = APIRouter(prefix="/api/developer-agents", tags=["developer-agents"])


class DeveloperAgentsResponse(BaseModel):
    agents: list[dict[str, object]]


@router.get("", response_model=DeveloperAgentsResponse)
async def list_developer_agents() -> DeveloperAgentsResponse:
    """List local development agents without exposing credentials."""
    return DeveloperAgentsResponse(agents=[cursor_preflight().to_dict()])


@router.post("/cursor/preflight", response_model=dict[str, object])
async def preflight_cursor_agent() -> dict[str, object]:
    """Re-run the local Cursor CLI readiness check."""
    return cursor_preflight().to_dict()

"""Developer task API: plan-only Cursor dispatch for EVO-0006.2."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field

from app.gateway.developer_tasks import DeveloperTaskStore

router = APIRouter(prefix="/api/developer-tasks", tags=["developer-tasks"])
task_store = DeveloperTaskStore()


class CreateDeveloperTaskRequest(BaseModel):
    evo_id: str = Field(pattern=r"^EVO-\d{4}(?:\.\d+)?$")
    summary: str = Field(min_length=1, max_length=500)
    instructions: str = Field(min_length=1, max_length=12_000)
    allowed_paths: list[str] = Field(min_length=1, max_length=30)
    acceptance_criteria: list[str] = Field(default_factory=list, max_length=20)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_developer_task(
    payload: CreateDeveloperTaskRequest, background_tasks: BackgroundTasks
) -> dict[str, object]:
    try:
        task = task_store.create(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    background_tasks.add_task(task_store.run_plan, task.id)
    return task.public_dict()


@router.get("")
async def list_developer_tasks() -> dict[str, object]:
    return {"tasks": [task.public_dict(include_events=False) for task in task_store.list()], "durable": False}


@router.get("/{task_id}")
async def get_developer_task(task_id: str) -> dict[str, object]:
    task = task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Developer task not found.")
    return task.public_dict()


@router.post("/{task_id}/cancel")
async def cancel_developer_task(task_id: str) -> dict[str, object]:
    task = task_store.cancel(task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Developer task not found.")
    return task.public_dict()

# EvoFlow 开发中任务

> 将已开工的任务从 `backlog.md` 移入此处，并在每次状态变化时更新。

## 任务模板

### EVO-<编号>：<简短任务名称>

- **状态**：进行中 / 受阻 / 待验收
- **负责人**：
- **分支**：
- **当前进展**：
- **阻塞因素**：
- **验证记录**：
- **下一步**：

## 当前任务

## EVO-0006.2：聊天派发 Cursor 只读计划任务

- **分支**：`feature/EVO-0006-chat-cursor-tasks`
- **实现负责人**：Codex（Gateway）
- **Cursor 后续交接**：EVO-0006.4 将在 EvoPanel 聊天中解析 `@cursor`，收集 EVO 编号、允许路径、说明与验收标准，然后调用 `POST /api/developer-tasks`。前端不得调用 CLI、Git 或本机 shell。
- **当前 API 契约**：
  - `POST /api/developer-tasks`：创建任务并异步生成只读计划，返回 `202`。
  - `GET /api/developer-tasks`、`GET /api/developer-tasks/{id}`：查询任务和脱敏事件。
  - `POST /api/developer-tasks/{id}/cancel`：仅允许在计划/批准前取消。
- **明确未实现**：批准后执行、写入 worktree、提交、推送、PR、合并和持久化。Gateway 重启会清除当前 V1 内存任务。
- **验收证据**：`PYTHONPATH=. uv run pytest app/tests/test_developer_agents.py app/tests/test_developer_tasks.py`（7 passed）；`uv run ruff check app/gateway/developer_tasks.py app/gateway/routers/developer_tasks.py app/tests/test_developer_tasks.py`（passed）。

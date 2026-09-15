# ADR-0002：Cursor 开发代理 Adapter V1

- **状态**：已提议
- **日期**：2026-09-15
- **关联需求**：`PRD-0001`
- **关联任务**：`EVO-0006`

## 背景

EvoFlow 目前的模型 Provider 用于运行时模型调用，而 Cursor 是开发客户端/Agent，不是可直接放入模型下拉框的模型 Provider。项目需要先接入 Cursor，使带 EVO 编号的开发工作能够在本机受控运行，并保留可审计的计划、批准、事件、验证和 PR 证据。

如果 Gateway 直接接受任意命令或在共享 checkout 中调用 Cursor，用户输入可能演变为命令注入、未批准写入、凭据泄露或损坏 `develop`/`main`。因此 V1 的首要目标是建立安全执行边界，而非自动化程度。

## 决策

采用 **Gateway 内的 Developer Agent Adapter 协议 + Cursor Adapter**，只支持本机 Cursor CLI，并使用下列流程：

```text
EVO 任务 → CLI 预检 → 只读规划 → 人工批准 → 隔离 worktree 执行
      → 验证 → diff / PR 审核 → 合并到 develop
```

### Adapter 协议

Gateway 定义与供应商无关的接口：

- `preflight()`：检查 CLI 路径、版本、认证状态和受支持能力；返回状态而不是凭据。
- `plan(task)`：以非写入模式生成实现计划、预估影响路径和风险。
- `execute(approvedRun)`：仅对已批准任务执行；必须接收 Gateway 创建的 worktree、分支和允许路径。
- `cancel(run)`：终止受控子进程并更新终态。
- `parse_events(stream)`：把 Cursor 的结构化输出转换为统一事件；保存前进行密钥和个人数据脱敏。

Cursor Adapter 只能执行 Gateway 构造的 argv；不得将页面输入或任务正文拼接为 shell。V1 使用本机已安装且已认证的 `cursor-agent` CLI。规划使用非写入模式；若 CLI 在非交互模式写入需要强制写权限，`--force` 仅能在已批准的执行阶段使用，且工作目录必须是 Gateway 创建的隔离 worktree。

### 任务状态与持久化

任务状态固定为：

```text
draft → routing_complete → queued → preflight_failed | planning
planning → awaiting_approval | failed
awaiting_approval → executing | cancelled
executing → verifying → review_ready | failed | cancelled
```

至少保存 `DeveloperAgentConnection`（provider、可执行路径、能力、最近预检状态）和 `DeveloperTaskRun`（EVO 编号、模式、状态、worktree、分支、经脱敏事件、退出码、验证结果、diff 摘要、PR 链接）。不存储 API key、浏览器会话或原始环境变量。

### 隔离与权限

1. Gateway 从 `develop` 创建唯一的任务分支和独立 worktree；禁止以 `main`、`develop` 或用户当前 checkout 为工作目录。
2. 规划模式不可写入。执行模式必须有不可变的批准记录，且批准内容包含 EVO 编号、分支、worktree、允许路径与验证命令。
3. 写入范围默认限制为任务声明的仓库路径；任何跨范围发现必须回到 `awaiting_approval`，不能静默扩大。
4. 所有事件、报错、命令摘要和 diff 在显示/持久化前脱敏；UI 永不显示凭据。
5. V1 不自动提交、推送、创建 PR 或合并。审核者确认后使用正常 Git/PR 流程。

### API 与 UI 边界

建议的 Gateway API：

- `GET /api/developer-agents`：可用 Agent 与能力。
- `POST /api/developer-agents/cursor/preflight`：运行受控预检。
- `POST /api/developer-tasks`：创建只读规划任务。
- `POST /api/developer-tasks/{id}/approve`：记录批准并启动已批准的执行。
- `POST /api/developer-tasks/{id}/cancel`：取消可取消任务。
- `GET /api/developer-tasks/{id}/events`：SSE 事件流。
- `GET /api/developer-tasks/{id}/diff`：受限的 diff 摘要与文件列表。

EvoPanel 只负责显示预检、创建任务、批准、事件、diff 和验证结果；它不直接运行本机命令，也不绕过 Gateway 管理 worktree 或凭据。

## 备选方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 直接把 Cursor 加入模型 Provider | 不采用 | Cursor 是开发客户端，不满足运行时模型 API 的契约。 |
| 在用户当前 checkout 调用 Cursor | 不采用 | 可能与本地修改冲突，且无法保证分支隔离。 |
| V1 同时实现 Cursor 与 Codex Adapter | 暂缓 | 扩大适配、授权与测试范围；先验证统一协议能支撑 Cursor。 |
| 自动写入、提交、推送和合并 | 不采用 | 风险超过 V1 价值，保留人工审核关卡。 |

## 后果与实施影响

- Codex 负责 Gateway、Adapter、状态机、worktree 管理、事件脱敏和测试；Cursor 负责 EvoPanel 的任务与审批界面。
- 首期实现应拆分为 Gateway 契约、Cursor Adapter、隔离执行、EvoPanel 页面、端到端验证五个可独立审核的子任务。
- 后续接入 Codex 客户端时，复用 Adapter 协议、状态机和审计模型，只新增其 provider 实现与能力声明。

## 迁移与回滚

- 以 feature flag 或显式的本地配置默认关闭 Developer Agent 功能。
- 若执行异常，禁用 Cursor connection、取消运行中的子进程并保留事件证据；删除该任务的未合并 worktree/分支前需人工确认。
- 该功能不改变 Runtime 模型 Provider、现有 Agent 执行链或主分支历史，因此关闭开关即可回退用户可见入口。

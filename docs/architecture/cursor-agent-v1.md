# Cursor 开发代理 V1 实施蓝图

> 本文将 `PRD-0001` 和 `ADR-0002` 转成可拆分的工程边界。它不是 Cursor CLI 的安装说明，也不授权任何自动写入或合并。

## 目标架构

```text
EvoPanel
  │  创建 / 查看 / 批准开发任务
  ▼
Gateway Developer Tasks API
  │
  ├─ Task State Machine + Audit Store
  ├─ Worktree Manager
  └─ DeveloperAgentAdapter
       └─ CursorAgentAdapter ──受控 argv──> cursor-agent CLI
                                                 │
                                             独立 worktree
                                                 │
                                      diff + verification evidence
```

## 实施顺序与责任归属

| 子任务 | 负责人 | 主要交付物 | 前置条件 |
| --- | --- | --- | --- |
| EVO-0006.1 契约与数据模型 | Codex | API schema、任务/事件数据模型、状态转换测试 | ADR-0002 批准 |
| EVO-0006.2 Cursor 预检与 Adapter | Codex | 可执行路径解析、版本/认证预检、只读规划、结构化事件解析与脱敏 | 0006.1 |
| EVO-0006.3 隔离执行与批准 | Codex | worktree/分支生命周期、批准记录、允许路径、取消与验证 | 0006.1、0006.2 |
| EVO-0006.4 开发任务界面 | Cursor | Agent 状态、任务创建、批准、事件、diff/验证结果 | 0006.1 API 契约稳定 |
| EVO-0006.5 集成验证 | Codex + Cursor | 端到端用例、失败路径、手工安全验收记录 | 0006.2–0006.4 |

## V1 数据与事件最小集

| 对象 | 最小字段 | 备注 |
| --- | --- | --- |
| Agent connection | `provider`, `executable_path`, `capabilities`, `preflight_status`, `checked_at` | 只存状态，不存 token、cookie、环境变量。 |
| Task run | `id`, `evo_id`, `mode`, `status`, `branch`, `worktree`, `allowed_paths`, `approved_at`, `exit_code` | `mode` 为 `plan` 或 `execute`。 |
| Event | `run_id`, `sequence`, `kind`, `message`, `created_at`, `redacted` | 事件原文必须先脱敏。 |
| Verification | `run_id`, `command_label`, `result`, `summary`, `completed_at` | 不允许前端任意提交 shell 命令。 |

## 关键行为

### 1. 预检

Gateway 检查受配置允许的 `cursor-agent` 路径是否可执行，并读取版本/认证可用性。预检失败只返回下一步建议，例如“安装 CLI”或“完成登录”，不能自行安装、打开登录页或记录密钥。

### 2. 规划

创建任务时强制传入已存在的 EVO 编号、目标范围、验收标准和允许路径。Adapter 以无写入方式产出计划；Gateway 记录推荐变更和风险，并把状态更新为 `awaiting_approval`。规划阶段若检测到文件变更，标记失败并保留证据。

### 3. 批准与执行

批准请求必须固定并展示：EVO 编号、目标分支、基线 `develop` SHA、worktree 路径、允许写入路径、测试计划和任务摘要。Gateway 再次校验状态、基线和路径，随后才创建/使用该独立 worktree 启动执行。执行完成后不能自动推送、开 PR 或合并。

### 4. 验证与审核

Gateway 运行任务预先登记的验证步骤并生成受限 diff 摘要。EvoPanel 显示审核所需证据：状态时间线、变更文件、diff 摘要、验证结果、失败原因及可选 PR 地址。审核通过仍由人用标准 Git/PR 流程合并至 `develop`。

## 安全验收清单

- [ ] 任意任务正文不能改变 executable、shell 解释器或未登记验证命令。
- [ ] 规划和未批准任务对仓库产生零文件写入。
- [ ] 已批准任务不能在 `main`、`develop` 或用户当前 checkout 中运行。
- [ ] 日志、SSE、数据库、diff 和 UI 中不会出现 API key、访问 token、cookie 或原始环境变量。
- [ ] 取消和失败都释放子进程；worktree 仅在人工确认后清理。
- [ ] Cursor CLI 不可用、认证失效、Git 工作树不干净、验证失败均能被清晰区分。

## 明确延后

- Codex 客户端 Adapter；
- 远程执行器、共享队列和并发调度；
- 自动安装/登录、自动提交/推送/开 PR/合并；
- 让 Runtime 模型选择器直接出现 Cursor 或 Codex。

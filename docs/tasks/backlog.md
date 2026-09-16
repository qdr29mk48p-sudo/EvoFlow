# EvoFlow 任务待办

> 所有开发工作在开始前必须拥有一个 EVO 编号。ChatGPT 维护优先级与验收标准；Codex 与 Cursor 按 `AGENTS.md` 的边界实施。

## 编号与分支规则

- 任务编号为递增的四位数字：`EVO-0001`、`EVO-0002`、`EVO-0003`……；编号永不复用。
- 功能分支：`feature/EVO-0001-<短名称>`；缺陷修复：`fix/EVO-0002-<短名称>`；紧急修复：`hotfix/EVO-0003-<短名称>`。
- 提交或拉取请求标题必须包含编号，例如：`docs(process): add EVO-0001 collaboration baseline`。
- 可拆分工作使用父子关系，例如 `EVO-0010`、`EVO-0010.1`；子项仍在同一父任务范围内，不能替代新的独立编号。

## 任务模板

### EVO-<编号>：<简短任务名称>

- **状态**：待办 / 进行中 / 受阻 / 待验收
- **优先级**：P0 / P1 / P2 / P3
- **负责人**：ChatGPT / Codex / Cursor
- **范围与交付物**：
- **影响模块**：
- **依赖与风险**：
- **验收标准**：
  - [ ]
- **分支**：
- **关联需求 / ADR**：

## 首批 EVO 任务

### EVO-0001：建立多 AI 协作与文档基线

- **状态**：待验收
- **优先级**：P0
- **负责人**：Codex
- **范围与交付物**：`AGENTS.md` 协作规则、产品/架构/任务/发布模板与 `develop` 集成分支。
- **影响模块**：项目治理与文档。
- **依赖与风险**：需要将本地 `develop` 推送到用户自己的 GitHub fork 后才能建立远程保护规则。
- **验收标准**：
  - [ ] `main` 未包含本任务的协作文档提交。
  - [ ] `develop` 包含规则与全部基础模板。
  - [ ] 后续任务可按本页编号、分支和验收格式新增。
- **分支**：`develop`

### EVO-0002：梳理 Agent 组织管理的产品需求

- **状态**：待办
- **优先级**：P1
- **负责人**：ChatGPT
- **范围与交付物**：定义员工、岗位、部门、Agent Team、权限、Skills、模型与工作空间之间的业务边界和验收标准。
- **影响模块**：Product Governance；可能影响 Gateway、Runtime 与 EvoPanel。
- **依赖与风险**：先完成 `PRD-0001`，再拆分数据/API/UI 子任务。
- **验收标准**：
  - [ ] 需求记录明确范围、不在范围内、核心用户流程和验收标准。
  - [ ] 已形成可独立实施的 Codex 与 Cursor 子任务。
- **关联需求 / ADR**：`docs/product/requirements.md`

### EVO-0003：建立组织管理的架构决策记录

- **状态**：待办
- **优先级**：P1
- **负责人**：Codex
- **范围与交付物**：在已批准需求基础上，记录组织模型、权限边界、API 契约和迁移策略。
- **影响模块**：Gateway、Agent Runtime、Memory、EvoPanel。
- **依赖与风险**：依赖 EVO-0002；需避免 UI 与 Runtime 产生绕过 Gateway 的耦合。
- **验收标准**：
  - [ ] ADR 说明上下文、方案、权衡、后果与回滚路径。
  - [ ] 后端和前端实施任务可据此独立验收。
- **关联需求 / ADR**：`EVO-0002`

### EVO-0006：Cursor 开发代理接入 V1

- **状态**：待办
- **优先级**：P1
- **负责人**：Codex（Gateway、Adapter、隔离执行与测试）+ Cursor（EvoPanel 任务界面）
- **范围与交付物**：实现本机 Cursor Agent CLI 的预检、规划与批准后隔离执行；新增统一 Developer Agent Adapter 协议、任务状态机、审计事件、任务详情 UI 与测试。
- **影响模块**：Gateway、任务调度/审计、Git worktree 管理、EvoPanel、自动化测试。
- **依赖与风险**：依赖 `PRD-0001`、`ADR-0002`、EVO-0004 与 EVO-0005；需要用户本机已安装并认证 Cursor CLI。错误的权限或 worktree 隔离会造成代码/凭据风险，必须通过批准关卡与路径白名单控制。
- **验收标准**：
  - [ ] 仅已预检可用的 Cursor CLI 可创建任务；不可用时提供修复提示而不自动安装或泄露凭据。
  - [ ] 规划任务不产生工作区写入；写入任务未经批准不可执行。
  - [ ] 每个写入任务仅在从 `develop` 创建的独立分支/worktree 中运行，不能直接变更 `main`、`develop` 或当前 checkout。
  - [ ] 任务详情含状态、脱敏事件、diff、检查结果和 PR 链接；失败/取消可追踪。
  - [ ] Gateway 与 EvoPanel 改动按职责拆分为独立子任务与 PR，并通过相称的自动化检查。
- **分支**：先以本规格分支 `docs/EVO-0006-cursor-agent-v1` 评审；实施拆分为 `feature/EVO-0006-<短名称>` 子分支。
- **关联需求 / ADR**：`PRD-0001`；`ADR-0002-cursor-agent-adapter-v1`

### EVO-0006.2：聊天派发 Cursor 只读计划任务

- **状态**：进行中
- **优先级**：P1
- **负责人**：Codex（Gateway 计划任务）+ Cursor（后续聊天 `@cursor` UI）
- **范围与交付物**：Gateway 接收带 EVO 编号、允许路径和验收标准的 Cursor 计划任务；使用固定只读 CLI 参数与独立 detached worktree 生成脱敏计划；提供创建、查询与取消 API。
- **影响模块**：Gateway Developer Tasks API、Cursor Adapter、EvoPanel 聊天交互（后续子项）。
- **依赖与风险**：Cursor CLI 必须通过预检。计划模式不得写入；所有执行/批准/PR 动作明确不在本任务范围内。
- **验收标准**：
  - [ ] 不存在已认证 Cursor CLI 时，任务可审计地显示为 `preflight_failed`，不会运行 CLI。
  - [ ] 计划调用固定使用 `--mode plan` 与 `--sandbox enabled`，且不用 `--force`/`--yolo`。
  - [ ] 每次计划使用从 `develop` 检出的 detached worktree；发现变更即失败，不能进入批准状态。
  - [ ] 返回的任务、事件与计划输出不包含 token、密钥或邮箱。
  - [ ] EvoPanel 的 `@cursor` 输入入口由独立 Cursor 子任务实现，调用此 API 而不运行本机命令。
- **分支**：`feature/EVO-0006-chat-cursor-tasks`
- **关联需求 / ADR**：`PRD-0001`；`ADR-0002-cursor-agent-adapter-v1`

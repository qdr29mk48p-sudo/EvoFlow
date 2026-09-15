# EvoFlow

本项目的 AI 可消费知识库位于 [`.codebasewiki/`](./.codebasewiki/)(多工具按 [AGENTS.md 标准](https://agents.md/) 自动发现本文件)。

## 检索约定(AI 默认先查知识库)
处理「代码在哪 / 某模块怎么工作 / 某概念涉及哪些文件」前:
1. 先读 `.codebasewiki/index/index.md`(模块地图)+ `index/architecture.md`(整体架构),再下钻;
2. 关键词 → 源文件用 `/codebase-navigator <关键词>`(四层索引,<10s 定位);
3. 全项目 Grep 是最后手段,不是默认。已知确切路径的简单查找仍可直接 Read/Grep。

## 五环闭环
- **建库**:`/codebase-bootstrap` 或 `python .claude/skills/codebase-bootstrap/scripts/bootstrap.py`
- **检索**:`/codebase-navigator <关键词>`
- **沉淀**:会话结束自动(Stop hook → codebase-compound)
- **编排验证**:`/codebase-loop verify`
- **质量审**:`/codebase-wiki`(审 .codebasewiki/ 断链/缺节/frontmatter)

详见 `.claude/skills/codebase-wiki/SKILL.md`。

## 多 AI 协同开发规则

### 固定职责

| 角色 | 定位 | 主要负责 | 不负责或需先协调 |
| --- | --- | --- | --- |
| ChatGPT | 产品、架构与项目总控 | 需求澄清、模块划分、方案与任务拆解、优先级、验收标准、发布规划 | 不作为常规业务代码的直接实现者 |
| Codex | 核心研发与架构工程师 | Gateway/FastAPI、Agent Runtime、LangGraph、Supervisor、Agent Teams、Memory、Skills、MCP、Sandbox、数据模型、权限、任务调度、跨模块重构、自动化测试与代码审查 | UI 的纯视觉微调应交给 Cursor |
| Cursor | EvoPanel UI 与本地开发工程师 | React/Tauri 页面、组件、交互、样式、前端状态、API 接入、页面级修复 | 不单独修改 Runtime、Memory、MCP、Sandbox 等底层架构；涉及这些边界时先建任务并交由 Codex 处理 |

### 强制需求路由（每次需求都执行）

无论用户把需求发给 ChatGPT、Codex 或 Cursor，收到需求的 AI 在读取、修改、运行命令或创建分支前，必须先完成一次归属验证，并用中文给出简短结论：

`路由结论：<ChatGPT | Codex | Cursor | 联合任务>；原因：<涉及的模块或证据>；下一步：<由谁执行什么>`

| 需求信号 | 路由结论 | 执行规则 |
| --- | --- | --- |
| 需求目标不清、产品范围、优先级、验收标准、流程或架构取舍 | ChatGPT | ChatGPT 先形成需求、任务与验收；未经拆分不得开始跨模块实现。 |
| Gateway、FastAPI、API 契约、数据库、认证/权限、Agent Runtime、LangGraph、Memory、Skills、MCP、Sandbox、任务调度、性能或跨模块故障 | Codex | Codex 说明影响边界后实施；UI 需要配套时拆出 Cursor 子任务。 |
| EvoPanel 的 React/Tauri 页面、组件、布局、样式、交互、前端状态、页面级错误或既有 API 接入 | Cursor | Cursor 在确认不需改变后端契约后实施；一旦发现需要 API、数据模型或运行时变更，立即停止扩大范围并转交 Codex。 |
| 同时包含产品决策、后端/运行时和 UI | 联合任务 | ChatGPT 先拆为带 EVO 编号的子任务；Codex 与 Cursor 仅实施各自边界内的子项。 |

- **路由匹配时**：AI 必须明确说明“此需求属于我当前职责”，再按任务范围执行。
- **路由不匹配时**：AI 不得直接改动代码或以临时方案绕过边界；必须输出可交接信息（现象、复现方式、报错、涉及文件/接口、建议接手角色）。
- **信息不足时**：AI 先做只读定位以完成路由，再决定执行者；不能因为信息不足而默认承担所有模块。
- 每一个实施任务都必须在 `docs/tasks/backlog.md` 有 EVO 编号、负责人、范围和验收标准；执行前与完成后更新任务状态。

### 协作流程

1. 接收需求的 AI 先执行“强制需求路由”，说明归属或联合拆分结论。
2. ChatGPT 将已确认需求记录到 `docs/product/requirements.md`，并在 `docs/tasks/backlog.md` 建立带验收标准的任务。
3. 任务按改动边界分配：跨模块、后端或运行时任务给 Codex；EvoPanel 页面和局部交互任务给 Cursor。
4. 实施者只修改自己任务涉及的文件；发现跨边界影响时暂停扩大改动，在任务中记录并请求拆分或协调。
5. 合并前由 ChatGPT 按任务验收标准检查；Codex 对高风险、跨模块或运行时改动进行代码审查。
6. 完成的任务移至 `docs/tasks/completed.md`，版本与用户可见变更同步记录在 `docs/releases/`。

### Git 规则

- `main` 仅保存已验证、可发布的版本；不得直接开发或直接提交业务变更。
- `develop` 是日常集成分支。本仓库的协作规范、文档和初始化变更首先进入 `develop`。
- 功能从 `develop` 创建 `feature/EVO-<编号>-<简短名称>`；修复从 `develop` 创建 `fix/EVO-<编号>-<简短名称>`；紧急修复从 `main` 创建 `hotfix/EVO-<编号>-<简短名称>`。
- 一个任务对应一个分支和一个拉取请求。提交信息使用 Conventional Commits，例如 `feat(runtime): add team template` 或 `docs(process): add collaboration baseline`。
- 合并目标默认是 `develop`；仅已通过验收的发布候选可从 `develop` 合并到 `main`。禁止强推共享分支。
- 合并前必须同步分支、运行与改动相称的检查，并在拉取请求中关联 EVO 任务编号、验收结果和风险说明。

# v0.13.61 — Employee Independent Agent Architecture + Frontend UX Optimization

## 迭代完成说明

本次迭代包含两大部分：前端 UX 产品化优化 + 后端 Employee 独立 Agent 架构升级。

### 一、前端 UX 产品化优化

#### 技能中心重构
- 移除右侧固定导入面板 → 改为"导入技能"按钮 + slide-over 面板
- 增加统计条（技能总数 / 已启用 / 被使用）
- 添加分类过滤标签（通用能力、外部数据、平台扩展、内容生成）
- 技能卡片改为紧凑列表布局（图标 + 名称 + 标签 + 状态 + 操作）
- 启用/停用状态通过透明度视觉区分

#### 运行中心重构
- 移除右侧固定详情面板 → 点击记录打开 slide-over 详情
- 增加状态过滤标签（全部 / 已完成 / 执行中 / 失败）
- 列表改为时间线布局（左侧圆点 + 垂直线）
- 执行中状态圆点有脉冲动画

#### 集成中心增强
- 增加配置进度条（1/3 已配置）
- 每张卡片增加区分图标（大脑 / 列表 / 消息）
- 状态标签增加对应图标（✓ / ⚠）
- 技术详情使用等宽字体

#### 工作台优化
- 底部"即将运行"和"最新产出"去掉外层卡片包裹，更轻量
- hero-section 增强：可见渐变背景 + 柔和边框 + 底部渐变分割线

#### 员工中心优化（上一迭代延续）
- 员工列表为主视图，创建表单改为 slide-over 面板
- 聊天页面过滤空消息
- 减少卡片同质化

### 二、Employee 独立 Agent 架构

**核心变更：每个 Employee 现在对应一个独立的 Agent，拥有独立 workspace。**

#### 新增文件
- `server/engine/employee-workspace.ts`：Employee workspace 生命周期管理
  - `ensureEmployeeWorkspace()`: 为 Employee 创建 `{homeDir}/agents/{employeeCode}/` 独立目录
  - 自动生成 `SOUL.md`（来自 system_prompt）和 `IDENTITY.md`（来自名称/编码/描述）
  - 从全局 workspace 复制基础模板文件（AGENTS.md、TOOLS.md 等）
  - `syncEmployeeSkills()`: 将绑定技能复制到 Employee workspace

#### 改动文件
- `server/api/employees/index.post.ts`：
  - 创建 Employee 时立即初始化独立 workspace
  - 绑定技能时同步复制到 Employee workspace
- `server/engine/NextclawEngineGateway.ts`：
  - 新增 `engines: Map<string, AgentEngine>` 引擎池
  - 新增 `getOrCreateEngine(agentId, workspace)` 方法
  - `runEmployeeTurn` 支持 `workspace` 和 `requestedSkills` 参数
  - 每个 Employee 的请求路由到其独立 Agent Engine
- `server/services/employee-run-service.ts`：
  - 构造函数新增 `EmployeeSkillRepository` 参数
  - 运行前自动初始化 Employee workspace
  - 查询绑定技能并传入 `requestedSkills`
  - 不再将 `systemPrompt` 拼入消息内容（由 SOUL.md 替代）
- `server/runtime/platform-context.ts`：
  - 传入 `employeeSkillRepo` 给 `EmployeeRunService`

#### 架构对比

| 维度 | 改动前 | 改动后 |
|------|--------|--------|
| Workspace | 所有 Employee 共享一个 | 每个 Employee 独立 `agents/{code}/` |
| Agent Engine | 全局单例 | 按 Employee 按需创建、缓存 |
| 人设 (SOUL) | `systemPrompt` 拼入消息 | 独立 `SOUL.md` 文件 |
| 身份 (IDENTITY) | 无 | 独立 `IDENTITY.md` 文件 |
| 技能绑定 | 未传入引擎 | 传入 `metadata.requested_skills` |
| 会话隔离 | sessionKey 区分 | 保持不变（已隔离） |

## 测试/验证/验收方式

### 前端验证
- `nuxi typecheck` 类型检查通过 ✅
- 浏览器验证各页面 UI 效果：工作台、员工中心、技能中心、运行中心、集成中心 ✅
- 员工创建 slide-over 面板打开/关闭 ✅
- 运行中心点击记录打开详情 slide-over ✅
- 技能中心分类过滤 ✅

### 后端验证
- `nuxi typecheck` 类型检查通过 ✅
- 冒烟验证待执行（需启动 dev server 并创建 Employee → 发起聊天 → 检查独立 workspace 创建）

### 冒烟验证步骤
1. 启动 dev server
2. 创建一个 Employee，填写 system_prompt
3. 进入聊天发送消息
4. 检查 `{homeDir}/agents/{employeeCode}/` 目录是否存在
5. 检查 `SOUL.md` 内容是否与 system_prompt 一致
6. 检查 `IDENTITY.md` 内容是否包含 Employee 名称和编码

## 发布/部署方式

- 前端和后端改动均在 `nextclaw-digital-employee` 包内
- 无需发布到 NPM（内部应用）
- 部署方式：Nuxt 3 应用部署

## 用户/产品视角的验收步骤

1. 打开平台各页面，确认 UI 无重大视觉退化
2. 创建 Employee → 进入聊天 → 发送消息
3. 确认 Employee 的回复基于其 system_prompt 而非全局人设
4. 确认绑定技能在 Agent 中生效

# v0.13.63 — 员工创建高级配置

## 迭代完成说明

本次迭代为数字员工创建流程新增了"工作设定"步骤和多项中高价值配置能力：

### 后端变更

1. **员工级模型选择**
   - `employees` 表新增 `model` 字段（含增量 migration）
   - `EmployeeRecord` / `CreateEmployeeInput` / `EmployeeView` 类型同步更新
   - 创建 API 接受 `model` 参数并持久化
   - `NextclawEngineGateway.createEngineForWorkspace()` 支持 `model` 覆盖
   - `EmployeeRunService` 透传员工级 `model` 到引擎

2. **工作区文件初始化与读写 API**
   - 创建 API 接受 `workspaceFiles: Record<string, string>` 批量写入初始内容
   - 新增 `GET /api/employees/:id/workspace/:filename` 读取工作区文件
   - 新增 `PUT /api/employees/:id/workspace/:filename` 更新工作区文件
   - 允许文件白名单：`AGENTS.md`、`TOOLS.md`、`USER.md`、`BOOT.md`、`HEARTBEAT.md`、`MEMORY.md`

3. **中文本地模板**
   - 在 `packages/nextclaw-digital-employee/templates/` 下创建中文版工作区模板
   - `employee-workspace.ts` 优先使用本地中文模板，回退到 nextclaw 全局模板

### 前端变更

4. **创建表单新增"工作设定"步骤**（Step 1）
   - **使用模型**：自由输入 + `datalist` 常用模型建议（`provider/model` 格式）
   - **服务对象**：描述员工服务的用户或团队
   - **心跳巡检内容**：心跳模式下的周期检查任务
   - **启动任务**（高级设定）：启动时自动执行的指令
   - **操作规则**（高级设定）：自定义工作行为规范
   - 表单步骤从 3 步扩展为 4 步：基础信息 → 工作设定 → 能力配置 → 自动任务

## 测试 / 验证 / 验收方式

1. **构建验证**：`nuxt build` 成功（exit code 0）
2. **API 验证**：
   - `POST /api/employees` 传入 `model` 和 `workspaceFiles` 后：
     - 数据库 `model` 字段正确写入
     - 工作区目录中对应文件被创建/覆盖
   - `GET /api/employees/:id/workspace/HEARTBEAT.md` 返回正确内容
   - `PUT /api/employees/:id/workspace/USER.md` 更新后 GET 可读到新内容
3. **前端验证**：
   - 创建表单显示 4 个步骤，第 2 步为"工作设定"
   - 模型输入框带有 datalist 建议
   - 高级设定默认折叠，点击展开后显示"启动任务"和"操作规则"
   - 创建成功后所有字段正确传递到后端

## 发布 / 部署方式

- 本包为私有 Nuxt 应用（`@nextclaw/digital-employee`），不发布到 NPM
- 部署方式：`nuxt build` → 运行 `.output/server/index.mjs`
- 数据库 migration 自动执行（`ensurePlatformDatabase` 中的 `migrateEmployeesAddModel`）

## 用户 / 产品视角的验收步骤

1. 打开数字员工管理页面，点击"创建员工"
2. 填写基础信息（名称、编码、职责描述、角色设定），点击下一步
3. 在"工作设定"步骤中：
   - 输入或选择模型（如 `openai/gpt-4.1`）
   - 填写服务对象信息
   - 填写心跳巡检内容
   - 点击"展开高级设定"，填写启动任务和操作规则
4. 继续完成"能力配置"和"自动任务"步骤
5. 点击"创建并进入工作台"
6. 确认进入员工详情后，各配置信息已生效

# v0.13.64 employee edit delete

## 迭代完成说明（改了什么）
- 员工管理补齐编辑与删除能力，前端在员工列表卡片新增 `编辑`、`删除` 操作。
- 新增编辑侧边栏：
  - 编码只读不可修改；
  - 可更新名称、职责描述、角色设定、模型、技能与自动任务；
  - 可直接编辑并回写 `HEARTBEAT.md`、`USER.md`、`BOOT.md`、`AGENTS.md`。
- 后端新增员工接口：`PATCH /api/employees/:id` 与 `DELETE /api/employees/:id`。
- 删除流程新增完整清理：
  - 清理调度任务（cron job）与 heartbeat；
  - 删除员工关联运行记录；
  - 删除员工记录及关联 skills/schedule（数据库级联）；
  - 删除员工工作区目录及对应文件。
- 仓库/服务层新增能力：员工更新/删除、按员工删除 run records、按员工删除 schedule、自动化清理 schedule。

## 测试/验证/验收方式
- 影响面判定：本次改动触达前端交互 + 后端 API + 数据访问层 + 调度清理，需执行构建验证。
- 执行命令：
  - `pnpm --filter @nextclaw/digital-employee build`
- 结果：通过（Nuxt build 成功，包含新增路由产物 `api/employees/_id_.patch` 与 `api/employees/_id_.delete`）。
- 冒烟（建议执行）：
  - 在员工列表创建一个测试员工后，执行编辑并保存，检查详情页与 `SOUL.md/IDENTITY.md` 及相关工作区文件更新。
  - 执行删除，确认员工从列表消失且其工作区目录被移除。

## 发布/部署方式
- 本次为 `@nextclaw/digital-employee` 应用内功能迭代。
- 按既有前端/应用发布流程完成构建产物发布；若仅本地验证，可直接 `dev` 运行验收，无额外 migration。

## 用户/产品视角的验收步骤
- 打开员工中心，选中任一员工点击 `编辑`。
- 修改名称、职责、角色设定与自动任务，保存后刷新列表/详情确认生效；编码始终不可编辑。
- 在编辑页更新 `USER.md`/`HEARTBEAT.md` 内容，保存后到对应工作区文件检查内容已同步。
- 返回列表点击 `删除`，确认后该员工应被移除；再次访问该员工详情应返回不存在。

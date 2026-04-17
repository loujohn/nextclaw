# v0.15.38-user-management-header-and-name-unify

## 迭代完成说明

- 将用户管理页顶部改为项目内统一的 hero-section 头部样式，和安全中心、集成中心等菜单保持一致的视觉层级。
- 排查用户列表中“外部名称”的来源，确认同步链路里 `displayName` 已优先取外部姓名，因此列表再次展示 `externalName` 属于重复信息。
- 移除用户列表与同步资料弹窗中的“外部姓名”重复展示，用户侧统一只保留一个主展示姓名。

## 测试/验证/验收方式

- 执行：`cd packages/nextclaw-digital-employee && pnpm exec eslint app/pages/users/index.vue app/components/users/SyncProfileDialog.vue --ext .vue --rule 'max-lines: off' --max-warnings=0`
- 结果：通过。
- `build`/`tsc`：不适用。本次仅调整前端页面样式与展示内容，未触达构建链路、类型定义或运行时逻辑。

## 发布/部署方式

- 本次为前端页面展示优化，按项目既有前端发布流程发布 `nextclaw-digital-employee` 对应前端产物即可。
- 若仅本地验收，可启动数字员工应用并进入“用户管理”页面及“同步资料”弹窗确认效果。

## 用户/产品视角的验收步骤

1. 进入数字员工平台“用户管理”页面，确认顶部样式与其它菜单页一致，标题区为统一的 hero-section 风格。
2. 查看任意同步用户，确认列表只显示一个主姓名，不再出现“外部姓名：xxx”的重复文字。
3. 打开同步用户的“查看同步资料”弹窗，确认仍保留外部 ID、外部用户名、岗位等必要字段，但不再额外显示“外部姓名”。
4. 复查列表操作按钮、搜索框和表格布局未因顶部样式调整出现错位。
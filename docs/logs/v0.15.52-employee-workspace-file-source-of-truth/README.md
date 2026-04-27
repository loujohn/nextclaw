# v0.15.52 employee-workspace-file-source-of-truth

## 迭代完成说明（改了什么）

- 将数字员工工作区中的 `SOUL.md`、`IDENTITY.md` 调整为文件源：工作区初始化只在文件缺失时补种，不再在运行、聊天、心跳或员工信息更新时覆盖用户编辑内容。
- 扩展员工工作区可写文件白名单，允许通过工作区保存链路写入 `SOUL.md` 与 `IDENTITY.md`。
- 员工创建/编辑表单中的角色设定改为保存到 `SOUL.md`；旧的 DB `systemPrompt` 不再作为编辑后的运行人格来源。
- 员工概览的角色设定健康提示改为检查 `SOUL.md` 文件内容。
- 旧版单调度默认提示不再拼接 DB `systemPrompt`，运行时依赖工作区 bootstrap 文件提供员工上下文。
- 更新 employee-creator skill 文档，明确 `workspaceFiles` 可包含 `SOUL.md` 与 `IDENTITY.md`。

## 测试/验证/验收方式

```bash
pnpm -C packages/nextclaw-digital-employee exec vitest run tests/employee-workspace.test.ts tests/employee-workspace-file-service.test.ts
pnpm -C packages/nextclaw-digital-employee exec eslint --rule 'max-lines: off' --rule 'max-lines-per-function: off' 'server/engine/employee-workspace.ts' 'server/services/employee-lifecycle-service.ts' 'server/api/employees/[id]/workspace/[filename].put.ts' 'server/services/automation-service.ts' 'app/composables/useEmployeeCrud.ts' 'app/components/employees/EmployeeFormSlideOver.vue' 'app/components/employees/JobFormDialog.vue' 'tests/employee-workspace.test.ts' 'tests/employee-workspace-file-service.test.ts'
pnpm -C packages/nextclaw-digital-employee tsc
```

- 结果：5 个测试通过。
- 结果：定向 ESLint 通过。
- 结果：包级类型检查通过。
- 冒烟：在 `/tmp` 隔离目录模拟“初始化 → 用户编辑 `SOUL.md`/`IDENTITY.md` → 再次初始化”，确认两个文件均保持用户编辑内容。
- 覆盖点：
  - `ensureEmployeeWorkspace()` 不再覆盖已存在的 `SOUL.md`、`IDENTITY.md`。
  - 工作区文件面板可编辑并保存 `SOUL.md`、`IDENTITY.md`。
  - 上传文件仍保持只读。

## 发布/部署方式

- 本次为 `packages/nextclaw-digital-employee` 内部前后端逻辑改动。
- 不涉及数据库 migration。
- 不涉及 NPM 包发布。
- 按数字员工应用常规流程构建并部署即可。

## 用户/产品视角的验收步骤

1. 创建或打开一个数字员工。
2. 在工作区中编辑 `SOUL.md` 或 `IDENTITY.md` 并保存。
3. 触发一次聊天、运行或心跳任务。
4. 回到工作区重新打开对应文件，确认保存后的内容没有被 DB 中的 `systemPrompt/name/description` 重新覆盖。
5. 新建员工时填写角色设定，确认初始 `SOUL.md` 包含该角色设定。

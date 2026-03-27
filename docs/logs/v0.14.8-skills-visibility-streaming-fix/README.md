# v0.14.8 — Skills 更新/可见性 + 流式渲染修复

## 迭代完成说明

本次迭代修复数字员工系统三项核心问题：

### 1. 内置 Skills 强制覆盖（A1 + A2）
- `seedBuiltinSkills()` 移除 `existsSync` 跳过检查，改为 `cpSync(..., { force: true })` 强制覆盖
- `seed-skills.ts` 同步移除跳过检查，开发模式用 `force: true`，生产模式先 `rmSync` 再写入
- 函数返回 `Set<string>` 内置 skill 名称集合，供后续冲突检测使用

### 2. 导入同名冲突拒绝（A3）
- `importFromLocalPath()` 增加 `builtinSkillNames.has(skillName)` 检查
- 导入与内置 skill 同名的外部 skill 时抛出明确错误
- `importFromGit()` 内部调用 `importFromLocalPath()`，自动继承检查

### 3. Skills 可见性过滤（A4）
- `buildSkillsSummary(filterNames?: string[])` 新增可选参数
- 传入 `filterNames` 时，仅列出匹配的 skills 给 agent
- `buildSystemPrompt()` 将 `skillNames` 传递给 `buildSkillsSummary()`
- 员工只能"看见"全局启用 + 自身绑定的技能

### 4. 前端流式渲染重构（B1）
- 新增 `streamingMessages` + `isStreaming` 响应式状态
- 新增 `displayMessages` 计算属性，流式期间显示实时消息
- 处理 `session_event`：根据 role 动态构建 assistant/tool 消息气泡
- 处理 `delta`：实时追加到 pending assistant 消息
- 处理 `done`：用服务端完整数据替换
- Typing indicator 仅在等待首个 assistant 响应时显示

## 改动文件

| 文件 | 改动说明 |
|------|----------|
| `packages/nextclaw-core/src/agent/skills.ts` | `buildSkillsSummary` 增加 `filterNames` 过滤 |
| `packages/nextclaw-core/src/agent/context.ts` | 传递 `skillNames` 给 `buildSkillsSummary()` |
| `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts` | 强制覆盖内置 skills、保存名称集合、导入冲突检查 |
| `packages/nextclaw-digital-employee/server/plugins/seed-skills.ts` | 强制覆盖自定义 skills |
| `packages/nextclaw-digital-employee/app/pages/employees/[id]/chat.vue` | 流式渲染重构 |

## 测试/验证/验收方式

- `pnpm -C packages/nextclaw-core build` — 通过
- `pnpm -C packages/nextclaw-digital-employee build` — 通过

### 冒烟验证清单
- [ ] Skills 更新：修改内置 skill SKILL.md → 重启 → 确认 workspace/skills/ 已更新
- [ ] Skills 可见性：员工绑定 1 个 skill → 对话问技能 → 只回答绑定的
- [ ] 导入冲突：尝试导入内置同名 skill → 应报错
- [ ] 流式渲染：发送需要工具调用的指令 → 观察实时渲染顺序

## 发布/部署方式

本次为代码变更，涉及 `@nextclaw/core` 和 `nextclaw-digital-employee`，需通过 changeset 流程发布。

## 用户/产品视角验收步骤

1. 启动 dev server，确认控制台有 `[seed-skills] installed from source` 日志
2. 打开员工对话页，发送消息，观察实时流式渲染（思考 → 工具调用 → 回复逐字出现）
3. 确认不再有重复的 assistant 消息气泡
4. 在技能管理页创建员工，仅绑定特定技能，对话确认 agent 只知道绑定的技能

## 相关设计文档

- [设计 Spec](../../superpowers/specs/2026-03-27-digital-employee-three-fixes-design.md)
- [实现计划](../../superpowers/plans/2026-03-27-digital-employee-three-fixes.md)

# v0.15.61 — 修复 `shared/chat-command` import 路径导致的 build 失败

## 一、迭代完成说明（改了什么）

### 背景

在 v0.15.60（代理引导覆盖 fetch 路径）之后做 `pnpm build` 验证时，
发现 Nitro server bundle 阶段直接失败：

```
[nitro] ERROR RollupError: Could not resolve
  "../packages/nextclaw-digital-employee/shared/chat-command.ts"
  from ".nuxt/dist/server/_nuxt/chat-Jlcy8k5L.js"
```

经过回归验证（回退到 `d9cb6680`，即 Revert 旧版 NO_PROXY 之后的干净
提交，并清空 `.nuxt` / `node_modules/.cache`），**相同错误同样复现**，
确认该失败与代理相关 commit（`cecd9534` / `c0c11b95`）无关，是
v0.15.60 之前就潜伏的预存 bug。

### 根因

`app/lib/employee-chat-store-controller.ts:8` 此前使用相对路径

```
import { isConversationResetCommand } from "../../shared/chat-command";
```

import 了根目录 `shared/` 下的 TS 文件。Nuxt 4 + Nitro 2.13 在
server 侧的 Rollup bundle 阶段，对"app 侧相对路径 + 原始 `.ts` 扩
展名"组合的解析存在 corner case，该路径最终会被写成绝对形式
`../packages/nextclaw-digital-employee/shared/chat-command.ts` 交给
Rollup，而 Rollup 无法解析到对应的源文件。

类对比：
- `app/components/ResultCard.vue`、`app/components/employee/
  EmployeeWorkspacePanel.vue` 等其它 app 侧组件 import `shared/*`
  时均使用 Nuxt root alias `~~/shared/...`，**无一例外均正常**。
- 仅此一处采用了相对路径写法，属于引入时的不一致。

### 本次改动（仅 1 行）

- `packages/nextclaw-digital-employee/app/lib/employee-chat-store-controller.ts`
  将第 8 行 `from "../../shared/chat-command"` 修正为
  `from "~~/shared/chat-command"`，与 app 侧其它 shared import 风格
  对齐。

范围最小化原则：
- 同文件第 7 行 `"../../shared/ui-models"` 虽同属相对路径，但未触发
  build 失败，且涉及较多具名 + 类型 import，本次不改，避免扩大风险面
  与无关噪音；后续若出现同类问题可一次性做风格对齐迭代。
- server 侧（`server/runtime/channel-runtime.ts`、
  `server/services/employee-run-service.ts`）的相对路径 import 不
  在 Nitro bundle 出问题的位置，保持原状。

## 二、测试 / 验证 / 验收方式

### Build 回归（关键）

```bash
rm -rf packages/nextclaw-digital-employee/.nuxt \
       packages/nextclaw-digital-employee/.output \
       packages/nextclaw-digital-employee/node_modules/.cache \
       node_modules/.cache/nuxt
pnpm -C packages/nextclaw-digital-employee build
```

预期：
- 不再出现 `RollupError: Could not resolve
  "../packages/nextclaw-digital-employee/shared/chat-command.ts"`。
- 终端以 `✨ Build complete!` 结束，exit code = 0。
- `.output/server/index.mjs` 正常生成。

实测（本次提交前）：
- exit=0；`Σ Total size: 35.2 MB (9.08 MB gzip)`；`Build complete`。

### 冒烟（运行时）

该改动不改变运行时行为，仅调整 import 解析路径：

- `isConversationResetCommand` 的符号来源未变，调用语义不变；
- 相关单测 `tests/chat-command.test.ts` 的 import 未改动，沿用相对
  路径（test 环境 Vitest 不走 Nitro bundle，无此 bug）。

### 验证命令一览

- `pnpm -C packages/nextclaw-digital-employee build`：通过
- `pnpm -C packages/nextclaw-digital-employee exec vitest run tests/chat-command.test.ts`：
  可作为回归补充（非本次必须）

## 三、发布 / 部署方式

常规流程，无新增依赖、无数据库迁移、无环境变量变更：

```bash
pnpm install   # 无 lockfile 变更，若 CI 开启 --frozen-lockfile 会零漂移
pnpm -C packages/nextclaw-digital-employee build
```

## 四、用户 / 产品视角验收步骤

1. 基于最新主干重新打一次镜像（或本地 `pnpm build`），应当成功出包。
2. 启动服务后，进入员工聊天页面，尝试一次 `/new`（或其他重置命令）
   与非重置命令的混合对话，确认命令能被正确识别、会话能够按预期
   重置或延续，即证明 `isConversationResetCommand` 通过新 alias
   路径被正确解析、业务行为未受影响。

---

## 相关文件

- [app/lib/employee-chat-store-controller.ts](../../../packages/nextclaw-digital-employee/app/lib/employee-chat-store-controller.ts)
- [shared/chat-command.ts](../../../packages/nextclaw-digital-employee/shared/chat-command.ts)

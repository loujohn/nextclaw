# v0.14.15 — 修复数字员工"在线状态"三大缺陷

## 迭代完成说明

### 背景
员工列表卡片的"在线状态"通过 `EmployeeCard.vue` 的 `getActivityStatus` 函数计算，
依据最近一次 run 的 `finishedAt` 时间差展示"刚刚活跃 / X分钟前 / 离线"等状态。
用户反馈存在两类异常：
1. 对话后状态不更新
2. 重启后显示"离线"

经排查，共发现 **3 个独立缺陷**：

---

### Bug 1（服务端）：重启后 stuck 残留 → 显示"离线"
**根因**：服务进程崩溃/重启时，进行中的 run（`status=running`, `finished_at=null`）
永久残留在数据库。重启后 `/api/employees` 返回的 `latestRun.finishedAt=null`，
`getActivityStatus` 判断为"离线"。

**修复**：
- 在 `RunStatus` 枚举新增 `Interrupted = "interrupted"`
- `RunRecordRepository` 新增 `recoverRunningRuns()` 方法，将所有 `running` 状态 run
  更新为 `interrupted`，同时写入 `finished_at`
- `platform-context.ts` 启动时（migration 之后、automation 启动之前）调用
  `runRepo.recoverRunningRuns()`，日志打印恢复条数

---

### Bug 2（前端）：正在执行的对话也显示"离线"
**根因**：`EmployeeCardData.latestRun` 类型只含 `finishedAt`，不含 `status`。
当一次 run 正在执行（`finishedAt=null, status=running`）时，卡片无法区分
"从没运行过" 和 "正在运行"，均显示"离线"。

**修复**：
- `EmployeeCard.vue` 的 `EmployeeCardData.latestRun` 类型增加 `status?: string`
- `getActivityStatus` 优先判断 `status === "running"`，显示"运行中"（紫色）

---

### Bug 3（前端）：员工列表无自动刷新 → 对话完成后状态不更新
**根因**：`employees/index.vue` 仅在挂载时请求一次 `/api/employees`，无轮询机制。
对话在 `chat.vue` 完成后，员工列表页看不到新的 `latestRun`。

**修复**：
- `employees/index.vue` 新增 `onMounted` + `onUnmounted` 钩子，
  每 30 秒自动调用 `refresh()` 刷新员工列表数据

---

### 附加修复：`formatRunStatus` 处理 `interrupted` 状态
- `shared/ui-models.ts` 的 `formatRunStatus` 新增 `interrupted` → "已中断"（slate 色调），
  防止运行记录列表显示"等待中"误导用户

---

## 测试/验证方式

### 自动化验证
```bash
cd packages/nextclaw-digital-employee
pnpm tsc --noEmit
# 应无新增错误（已有预存错误与本次改动无关）
```

### 冒烟测试（人工）

**测试 Bug 1（重启修复）：**
1. 与任意员工发起对话
2. 在对话响应期间强制关闭 Nuxt 服务进程（`kill -9`）
3. 重新启动服务
4. 打开员工列表，确认该员工显示的是"X分钟前"而非"离线"
5. 检查服务启动日志：应出现 `Recovered N interrupted run(s)`

**测试 Bug 2（运行中状态）：**
1. 发起一次耗时较长的对话
2. 在对话执行期间切换到员工列表
3. 确认该员工显示"运行中"（紫色点），而非"离线"（灰色）

**测试 Bug 3（自动刷新）：**
1. 在一个标签页打开员工列表
2. 在另一标签页与该员工对话并完成
3. 不刷新员工列表标签页，等待至多 30 秒
4. 确认该员工状态自动更新为"刚刚活跃"

---

## 发布/部署方式

纯应用代码变更，无数据库 migration，不涉及 npm 包发布。
重启 Nuxt 服务即生效（本地 `pnpm dev`，Docker `docker-compose restart`）。

---

## 用户/产品视角的验收步骤

1. 重启服务后，员工列表不再出现意外的"离线"状态
2. 员工正在执行对话时，卡片显示"运行中"而非"离线"
3. 完成一次对话后，无需手动刷新，员工卡片状态在 ≤30 秒内自动更新
4. 运行记录列表中，因重启中断的 run 显示"已中断"而非"等待中"

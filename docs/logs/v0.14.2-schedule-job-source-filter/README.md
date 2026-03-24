# v0.14.2 — 定时任务来源追踪与筛选

## 迭代完成说明

本迭代完成 5 项变更，围绕「定时任务」功能的访问收口与运行记录可观测性提升。

### 1. 屏蔽员工新增/编辑弹窗中的「自动任务」步骤

- `app/pages/employees/index.vue`
  - 向导步骤数组从 4 步缩减为 3 步，移除 `{ title: "自动任务", desc: "设置定时执行的工作" }`
  - 自动任务功能入口统一收口到「定时任务」模块，不再在员工创建/编辑向导中暴露

### 2. 员工列表卡片移除运行时间与类型显示

- 同文件：删除员工卡片中的 `employee-card__schedule` div（原含 Clock 图标 + `formatScheduleSummary` 调用）

### 3. 后端记录定时任务来源（trigger_source 存 job UUID）

- `server/services/automation-service.ts`
  - ejob 格式定时触发时：`triggerSource: schedJob.id`（存储 EmployeeScheduleJob 的 UUID，替换原来的 `"cron"` 字符串）
  - 无需 DB migration，`trigger_source` 本为文本字段，向后兼容

### 4. 共享模型 & API 全链路传递 scheduleJobName

- `shared/ui-models.ts`
  - `RunListInput.jobs?: Array<{ id: string; name: string }>` 新增可选字段
  - `RunListEntryView.scheduleJobName: string | null` 新增展示字段
  - `buildRunListEntries` 内部构建 job name map，按 `triggerSource` UUID 查找名称

- `server/repositories/run-record-repository.ts`
  - `listPagedByEmployeeId` 新增 `scheduleJobId?: string` 可选筛选参数

- `server/api/runs/index.get.ts`
  - 并行加载 `listAllEnabled()` jobs，传入 `buildRunListEntries`

- `server/api/employees/[id]/runs.get.ts`
  - 新增 `jobId` 查询参数（UUID 正则严格校验，防 SQL 注入）
  - 并行加载员工 jobs，透传给 `buildRunListEntries`，支持按定时任务过滤

- `server/api/runs/[id].get.ts`
  - 并行拉取 employee + scheduleJob，详情响应中新增 `scheduleJobName` 字段

### 5. 员工运行记录页增加来源展示 & 筛选

- `app/pages/employees/[id]/runs.vue`（完整重写）
  - 新增 `jobFilter` 状态，发起 `/api/employees/${id}/jobs` 请求获取 job 列表
  - 当该员工存在多个 job 时，顶部展示来源过滤栏（全部来源 + 各 job 按钮）
  - 运行卡片 Meta 行新增 `· jobName`（高亮主色）
  - 详情侧滑面板新增「来源定时任务」区域（`CalendarClock` 图标 + 主色边框卡片）

### 6. 全局运行中心页增加来源展示

- `app/pages/runs/index.vue`
  - `RunItem` / `RunDetailPayload.data` 类型新增 `scheduleJobName: string | null`
  - 运行卡片 Meta 行：`触发方式 · jobName（主色）· 时间`
  - 详情侧滑面板在 Meta Grid 后新增「来源定时任务」区域（同员工运行记录样式）
  - 新增 `CalendarClock` 图标导入

---

## 测试 / 验证 / 验收方式

### 自动化验证

```bash
cd packages/nextclaw-digital-employee
npx vitest run
```

所有测试（129 条）应全部通过，无回归。

### 冒烟验证路径

| 场景 | 操作 | 预期 |
|------|------|------|
| 员工向导步骤 | 点击「新增员工」 | 仅显示 3 步，不含"自动任务"步骤 |
| 员工列表卡片 | 查看员工卡片 | 不显示运行时间/类型信息 |
| 定时任务触发 | 等待或手动触发一次定时任务 | 运行记录 `trigger_source` 存储 job UUID |
| 员工运行记录页 | 打开员工运行记录，选择有多个 job 的员工 | 顶部显示来源过滤栏，选中某 job 后列表刷新 |
| 员工运行记录 — 详情 | 点开一条定时触发的记录 | 侧滑详情显示「来源定时任务」区域及 job 名称 |
| 运行中心列表 | 打开运行中心 | 定时触发的卡片 Meta 行显示 `· jobName（主色）` |
| 运行中心 — 详情 | 点开一条定时触发的记录 | 侧滑详情显示「来源定时任务」区域 |

---

## 发布 / 部署方式

本迭代为纯前端 + 后端逻辑改动，**无 DB migration**（`trigger_source` 字段已存在，无新增列）。

1. 合并到主分支
2. 执行前端构建 / 平台重启（按现有发布流程）
3. `/release-frontend` 或按 CI/CD 流程发布

---

## 用户 / 产品视角的验收步骤

1. **员工管理**：新增或编辑员工时，向导中不再出现「自动任务」步骤；员工卡片不再显示运行时间信息。
2. **定时任务功能入口收口**：所有定时调度配置统一通过「定时任务」模块管理。
3. **运行记录可读性**：所有由定时任务触发的运行记录，在员工运行记录和运行中心列表中，Meta 行均显示来源 job 名称。
4. **详情追溯**：打开任意一条定时触发的运行详情，可见「来源定时任务」区域，明确标注是哪个定时任务触发的。
5. **按 job 筛选**：在员工运行记录页，当员工配置了多个定时任务时，可通过顶部来源过滤栏，快速筛选某定时任务的历史运行记录。

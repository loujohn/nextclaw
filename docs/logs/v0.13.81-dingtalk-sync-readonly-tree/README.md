# v0.13.81 — 钉钉组织同步：定时/手动触发 + 只读部门树 + 成员图标展示

## 迭代完成说明

### 新增后端

| 文件 | 说明 |
|------|------|
| `server/api/org/sync-trigger.post.ts` | `POST /api/org/sync-trigger` — 手动触发钉钉同步；内部调用 `runOrgSync()`，失败时返回 500 + 错误摘要 |
| `server/api/org/human-employees.get.ts` | `GET /api/org/human-employees[?departmentId=]` — 查询人类员工列表，支持按部门过滤 |

（`GET/PATCH /api/org/sync-config` 及 `OrgSyncService`、`OrgSyncConfigRecord` 等在上一轮 v0.13.80 中已完成）

### 前端改造

#### `DepartmentTreeNode.vue`（全面 重构）
- **移除**：`Plus/Pencil/Trash2` 导入及 `addChild/edit/delete` emit；操作按钮 hover 组
- **新增**：`Bot`、`User` 图标导入；`humanMembers`/`digitalMembers` 可选 props；选中节点时在行下方渲染成员 chips —— 蓝色 `Bot` 图标 = 数字员工，灰色 `User` 图标 = 人类员工

#### `DepartmentTree.vue`（全面重构）
- **移除**：全部 CRUD 逻辑（新增/编辑/删除部门弹窗、对应 state/函数、`Plus/Pencil/Trash2` 导入）
- **新增**：
  - 导出类型 `HumanMemberBrief`、`DigitalMemberBrief`（供父组件做 map 聚合）
  - 头部"同步"按钮（`RefreshCcw`），带 loading 自旋动画
  - 二次确认弹窗（点击"同步"后弹出，说明将覆盖组织数据、不影响数字员工）
  - 调用 `POST /api/org/sync-trigger`，成功/失败均通过 toast 提示
  - `humanMembers`/`digitalMembers` props 透传给 `DepartmentTreeNode`

#### `employees/index.vue`
- **新增 fetch**：`GET /api/org/human-employees` → `humanEmployeePayload`
- **新增 computed**：
  - `humanMembersMap`：`Record<deptId, HumanMemberBrief[]>`
  - `digitalMembersMap`：`Record<deptId, DigitalMemberBrief[]>`
- **更新 `DepartmentTree` 绑定**：传入 `:human-members` / `:digital-members`；`@refresh` 事件同时调用 `refreshHumanEmployees()`

---

## 测试/验证

### 类型检查
所有改动文件通过 Vue Language Tools 类型检查（`get_errors` 结果：No errors found）：
- `DepartmentTree.vue` ✅
- `DepartmentTreeNode.vue` ✅
- `employees/index.vue` ✅
- `sync-trigger.post.ts` ✅
- `human-employees.get.ts` ✅

### 冒烟验证清单（人工执行）
1. 进入"员工中心"页面 → 左侧部门树头部应显示"同步"按钮，不再有"新增"按钮
2. 点击"同步" → 弹出确认弹窗；取消后不执行同步
3. 点击"确认同步"（已配置 AppKey/Secret 前提下）→ 按钮显示转圈动画 → 完成后 toast 提示"组织同步成功"
4. 未配置 AppKey/Secret 时触发同步 → toast 应显示错误信息
5. 选中一个有成员的部门节点 → 该行下方显示成员 chips；数字员工蓝色 Bot 图标，人类员工灰色 User 图标
6. `GET /api/org/human-employees` 返回 `{ ok: true, data: [...] }` 格式

---

## 发布方式

纯前端 + 服务端路由变更，无数据库 schema 改动（新表 `org_sync_config`/`human_employees` 已在 v0.13.80 完成）：

```bash
# platform-console 前端发布（仅 UI 变更）
pnpm /release-frontend
```

后端路由随 Nuxt 服务重启自动生效，无需额外操作。

---

## 用户/产品验收步骤

1. **不再看到部门 CRUD 入口**：员工中心左侧组织树仅有"同步"按钮，无"新增/编辑/删除"操作
2. **同步体验**：点击"同步" → 确认弹窗 → 执行中转圈 → toast 反馈成功或失败原因
3. **成员可视化**：展开并选中任意部门，行下显示该部门下的数字员工（蓝 Bot）和人类员工（灰 User）chips
4. **员工列表**：右侧员工列表仍只展示数字员工（历史行为无变化）

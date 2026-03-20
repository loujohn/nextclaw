# v0.13.80 — 组织部门与人类员工数据同步

## 迭代完成说明

### 改了什么

本次迭代基于钉钉组织数据（`dingtalk_org_data.json`）对 **数字员工平台** 的数据模型与 API 进行扩展：

#### 1. 部门数据结构调整

- **新增字段** `external_id`（`DepartmentRecord` & `DepartmentView`）：  
  存储外部系统（如钉钉）的 `dept_id`，用于跨系统同步时的稳定匹配 key，避免每次同步都重建 UUID，保持数字员工的部门关联不断链。
- **数据库迁移**：新安装自动包含该字段；已有数据库通过 `migrateAddDepartmentExternalId` 自动 ALTER。

#### 2. 新增"人类员工"（Human Employee）数据结构

新建 `human_employees` 表，字段包括：

| 字段 | 说明 |
|---|---|
| `id` | 内部 UUID |
| `external_id` | 外部系统用户 ID（钉钉 `userid`） |
| `name` | 姓名 |
| `avatar` | 头像 URL |
| `title` | 职位/职称 |
| `job_number` | 工号 |
| `active` | 是否在职 |
| `is_admin` | 是否管理员 |
| `is_boss` | 是否 Boss |
| `department_id` | 主部门（FK → `departments.id`，ON DELETE SET NULL） |
| `external_dept_ids` | 所属全部外部部门 ID（JSON 数组，备用） |
| `unionid` | 外部系统 unionid |

- 新增 `HumanEmployeeRepository`，包含批量创建、按部门查询、删除全部等方法。
- 在 API 响应中携带 `memberType: "human"` 字段，供前端与数字员工（`memberType: "digital"`）共同展示时区分。

#### 3. 人类员工与数字员工并列挂载部门

- 两类成员均通过 `department_id` 引用同一 `departments` 表，天然支持在组织树下混合展示。
- 删除部门时（`DELETE /api/departments/:id`）现在同时检查数字员工和人类员工数量，并在错误提示中分别显示计数。

#### 4. 组织数据全量同步 API

新增 `POST /api/org/sync`，接受钉钉标准组织导出格式并执行原子性全量替换：

**请求体结构（与钉钉导出 JSON 完全对齐）：**

```json
{
  "departments": [
    {
      "dept_id": 833787072,
      "name": "综合管理部",
      "parent_id": 1,
      "sub_depts": []
    }
  ],
  "users": {
    "15084461011267254": {
      "userid": "15084461011267254",
      "name": "鲁抗",
      "dept_id_list": [833787072],
      "avatar": "",
      "active": true,
      "admin": true
    }
  }
}
```

**同步逻辑（事务保证原子性）：**

1. **部门 Upsert（保留稳定 UUID）**：  
   按 `external_id` 匹配旧部门 → 匹配的保留 UUID 并 UPDATE（避免数字员工关联断链）；无匹配的新建 UUID + INSERT；不在新列表中的旧部门全部删除。

2. **人类员工全量替换**：  
   先删除全部旧人类员工，再按 `users` Map 批量创建；主部门 = `dept_id_list[0]` 对应的内部 UUID。

3. **数字员工部门兜底**：  
   被删除部门下挂载的数字员工，在事务中自动将 `department_id` 置 `null`（挂载到组织根目录）；事务后额外执行孤儿检查兜底。

**响应示例：**

```json
{
  "ok": true,
  "data": {
    "departments": { "created": 5, "updated": 20, "removed": 2 },
    "humanEmployees": { "created": 150 },
    "digitalEmployees": { "reassignedToRoot": 1 }
  }
}
```

### 涉及文件

| 文件 | 变更类型 |
|---|---|
| `server/db/schema.ts` | 修改 — 新增 `HumanEmployeeRecord`、`PLATFORM_TABLES.humanEmployees`、`DepartmentRecord.external_id` |
| `server/db/knex.ts` | 修改 — 新增建表 `createHumanEmployeesTable`、迁移 `migrateAddDepartmentExternalId` |
| `server/repositories/human-employee-repository.ts` | **新建** |
| `server/repositories/department-repository.ts` | 修改 — `DepartmentView.externalId`、`getByExternalId`、`mapByExternalId` |
| `server/runtime/platform-context.ts` | 修改 — 注册 `humanEmployeeRepo` |
| `server/api/org/sync.post.ts` | **新建** — `POST /api/org/sync` |
| `server/api/departments/[id].delete.ts` | 修改 — 同时检查人类员工数量 |

---

## 测试/验证

### 类型检查

```
# 7 个涉及文件全部 No errors
get_errors 验证通过
```

### 冒烟测试（调用 API）

启动 `nextclaw-digital-employee` 服务后：

```bash
# 同步组织数据
curl -X POST http://localhost:3031/api/org/sync \
  -H "Content-Type: application/json" \
  -d @/path/to/dingtalk_org_data.json

# 预期响应
# { "ok": true, "data": { "departments": {...}, "humanEmployees": {...}, "digitalEmployees": {...} } }

# 查看部门列表（应包含 externalId 字段）
curl http://localhost:3031/api/departments

# 部门节点数量应与 JSON 中 departments 展平后总数一致
```

---

## 发布/部署方式

- 纯后端服务代码变更（Nuxt server routes + SQLite 迁移）
- 服务重启后数据库自动执行迁移（`ensurePlatformDatabase` 幂等）
- 无需前端发布，无外部依赖变更

---

## 用户/产品视角的验收步骤

1. 调用 `POST /api/org/sync`，传入钉钉组织导出 JSON
2. 访问部门列表，确认部门数量与 JSON 中匹配，且均有 `externalId` 字段
3. 查询某部门成员，人类员工带 `memberType: "human"` 标识，数字员工带 `memberType: "digital"`（数字员工 type 由前端展示层区分）
4. 再次调用同步 API，确认已有数字员工的部门关联不变（Upsert 保留 UUID）
5. 传入精简版 JSON（删除部分部门），确认对应数字员工被自动移至根目录（`departmentId: null`）

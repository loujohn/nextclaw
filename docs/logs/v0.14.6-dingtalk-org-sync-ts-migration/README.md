# v0.14.6 — DingTalk 组织架构同步迁移至 TypeScript

## 迭代完成说明（改了什么）

### 背景

原来的组织架构同步依赖 Python 脚本 `scripts/dingtalk-org-sync.py`，通过 `child_process.spawn("python3", ...)` 调用该脚本获取数据，存在以下问题：
- 需要宿主环境安装 Python3 和 requests 库，增加运行时依赖
- 启动进程开销大，且错误信息不可控
- 无法在 TypeScript 体系内统一测试

### 本次改动

**新增：** `server/integrations/dingtalk-org-client.ts`

- 将原 Python 脚本完整迁移为 TypeScript 的 `DingTalkOrgClient` class
- 使用 `class` 封装状态（accessToken）和生命周期，通过静态工厂 `DingTalkOrgClient.create(appKey, appSecret)` 初始化
- 实现全部 API 方法：
  - `getDepartmentList(deptId)` — 获取子部门列表
  - `getDepartmentUsers(deptId, cursor, size)` — 分页获取部门成员
  - `getUserDetail(userid)` — 获取用户详情（不存在返回 `null`）
  - `getAllDepartmentsRecursive(deptId, parentPath)` — 递归构建部门树
  - `fetchAllOrgData()` — 拉取完整组织数据（部门树 + 用户详情），直接返回 `DingTalkOrgData` 对象
- 跨部门重复用户只获取一次详情（去重）
- 分页拉取用户，含 `has_more` 支持
- 内置 100ms 间隔防频率限制

**修改：** `server/services/org-sync-service.ts`

- 移除 `spawn("python3", ...)` 调用及 `runPythonScript()` 函数
- 移除对 `node:child_process` 和 `node:path` 的依赖
- 改为直接调用 `DingTalkOrgClient.create()` + `client.fetchAllOrgData()` 获取组织数据
- 错误提示从"脚本执行失败"改为"拉取钉钉组织数据失败"，语义更准确

**新增测试：** `tests/dingtalk-org-client.test.ts`

- 使用 `vi.stubGlobal("fetch", vi.fn())` mock 全局 fetch
- 覆盖 13 个测试用例，完整覆盖各方法的正常路径和异常路径：
  - `create()` 成功/errcode 非 0/HTTP 500
  - `getDepartmentList()` 正常/接口错误
  - `getDepartmentUsers()` 分页
  - `getUserDetail()` 正常/用户不存在
  - `getAllDepartmentsRecursive()` 两层递归/无子部门
  - `fetchAllOrgData()` 完整流程/用户去重/分页拉取

---

## 测试 / 验证 / 验收方式

```bash
# 单独运行新测试文件
pnpm --filter @nextclaw/digital-employee test -- tests/dingtalk-org-client.test.ts

# 全量测试回归（150 tests, 13 files, all passed）
pnpm --filter @nextclaw/digital-employee test
```

结果：

```
Test Files  13 passed (13)
     Tests  150 passed (150)
```

TypeScript 类型检查：

```bash
pnpm --filter @nextclaw/digital-employee tsc --noEmit
```

---

## 发布 / 部署方式

- 本迭代为内部实现替换，不涉及 API 变更，无需额外 migration
- 部署方式与正常 `@nextclaw/digital-employee` 部署流程一致（Docker 构建或 Nuxt 启动）
- 不需要额外安装依赖（使用内置 `globalThis.fetch`，Node.js 18+ 原生支持）

---

## 用户 / 产品视角验收步骤

1. 进入平台 **组织管理 → 组织架构同步** 页面，配置钉钉 AppKey/AppSecret
2. 点击"立即同步"按钮，观察同步结果：
   - 成功时：显示已同步的部门数和员工数
   - 失败时：错误信息应为"拉取钉钉组织数据失败: ..."（非"脚本执行失败"）
3. 验证自动同步（cron）：配置定时规则后启用，等待预定时刻执行，观察"最近同步时间"和"状态"字段更新
4. 验证部门树和人类员工数据与钉钉后台一致

# v0.2.0-generic-webhook-trigger

## 迭代完成说明

将 GitLab Code Review 的硬编码 webhook 端点重构为通用 Webhook 触发器系统。平台作为"HTTP 请求 → 员工消息"的纯管道，不解析 payload、不关心来源，所有业务智能由 Skill/AI 驱动。

每个数字员工自动拥有一个确定性的 webhook URL（基于 employee code），无需额外创建。

### 核心改动

| 改动 | 说明 |
| --- | --- |
| `employees` 表新增 2 个字段 | `webhook_enabled`（是否启用）、`webhook_secret`（验证密钥） |
| 新增通用接收端点 `POST /api/webhooks/e/:code` | 验证 → 路由 → 转发 payload 给员工（异步） |
| 删除 `server/api/webhooks/gitlab.post.ts` | 移除硬编码 GitLab webhook 处理逻辑（~317 行） |
| 增强 `gitlab-code-review/SKILL.md` | 新增 Webhook 事件解析章节，让 AI 自行判断事件类型和处理逻辑 |
| 前端：员工配置页新增 Webhook 卡片 | 显示 webhook URL（可复制）、启用/禁用 toggle、secret 配置 |

### 架构

```
外部系统 (GitLab / GitHub / Jira / 任意)
    │ POST /api/webhooks/e/:employeeCode(?token=xxx)
    ▼
通用 Webhook Handler (~50 行)
    ├── 按 :code 查 employee → 检查 webhook_enabled
    ├── 验证 secret（如果已配置）
    ├── 构造消息(headers + body)
    └── 异步 runEmployeeTurn(triggerType: "webhook")
              │
              ▼
         数字员工 (AI)
         根据自身 Skill 判断如何处理 payload
```

### 数据模型变更

```sql
-- employees 表新增字段
ALTER TABLE employees ADD webhook_enabled INT DEFAULT 0;
ALTER TABLE employees ADD webhook_secret VARCHAR(500);
```

无需新建表。每个员工自动拥有一个 webhook URL：`/api/webhooks/e/{employee.code}`。

### API

#### 接收端点（公开，无 JWT）

```
POST /api/webhooks/e/:code
POST /api/webhooks/e/:code?token=xxx
```

- 验证方式：query param `token` 或 header `x-webhook-secret` 匹配 `webhook_secret` 字段
- 响应：`200 { ok: true, message: "Webhook received" }`（异步处理）

#### 管理（复用员工更新 API）

webhook 配置作为员工属性的一部分，通过现有的员工更新 API 管理：

```
PATCH /api/employees/:id  → body: { webhookEnabled?, webhookSecret? }
```

### 转发给员工的消息模板

```
你收到了一个外部 Webhook 请求，请根据你的技能分析并处理。

## 请求头
{headers JSON, 过滤敏感头}

## 请求体
{body JSON}
```

### 前端 UI（员工配置页 Webhook 卡片）

在员工配置页新增一个"Webhook 触发器"卡片：
- 显示该员工的 webhook URL（自动生成，可一键复制）
- 启用/禁用 toggle
- Secret 输入框（可选）
- 使用提示：将此 URL 配置到 GitLab/GitHub 等外部系统的 webhook 设置中

### SKILL.md 改造

在 `skills/gitlab-code-review/SKILL.md` 新增 Webhook 事件处理章节：

```markdown
## Webhook 事件处理

当你收到外部 Webhook 请求时：
1. 识别来源：检查请求头 x-gitlab-event → GitLab
2. 事件过滤：
   - merge_request + action in [open, update, reopen] → 执行 MR Review
   - push → 执行 Push Review
   - 其他 → 回复"已忽略"
3. 提取关键信息：project.id, object_attributes.iid, 分支信息等
4. 执行 Code Review 流程
```

### 错误处理

| 场景 | HTTP 状态码 | 说明 |
| --- | --- | --- |
| employee 不存在 | 404 | 防止枚举 |
| webhook 未启用 | 404 | 同上 |
| secret 验证失败 | 401 | 拒绝 |
| AI 执行失败 | 200（异步失败记录日志） | 不影响 webhook 响应 |

### 设计原则

1. **平台无感知**：平台不关心 payload 来源、格式、事件类型
2. **AI 驱动处理**：所有业务逻辑在 Skill/AI 中，平台只做管道
3. **与定时任务一致**：webhook 是另一种触发方式，复用 `runEmployeeTurn` 和 `run_records`
4. **异步处理**：webhook 接收立即返回，避免外部系统超时重试
5. **一员工一 webhook**：URL 确定性生成，无需额外创建/管理

---

## 测试/验证方式

### 1. 启用员工 webhook

通过 API 或前端 UI 为 `code-reviewer` 员工启用 webhook 并设置 secret。

### 2. 端点验证

```bash
curl -X POST "http://localhost:3031/api/webhooks/e/code-reviewer?token={secret}" \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Event: Push Hook" \
  -d '{"object_kind":"push","project":{"id":1,"name":"test","path_with_namespace":"test/repo","web_url":"https://gitlab.example.com/test/repo"},"before":"abc","after":"def","ref":"refs/heads/main","commits":[]}'
```

预期：`200 { ok: true, message: "Webhook received" }`

### 3. AI 处理验证

检查 `code-reviewer` 员工的运行记录，确认：
- `triggerType` 为 `"webhook"`
- AI 正确识别了 GitLab 事件类型
- AI 按 skill 流程执行了 Code Review

### 4. 安全验证

```bash
# 错误 token → 401
curl -X POST "http://localhost:3031/api/webhooks/e/code-reviewer?token=wrong" \
  -H "Content-Type: application/json" \
  -d '{}'

# webhook 未启用 → 404
curl -X POST "http://localhost:3031/api/webhooks/e/some-employee" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 发布/部署方式

1. 执行 DB migration（employees 表新增 2 个字段）
2. 部署新代码
3. 在前端或 API 中为目标员工启用 webhook 并设置 secret
4. 将 webhook URL 配置到 GitLab/GitHub 等外部系统

---

## 用户验收步骤

### 场景 1：通过 UI 启用 Webhook

1. 进入员工详情 → 配置 Tab
2. 在 Webhook 触发器卡片中开启"启用 Webhook"
3. 设置 Secret（可选）
4. 复制显示的 webhook URL
5. 将 URL 配置到 GitLab 项目的 Webhook 设置中

### 场景 2：GitLab MR 自动触发

1. 在 GitLab 创建一个 MR
2. 等待 10-30 秒
3. 检查员工运行记录：确认有 `triggerType: webhook` 的记录
4. 检查 MR 页面：确认有 AI 发的 review 评论

### 场景 3：向后兼容

1. 确认旧的 `POST /api/webhooks/gitlab` 端点已删除
2. 确认所有 webhook 通过新的通用端点 `/api/webhooks/e/:code` 处理

### 场景 4：安全

1. 使用错误的 token 发送请求 → 返回 401
2. 向未启用 webhook 的员工发送请求 → 返回 404

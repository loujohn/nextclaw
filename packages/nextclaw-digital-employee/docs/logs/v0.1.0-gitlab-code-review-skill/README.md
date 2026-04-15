# v0.1.0-gitlab-code-review-skill

## 迭代完成说明

为数字员工平台新增 GitLab Code Review 内置技能，实现代码提交到 GitLab 时自动触发 AI Code Review。

### 新增文件

| 文件                                              | 说明                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `skills/gitlab-code-review/SKILL.md`              | Code Review 技能定义，包含评审标准、执行流程、评论格式规范                                          |
| `skills/gitlab-code-review/scripts/gitlab-api.py` | GitLab API Python 脚本，支持获取 diff、发表行级/总体评论                                            |
| `server/api/webhooks/gitlab.post.ts`              | GitLab Webhook 接收端点（`POST /api/webhooks/gitlab`）                                              |
| `.env.example`                                    | 新增 GitLab 配置项（GITLAB_URL、GITLAB_TOKEN、GITLAB_WEBHOOK_TOKEN、GITLAB_REVIEWER_EMPLOYEE_CODE） |

### 架构

```
GitLab (Push/Merge Request)
    │ POST /api/webhooks/gitlab
    │ (X-Gitlab-Token 验证)
    ▼
webhook 端点解析事件 → 构建 review prompt
    │
    ▼
employeeRunService.runEmployeeTurn() (异步)
    │
    ▼
数字员工加载 gitlab-code-review skill
    ├── 调用 gitlab-api.py get-diff 获取代码变更
    ├── AI 分析代码（安全性/质量/性能/可维护性/业务逻辑）
    ├── 调用 gitlab-api.py post-comment 发表行级评论
    └── 调用 gitlab-api.py post-note 发表总体 review 报告
```

### 触发事件

- **Merge Request**: `open`、`update`、`reopen` 动作触发（忽略 `merge`、`close`）
- **Push**: 推送到任意分支触发

### 密钥管理

GitLab 凭据通过平台「密钥管理」或环境变量存储：

| 密钥 Key                        | 说明                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `GITLAB_URL`                    | GitLab 实例地址                                      |
| `GITLAB_TOKEN`                  | GitLab Personal Access Token（需 api 权限）          |
| `GITLAB_WEBHOOK_TOKEN`          | Webhook Secret Token（用于验证请求来源）             |
| `GITLAB_REVIEWER_EMPLOYEE_CODE` | 负责 code review 的员工 code（默认 `code-reviewer`） |

---

## 测试/验证方式

### 1. Webhook 端点验证

```bash
# 测试端点是否可达（无 token 验证）
curl -X POST http://127.0.0.1:3031/api/webhooks/gitlab \
  -H "Content-Type: application/json" \
  -d '{"object_kind":"push","project":{"id":1,"path_with_namespace":"test/repo"},"before":"abc","after":"def","ref":"refs/heads/main"}'

# 预期返回: {"ok":true,"message":"Code review triggered",...} 或员工不存在错误
```

### 2. GitLab API 脚本验证

```bash
cd skills/gitlab-code-review

# 测试获取 MR diff
export GITLAB_URL=https://gitlab.example.com
export GITLAB_TOKEN=glpat-xxx
python scripts/gitlab-api.py get-diff --project-id 123 --mr-iid 1

# 测试获取 Push diff
python scripts/gitlab-api.py get-push-diff --project-id 123 --before abc123 --after def456
```

### 3. GitLab Webhook 配置

在 GitLab 项目 → Settings → Webhooks 中添加：

- **URL**: `http://your-de-platform:3031/api/webhooks/gitlab`
- **Secret token**: 与 `GITLAB_WEBHOOK_TOKEN` 一致
- **Trigger events**: 勾选 `Merge request events` 和 `Push events`

---

## 发布/部署方式

1. 代码合并到主分支后，服务自动重启加载新 skill
2. 在平台「密钥管理」中配置 GitLab 相关密钥（或设置环境变量）
3. 创建 code-reviewer 员工（code = `code-reviewer`），配置合适的 system prompt
4. 在 GitLab 项目配置 Webhook 指向 `/api/webhooks/gitlab`

---

## 用户验收步骤

### 场景 1：Merge Request 自动 Review

1. 在 GitLab 创建一个 Merge Request
2. 等待 10-30 秒
3. 检查 MR 页面：
   - 行级评论应出现在具体代码行上
   - 总体 review 报告应出现在 MR 讨论区
4. 在数字员工平台查看该员工的对话记录，确认 review 执行过程

### 场景 2：Push 事件自动 Review

1. 向已配置 webhook 的分支 push 代码
2. 检查数字员工平台的对话记录
3. 确认 review 任务被触发并执行

### 场景 3：安全验证

1. 使用错误的 webhook token 发送请求
2. 确认返回 401 错误

---
name: gitlab-code-review
name_zh: GitLab Code Review
description: "GitLab 代码审查技能。当 GitLab webhook 触发（Merge Request 或 Push 事件）时，自动获取代码 diff 并执行 AI Code Review，将审查结果以行级评论和总体评论形式发表到 GitLab MR。"
metadata:
  nextclaw:
    emoji: "🔍"
    category: "code-review"
---

# GitLab Code Review 技能

自动执行 GitLab 代码审查，支持 Merge Request 和 Push 事件触发。

## 认证配置

使用前必须配置 GitLab 凭据。凭据通过数字员工平台的「密钥管理」存储。

### 密钥配置（在平台「密钥管理」中设置）

| 密钥 Key       | 值                                | 说明                                        |
| -------------- | --------------------------------- | ------------------------------------------- |
| `GITLAB_URL`   | `https://gitlab.your-company.com` | GitLab 实例地址                             |
| `GITLAB_TOKEN` | `glpat-xxxxxxxxxxxx`              | GitLab Personal Access Token（需 api 权限） |

### 环境变量方式（可选）

```bash
GITLAB_URL=https://gitlab.your-company.com
GITLAB_TOKEN=glpat-xxxxxxxxxxxx
```

## 脚本位置

```
<本技能目录>/scripts/gitlab-api.py
```

## 使用方法

### 一、获取 MR Diff

```bash
python scripts/gitlab-api.py get-diff \
  --gitlab-url "<GitLab地址>" \
  --token "<Token>" \
  --project-id <项目ID> \
  --mr-iid <MR的IID>
```

**参数说明：**

| 参数           | 必填 | 说明                         |
| -------------- | ---- | ---------------------------- |
| `--gitlab-url` | 是   | GitLab 实例地址              |
| `--token`      | 是   | Personal Access Token        |
| `--project-id` | 是   | GitLab 项目 ID（数字）       |
| `--mr-iid`     | 是   | Merge Request 的 IID（数字） |

**输出：** 返回 diff 内容（JSON 格式，包含 changes 数组）

### 二、获取 Push 事件的 Diff

```bash
python scripts/gitlab-api.py get-push-diff \
  --gitlab-url "<GitLab地址>" \
  --token "<Token>" \
  --project-id <项目ID> \
  --before "<旧commit>" \
  --after "<新commit>"
```

**参数说明：**

| 参数       | 必填 | 说明                 |
| ---------- | ---- | -------------------- |
| `--before` | 是   | Push 前的 commit SHA |
| `--after`  | 是   | Push 后的 commit SHA |

### 三、发表行级评论

```bash
python scripts/gitlab-api.py post-comment \
  --gitlab-url "<GitLab地址>" \
  --token "<Token>" \
  --project-id <项目ID> \
  --mr-iid <MR的IID> \
  --body "<评论内容>" \
  --path "<文件路径>" \
  --line <行号>
```

**参数说明：**

| 参数     | 必填 | 说明                         |
| -------- | ---- | ---------------------------- |
| `--body` | 是   | 评论内容（支持 Markdown）    |
| `--path` | 否   | 文件路径（设置后为行级评论） |
| `--line` | 否   | 行号（与 --path 配合使用）   |

### 四、发表 MR 总体评论

```bash
python scripts/gitlab-api.py post-note \
  --gitlab-url "<GitLab地址>" \
  --token "<Token>" \
  --project-id <项目ID> \
  --mr-iid <MR的IID> \
  --body "<评论内容>"
```

### 五、获取 MR 信息

```bash
python scripts/gitlab-api.py get-mr \
  --gitlab-url "<GitLab地址>" \
  --token "<Token>" \
  --project-id <项目ID> \
  --mr-iid <MR的IID>
```

**输出：** MR 的详细信息（JSON 格式）

### 六、获取 MR 的所有提交

```bash
python scripts/gitlab-api.py get-commits \
  --gitlab-url "<GitLab地址>" \
  --token "<Token>" \
  --project-id <项目ID> \
  --mr-iid <MR的IID>
```

**输出：** 提交列表（JSON 格式），包含每个提交的 `id`、`short_id`、`message`、`author_name`、`authored_date`、`commit_url`

---

## Code Review 执行流程

当收到 GitLab webhook 事件时，按以下步骤执行 Code Review：

### 步骤 1：解析事件

从 webhook payload 中提取：

- 事件类型（`merge_request` 或 `push`）
- 项目 ID（`project.id`）
- MR IID（`object_attributes.iid`，仅 MR 事件）
- Commit 信息（`commits` 或 `object_attributes`）

### 步骤 2：获取代码变更与提交信息

**MR 事件 — 获取 diff：**

```bash
python scripts/gitlab-api.py get-diff \
  --gitlab-url "$GITLAB_URL" --token "$GITLAB_TOKEN" \
  --project-id <项目ID> --mr-iid <MR的IID>
```

**MR 事件 — 获取提交列表：**

```bash
python scripts/gitlab-api.py get-commits \
  --gitlab-url "$GITLAB_URL" --token "$GITLAB_TOKEN" \
  --project-id <项目ID> --mr-iid <MR的IID>
```

**输出：** 包含所有提交的列表，每个提交有 `id`、`short_id`、`message`、`author_name`、`authored_date`、`commit_url`。

**Push 事件 — 获取 diff：**

```bash
python scripts/gitlab-api.py get-push-diff \
  --gitlab-url "$GITLAB_URL" --token "$GITLAB_TOKEN" \
  --project-id <项目ID> \
  --before "<before_commit>" --after "<after_commit>"
```

### 步骤 3：执行 Code Review（Subagent 模式）

使用 Code Reviewer 视角对代码变更进行结构化审查。按以下流程操作：

1. 读取 diff 内容和 commits 信息，理解变更意图
2. 按以下维度逐文件审查：
   - **安全性（Security）**：SQL 注入、XSS、CSRF、敏感信息泄露、权限校验缺失
   - **代码质量（Code Quality）**：函数过长、重复代码、命名规范、魔法数字、错误处理
   - **性能（Performance）**：N+1 查询、不必要的循环、缺少缓存、同步阻塞
   - **可维护性（Maintainability）**：职责单一、依赖合理、设计模式、注释充分
   - **业务逻辑（Business Logic）**：边界条件、异常场景、数据一致性
3. 将问题分类为：Critical（必须改）、Important（应该改）、Minor（建议改）
4. 每个问题必须包含：文件路径、行号、问题描述、为什么重要、如何修复

#### 3.1 安全性（Security）

- SQL 注入、XSS、CSRF 等注入漏洞
- 敏感信息泄露（密码、密钥、Token 硬编码）
- 权限校验缺失
- 不安全的反序列化
- 路径遍历

#### 3.2 代码质量（Code Quality）

- 函数/方法过长（>50 行需关注）
- 重复代码（DRY 原则）
- 命名不规范（变量、函数、类名）
- 魔法数字/字符串
- 未使用的导入或变量
- 错误处理不当（空 catch、吞掉异常）

#### 3.3 性能（Performance）

- N+1 查询问题
- 不必要的循环或重复计算
- 大对象内存占用
- 缺少缓存机制
- 同步阻塞操作

#### 3.4 可维护性（Maintainability）

- 函数职责是否单一
- 模块依赖是否合理
- 是否有更好的设计模式
- 注释是否充分且准确

#### 3.5 业务逻辑（Business Logic）

- 边界条件处理
- 异常场景覆盖
- 数据一致性

### 步骤 4：发表评论

#### 行级评论（针对具体问题）

对每个发现的问题，在对应代码行发表评论：

```bash
python scripts/gitlab-api.py post-comment \
  --gitlab-url "$GITLAB_URL" --token "$GITLAB_TOKEN" \
  --project-id <项目ID> --mr-iid <MR的IID> \
  --body "**[🔴 严重]** SQL 注入风险\n\n此处直接拼接用户输入，建议使用参数化查询。\n\n\`\`\`suggestion\nconst result = await db.query(\n  'SELECT * FROM users WHERE id = $1',\n  [userId]\n);\n\`\`\`" \
  --path "src/userService.ts" --line 42
```

**评论格式规范：**

````
**[<级别>] <问题简述>**

<问题描述>

```suggestion
<建议的修改代码>
````

````

**级别标识：**
- 🔴 严重（必须修改）：安全漏洞、数据丢失风险、崩溃
- 🟡 建议（推荐修改）：性能问题、可维护性问题
- 🔵 提示（可选）：风格问题、命名建议、优化空间

#### 总体评论（MR 讨论区）

在所有行级评论发表后，发表总体 review 总结：

```bash
python scripts/gitlab-api.py post-note \
  --gitlab-url "$GITLAB_URL" --token "$GITLAB_TOKEN" \
  --project-id <项目ID> --mr-iid <MR的IID> \
  --body "<总体评论内容>"
````

**总体评论模板：**

```markdown
## 🔍 AI Code Review 报告

**MR：** [#<IID> <标题>](<MR链接>)
**分支：** <source_branch> → <target_branch>
**提交数：** <数量> 个提交

### 📋 提交列表

| 提交 | 信息 | 作者 |
|------|------|------|
| [<short_id>](<commit_url>) | <message> | <author> |

### 📊 问题统计

| 级别    | 数量 |
| ------- | ---- |
| 🔴 严重 | X    |
| 🟡 建议 | X    |
| 🔵 提示 | X    |

### 📝 总体评价

<对整体代码质量的评价，1-2 句话>

### ✅ 亮点

- <做得好的地方>

### ⚠️ 重点关注

- <需要重点关注的变更>

### 🏁 审查结论

**Ready to merge?** <Yes / No / With fixes>

---

_此评论由 AI 自动生成，仅供参考。_
```

### 步骤 5：返回结构化审查结果

审查完成后，必须返回以下结构化摘要（作为最终回复）：

```json
{
  "review_status": "completed",
  "mr_url": "<MR链接>",
  "project": "<项目名称>",
  "commits": [
    {
      "short_id": "<短SHA>",
      "message": "<提交信息>",
      "author": "<作者>",
      "url": "<提交链接>"
    }
  ],
  "summary": {
    "files_changed": <数量>,
    "lines_changed": <数量>,
    "critical": <数量>,
    "important": <数量>,
    "minor": <数量>
  },
  "verdict": "<Ready to merge / Needs fixes / Blocked>",
  "comments_posted": <数量>,
  "note_url": "<总体评论链接>"
}
```

---

## 注意事项

1. **Token 安全**：GitLab Token 必须通过密钥管理存储，禁止在评论或日志中暴露
2. **评论内容**：评论中禁止暴露内部系统信息（如内部 URL、数据库名等）
3. **幂等性**：同一 MR 可能被多次触发，注意不要重复发表相同评论
4. **Diff 大小**：如果 diff 过大（>10000 行），优先审查核心业务逻辑文件
5. **语言识别**：根据文件扩展名识别编程语言，使用对应语言的最佳实践进行审查
6. **上下文理解**：审查时注意结合 MR 标题和描述理解变更意图

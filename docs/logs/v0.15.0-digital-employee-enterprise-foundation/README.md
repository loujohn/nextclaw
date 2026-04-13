# v0.15.0 — 数字员工企业化基础能力

**日期**: 2026-04-13
**状态**: Plan
**适用范围**: `packages/nextclaw-digital-employee`

---

## 迭代概述

本迭代为数字员工平台补齐企业化落地的 5 大基础能力，使其从"内部工具"进化为"可认证、可管理、可协同的企业级数字劳动力平台"。

### 五大特性

| 优先级 | 特性 | 关键价值 |
|--------|------|---------|
| **P0** | 用户系统 + Keycloak 对接 | 身份认证是所有企业功能的前置条件 |
| **P1** | Skill 改造（员工独立副本 + 二级分类） | 员工能力隔离，精细化技能管理 |
| **P1** | 工作空间文件管理 + 对话上传 | 员工数据隔离，文件流闭环 |
| **P2** | 真实员工任务管理及打分 | 人机协同的任务闭环与绩效度量 |
| **P2** | 钉钉映射真实员工消息来源 | 打通外部协同通道，支撑任务分发/日报周报 |

### 优先级依据

```
P0 用户系统 ──→ P1 Skill改造（需按用户隔离）
      │         P1 工作空间（需按用户隔离）
      └──────→ P2 任务管理（需要用户身份标识）
               P2 钉钉映射（需与人类员工关联）
```

- P0 是其余所有特性的依赖基础：工作空间隔离需要知道"谁在操作"、任务分配需要知道"谁是发起人"
- P1 两项可并行开发，共享"员工目录隔离"的底层设计
- P2 两项依赖 P0 + P1 的基础设施

---

## P0: 用户系统 + Keycloak 对接

### 背景

当前所有 API 无鉴权，任何人可访问全部功能。企业部署场景下，这是不可接受的安全缺口。

### 权限模型设计（三级角色）

| 角色 | 标识 | 权限范围 |
|------|------|---------|
| **系统管理员** | `admin` | 全部操作：员工管理、集成配置、安全设置、用户管理、组织架构 |
| **部门管理员** | `manager` | 管理本部门数字员工、分配/审核任务、查看部门报表、管理部门成员 |
| **普通成员** | `user` | 使用已授权的数字员工对话、查看自己的任务和工作空间 |

**角色存储策略**：Keycloak Realm Role 存储角色标识，本地 `users` 表存储扩展配置（关联部门、偏好设置等）。

### 技术方案

```
┌──────────┐     OIDC/PKCE     ┌───────────┐
│  Browser  │ ◄──────────────► │ Keycloak  │
└─────┬─────┘                  └───────────┘
      │ JWT (Authorization: Bearer)
      ▼
┌─────────────────────────────────────────┐
│  Nuxt Server                            │
│  ┌─────────────────────────────────┐    │
│  │ auth.middleware.ts               │    │
│  │ ─ 解析 JWT                       │    │
│  │ ─ 校验签名（JWKS）               │    │
│  │ ─ 提取 sub / roles / email      │    │
│  │ ─ 注入 event.context.user       │    │
│  └─────────────────┬───────────────┘    │
│                    ▼                    │
│  ┌─────────────────────────────────┐    │
│  │ permission.middleware.ts         │    │
│  │ ─ 路由级别角色校验               │    │
│  │ ─ 资源级别权限校验               │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 数据模型

```sql
-- users 表（本地扩展信息，主数据在 Keycloak）
CREATE TABLE users (
  id            TEXT PRIMARY KEY,         -- Keycloak sub
  keycloak_sub  TEXT NOT NULL UNIQUE,     -- 冗余，便于查询
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'user',  -- admin | manager | user
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  preferences   TEXT NOT NULL DEFAULT '{}',    -- JSON: 偏好设置
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

### 工作项

| # | 工作项 | 说明 |
|---|--------|------|
| 1 | Nuxt auth server middleware | 解析 Keycloak JWT，校验 JWKS 签名，注入 `event.context.user` |
| 2 | 前端 PKCE 登录流程 | `/login` 页面，PKCE code flow → 获取 token → 存储 |
| 3 | `useAuth` composable | 前端用户状态管理：登录/登出/token 刷新/角色判断 |
| 4 | `users` 表 + UserRepository | 本地用户扩展数据 CRUD |
| 5 | 权限中间件 | 路由级别 `requireRole('admin')` + 资源级别校验 |
| 6 | 现有 API 全面加鉴权 | 所有 `/api/**` 路由添加身份校验，按角色控制访问 |
| 7 | 用户管理页面 | admin 角色可查看/管理用户列表、分配角色 |

### 环境变量

```env
KEYCLOAK_URL=https://auth.example.com
KEYCLOAK_REALM=digital-employee
KEYCLOAK_CLIENT_ID=de-platform
KEYCLOAK_CLIENT_SECRET=xxx  # 可选，用于后端 service account
```

### 关键决策

- **Token 刷新**：前端使用 refresh token 自动续期，过期后跳转登录页
- **首次登录**：Keycloak 认证成功后，自动在 `users` 表创建本地记录（默认 `user` 角色）
- **角色同步**：Keycloak Realm Role 为 source of truth；本地 `role` 字段用于快速查询，登录时自动同步
- **部门关联**：`manager` 角色通过 `department_id` 限定管理范围；`admin` 无此限制

---

## P1a: Skill 改造

### 背景

当前 skill 系统为全局安装 + 员工绑定引用。存在的问题：
- 员工共享同一份 skill 文件，无法为特定员工定制 skill 配置
- 分类仅一级（6 个固定分类），skill 数量增长后难以组织
- 无法按需从全局更新单个员工的 skill 版本

### 目标架构

```
$WORKSPACE/
  skills/                              ← 全局 skill 源（当前已有）
    docx/SKILL.md
    pptx/SKILL.md
    ...
  employees/
    {employeeId}/
      skills/                          ← 员工独立 skill 副本
        docx/SKILL.md                  ← 从全局复制，可独立修改
        custom-analysis/SKILL.md       ← 员工专属 skill
      files/                           ← 员工工作空间文件（见 P1b）
```

### 数据模型变更

```sql
-- 新增：skill_categories 表（支持自定义二级分类）
CREATE TABLE skill_categories (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,     -- 如 'project-management/gantt'
  parent_slug TEXT,                     -- 一级分类 slug，NULL 表示一级
  label       TEXT NOT NULL,            -- 中文标签
  emoji       TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- skill_installations 表增加字段
ALTER TABLE skill_installations ADD COLUMN category_slug TEXT;
ALTER TABLE skill_installations ADD COLUMN subcategory_slug TEXT;

-- employee_skills 表增加字段
ALTER TABLE employee_skills ADD COLUMN install_path TEXT;  -- 员工独立副本路径
ALTER TABLE employee_skills ADD COLUMN version TEXT;       -- 副本版本号
ALTER TABLE employee_skills ADD COLUMN synced_at TEXT;     -- 上次从全局同步时间
```

### 核心流程

**1. 员工绑定 Skill 时**：
```
全局 skills/{name}/ ──(copy)──► employees/{empId}/skills/{name}/
同时写入 employee_skills 记录（含 install_path + version + synced_at）
```

**2. 从全局更新 Skill**：
```
用户点击"从全局更新" ──► 
  对比全局版本 vs 员工副本版本 ──►
  全局 skills/{name}/ ──(overwrite copy)──► employees/{empId}/skills/{name}/
  更新 employee_skills.version + synced_at
```

**3. 运行时加载**：
```
EmployeeRunService 准备运行 ──►
  读取 employee_skills 获取该员工绑定列表 ──►
  从 employees/{empId}/skills/ 加载（非全局目录）
```

### 工作项

| # | 工作项 | 说明 |
|---|--------|------|
| 1 | `skill_categories` 表 + migration | 支持自定义二级分类 CRUD |
| 2 | 种子数据：预置一级分类 + 常用二级分类 | 现有 6 个一级 + 每个下 2-3 个二级 |
| 3 | Skill 副本机制 | 绑定时复制、解绑时可选删除、更新时覆盖 |
| 4 | `SkillInstallService` 改造 | 支持员工级安装/更新/版本对比 |
| 5 | 运行时加载路径切换 | 从员工独立目录加载 skill，回退到全局 |
| 6 | 前端 Skill 管理页改造 | 二级分类展示、员工独立视图、"从全局更新"操作 |
| 7 | Skill 分类管理页面 | admin 可新增/编辑/删除分类 |

### 预置二级分类示例

| 一级分类 | 二级分类 |
|---------|---------|
| 项目管理类 | 甘特图、里程碑跟踪、资源调配 |
| 经营管理类 | 数据分析、报表生成、KPI 追踪 |
| 产品研发类 | 需求分析、技术文档、架构设计 |
| 市场营销类 | 内容创作、竞品分析、营销策划 |
| 解决方案类 | 方案编写、标书制作、咨询报告 |
| 通用能力类 | 文档处理、演示制作、翻译校对 |

---

## P1b: 工作空间文件管理

### 背景

当前有基础的文件 API（list/read/write），但所有员工共享一个 workspace 目录，对话中无法上传文件，AI 生成的文件也没有写入员工隔离空间。

### 目标

- 每个数字员工拥有隔离的 `files/` 工作空间
- 对话中支持文件上传，上传到当前员工的工作空间
- AI 生成的文件自动写入当前员工的工作空间
- 前端提供文件浏览器（列表 + 预览 + 下载 + 删除）

### 目录结构

```
$WORKSPACE/employees/{employeeId}/
  skills/        ← P1a 的 skill 副本
  files/         ← 工作空间文件
    uploads/     ← 用户上传
    outputs/     ← AI 生成
```

### API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/employees/:id/workspace` | 列出文件（含 uploads + outputs） |
| GET | `/api/employees/:id/workspace/:path` | 读取/下载文件 |
| POST | `/api/employees/:id/workspace/upload` | multipart 文件上传 |
| DELETE | `/api/employees/:id/workspace/:path` | 删除文件 |
| PUT | `/api/employees/:id/workspace/:path` | 写入/覆盖文件（AI 生成用） |

### 工作项

| # | 工作项 | 说明 |
|---|--------|------|
| 1 | 员工目录隔离改造 | 创建员工时初始化 `employees/{id}/skills/` + `employees/{id}/files/` |
| 2 | 现有 workspace API 迁移 | 从共享目录迁移到员工隔离目录 |
| 3 | 文件上传 API | multipart 解析 → 写入 `files/uploads/` |
| 4 | AI 生成文件路径重定向 | Engine 输出文件写入 `files/outputs/` |
| 5 | 对话页文件上传组件 | 拖拽/点击上传 → 附件预览 → 发送时传递文件引用 |
| 6 | 工作空间文件浏览器增强 | 树状展示、文件预览、批量操作、文件大小/时间 |

### 约束

- 本地磁盘存储，单文件上限 50MB
- 总空间按员工不设硬限（初期），后续可加配额
- 支持常见文件类型预览（文本、Markdown、图片、PDF）

---

## P2a: 真实员工任务管理及打分

### 背景

当前 `human_employees` 表仅用于组织同步展示，真实员工与数字员工之间缺少任务协作的数据模型。

### 目标

- 支持创建任务并分配给真实员工或数字员工
- 支持任务状态流转：待办 → 进行中 → 已完成 / 已取消
- 支持 1-5 星打分 + 评价备注
- 任务可关联到 RunRecord（数字员工执行记录）

### 数据模型

```sql
CREATE TABLE tasks (
  id                        TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  description               TEXT NOT NULL DEFAULT '',
  -- 分配
  assigned_to_human_id      TEXT REFERENCES human_employees(id) ON DELETE SET NULL,
  assigned_to_employee_id   TEXT REFERENCES employees(id) ON DELETE SET NULL,
  -- 状态
  status                    TEXT NOT NULL DEFAULT 'pending',
    -- pending | in_progress | completed | cancelled
  priority                  INTEGER NOT NULL DEFAULT 3,
    -- 1(最低) ~ 5(最高)
  due_date                  TEXT,
  -- 打分
  rating                    INTEGER,  -- 1~5 星，NULL 表示未评
  rating_comment            TEXT NOT NULL DEFAULT '',
  -- 关联
  run_record_id             TEXT REFERENCES run_records(id) ON DELETE SET NULL,
  -- 来源
  source                    TEXT NOT NULL DEFAULT 'manual',
    -- manual | dingtalk | scheduled
  source_detail             TEXT NOT NULL DEFAULT '{}',  -- JSON
  -- 元数据
  created_by                TEXT,  -- user ID
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX idx_tasks_assigned_human ON tasks(assigned_to_human_id);
CREATE INDEX idx_tasks_assigned_employee ON tasks(assigned_to_employee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
```

### 任务流转

```
                 ┌────────────┐
                 │   pending   │
                 └──────┬──────┘
                        │ 开始
                        ▼
                 ┌────────────┐
                 │ in_progress │
                 └──┬─────┬───┘
            完成   │     │  取消
                   ▼     ▼
          ┌──────────┐ ┌───────────┐
          │ completed │ │ cancelled │
          └──────────┘ └───────────┘
                │
                ▼
           1-5 星打分
```

### 工作项

| # | 工作项 | 说明 |
|---|--------|------|
| 1 | `tasks` 表 + migration | 任务数据模型 |
| 2 | TaskRepository + TaskService | CRUD + 状态流转 + 打分 |
| 3 | 任务 CRUD API | 创建/列表/详情/更新/删除 |
| 4 | 任务分配 API | 分配到真实员工或数字员工 |
| 5 | 任务打分 API | 1-5 星打分 + 评价 |
| 6 | 任务看板页面 | 按状态分组、拖拽排序、筛选 |
| 7 | 任务详情页 | 状态流转、关联 run、打分表单 |
| 8 | Dashboard 集成 | 任务统计卡片：待办数、完成率、平均评分 |

---

## P2b: 钉钉映射真实员工消息来源

### 背景

当前钉钉 Channel Runtime 已支持消息收发和员工路由绑定，但无法识别消息发送者对应的 `human_employee`，因此无法支撑"由谁发起"的任务分发和日报周报收集场景。

### 目标

- 钉钉消息 sender → 自动映射到 `human_employees` 记录
- 支持任务分发：数字员工向真实员工发送钉钉消息
- 支持日报/周报收集：监听指定关键词消息 → 解析 → 存储
- 消息来源与任务系统（P2a）联动

### 核心流程

**1. 消息来源识别**：
```
钉钉消息到达 ──►
  提取 sender userid ──►
  查询 human_employees(external_id = userid) ──►
  注入到 message context: { humanEmployee: {...} }
```

**2. 任务分发**：
```
数字员工决策"需要分配任务" ──►
  创建 task (source = 'dingtalk') ──►
  通过钉钉 API 发送通知给指定真实员工 ──►
  真实员工回复 ──► 更新任务状态
```

**3. 日报/周报收集**：
```
真实员工在钉钉发送日报 ──►
  消息匹配规则（关键词/模板/定时） ──►
  解析结构化内容 ──►
  存储到 task/run_record ──►
  数字员工汇总分析
```

### 数据模型扩展

```sql
-- 消息来源映射缓存（提升查询性能）
CREATE TABLE dingtalk_user_mapping (
  id               TEXT PRIMARY KEY,
  dingtalk_userid  TEXT NOT NULL UNIQUE,
  human_employee_id TEXT NOT NULL REFERENCES human_employees(id) ON DELETE CASCADE,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- 消息收集规则
CREATE TABLE message_collection_rules (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  channel          TEXT NOT NULL DEFAULT 'dingtalk',
  rule_type        TEXT NOT NULL,          -- keyword | template | scheduled
  rule_config      TEXT NOT NULL DEFAULT '{}',  -- JSON: 匹配条件
  target_employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
```

### 工作项

| # | 工作项 | 说明 |
|---|--------|------|
| 1 | 消息来源解析中间件 | Channel Runtime 中注入 human_employee 上下文 |
| 2 | `dingtalk_user_mapping` 表 | 钉钉 userid → human_employee_id 映射缓存 |
| 3 | 组织同步时自动建立映射 | org sync 后自动刷新 mapping |
| 4 | 钉钉主动发送 API | 数字员工 → 真实员工发消息（任务通知等） |
| 5 | 消息收集规则引擎 | 关键词/模板/定时触发的消息识别与解析 |
| 6 | `message_collection_rules` 表 | 规则配置持久化 |
| 7 | 任务系统联动 | 消息触发创建任务 + 更新任务状态 |
| 8 | 消息来源管理配置页 | 规则 CRUD、测试匹配 |

---

## 实施节奏

### 第一阶段（~1 周）：P0 用户系统

```
Day 1-2: Keycloak 对接 + auth middleware + JWT 解析
Day 3:   前端 PKCE 登录 + useAuth composable
Day 4:   users 表 + 权限中间件 + 现有 API 加鉴权
Day 5:   用户管理页面 + 冒烟测试
```

**阶段验收**：
- [ ] 未登录访问任何 API 返回 401
- [ ] PKCE 登录流程正常完成
- [ ] admin 可访问所有页面，user 受限
- [ ] 首次登录自动创建本地用户记录

### 第二阶段（~1 周）：P1a + P1b 并行

```
P1a Skill 改造:
  Day 1-2: skill_categories 表 + 种子数据 + 分类 CRUD
  Day 3:   Skill 副本机制（复制/更新/版本对比）
  Day 4:   运行时加载路径切换 + 前端改造
  Day 5:   分类管理页面 + 冒烟测试

P1b 工作空间:
  Day 1:   员工目录隔离 + 初始化改造
  Day 2:   文件上传 API + 前端上传组件
  Day 3:   AI 生成文件路径重定向
  Day 4:   工作空间文件浏览器增强
  Day 5:   对话页集成 + 冒烟测试
```

**阶段验收**：
- [ ] 员工绑定 skill 后，`employees/{id}/skills/` 下有独立副本
- [ ] "从全局更新"可将最新 skill 覆盖到员工副本
- [ ] 二级分类展示正常，可自定义新增
- [ ] 对话页可上传文件，文件出现在员工工作空间
- [ ] AI 生成的文件自动写入 `files/outputs/`

### 第三阶段（~1 周）：P2a + P2b 并行

```
P2a 任务管理:
  Day 1:   tasks 表 + repository + service
  Day 2:   任务 CRUD API + 分配
  Day 3:   任务看板前端
  Day 4:   打分 + Dashboard 集成
  Day 5:   冒烟测试

P2b 钉钉映射:
  Day 1:   消息来源解析 + mapping 表
  Day 2:   组织同步联动 + 主动发送 API
  Day 3:   消息收集规则引擎
  Day 4:   规则管理页面
  Day 5:   任务系统联动 + 冒烟测试
```

**阶段验收**：
- [ ] 可创建任务并分配给真实/数字员工
- [ ] 任务状态流转正常，打分可保存
- [ ] 钉钉消息可识别发送者并映射到 human_employee
- [ ] 数字员工可通过钉钉向真实员工发消息
- [ ] 消息收集规则可配置并正常触发

---

## 测试/验证/验收方式

### 自动化验证

```bash
# 构建验证
pnpm -C packages/nextclaw-digital-employee build
pnpm -C packages/nextclaw-digital-employee lint
pnpm -C packages/nextclaw-digital-employee tsc

# 单元测试
pnpm -C packages/nextclaw-digital-employee test
```

### 冒烟测试清单

| 场景 | 验证方式 |
|------|---------|
| 用户登录流程 | 访问首页 → 跳转 Keycloak → 登录 → 回调 → 进入系统 |
| 权限控制 | user 角色访问 admin 页面 → 返回 403 |
| Skill 独立副本 | 创建员工 → 绑定 skill → 检查 `employees/{id}/skills/` 目录 |
| 全局更新 Skill | 修改全局 skill → 点击更新 → 员工副本同步 |
| 文件上传 | 对话页上传文件 → workspace 中可见 |
| AI 生成文件 | 执行生成任务 → `files/outputs/` 出现文件 |
| 任务创建与打分 | 创建任务 → 分配 → 完成 → 打分 |
| 钉钉消息识别 | 钉钉发消息 → 查看 message context 含 humanEmployee |
| 任务分发 | 数字员工创建任务 → 真实员工收到钉钉通知 |

---

## 发布/部署方式

1. 数据库 Migration：`pnpm -C packages/nextclaw-digital-employee migrate:latest`
2. 构建：`pnpm -C packages/nextclaw-digital-employee build`
3. Keycloak 配置：需在 Keycloak 中创建 Realm + Client（PKCE 配置）
4. 环境变量：配置 `KEYCLOAK_URL` / `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID`

---

## 用户/产品视角的验收步骤

1. **首次访问**：打开数字员工平台 → 自动跳转到 Keycloak 登录页 → 登录后进入系统
2. **查看员工 Skill**：进入某个数字员工详情 → 看到该员工独立的 skill 列表（含二级分类）
3. **全局同步 Skill**：在 skill 管理页看到"有更新可用" → 点击更新 → 员工 skill 刷新
4. **对话上传文件**：在对话页拖拽文件上传 → 文件出现在消息中 → 工作空间可查看
5. **创建任务**：进入任务看板 → 创建任务分配给张三 → 张三在钉钉收到通知
6. **任务打分**：任务完成后 → 管理员给出 4 星评价 → Dashboard 显示平均分
7. **日报收集**：真实员工在钉钉群发送日报 → 数字员工自动识别并汇总

---

## 关联文档

- **需求文档 (PRD)**：[v0.15 企业化基础能力 PRD](../../prd/v0.15-enterprise-foundation-prd.md)
- **技术方案**：待实施阶段细化

---

## 明确不做项

- 多租户/组织隔离
- 复杂审批链
- OAuth 第三方社交登录（仅 Keycloak OIDC）
- 文件版本控制
- 实时协同编辑
- 复杂 workflow/pipeline 编排引擎

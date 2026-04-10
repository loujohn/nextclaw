# v0.14.27 — 数字员工 Skill 选择与展示机制文档

## 迭代说明

1. 梳理数字员工平台中 **Skill 选择执行** 与 **Skill 名称展示** 的完整链路文档，供产品/开发/运维参照。
2. **修复合并逻辑**：移除 `disabledGlobally` 对员工绑定技能的过滤，使员工级绑定优先于全局禁用（`employee-runtime-preparation.ts`）。

---

## 一、Skill 选择机制全链路

### 1.1 概念模型

数字员工执行任务时，**不是模型自动挑选技能**，而是 **配置驱动 + 合并规则**：

```
有效技能集合 = 员工绑定技能(enabled=true, 未被全局停用) ∪ 全局启用技能
```

### 1.2 数据存储层

| 数据表 | 作用 | 关键字段 |
|--------|------|----------|
| `employee_skills` | 记录某员工绑定了哪些技能 | `employee_id`, `skill_name`, `enabled` |
| `skill_installations` | 全平台的技能安装/启停记录 | `skill_name`, `enabled`, `source_type`, `source_uri` |

**对应代码**：

- `EmployeeSkillRepository`（`server/repositories/employee-skill-repository.ts`）
  - `replaceForEmployee(employeeId, skillNames[])` — 创建/更新员工时**全量替换**绑定
  - `listByEmployeeId(employeeId)` — 查某员工已绑定技能
- `SkillInstallationRepository`（`server/repositories/skill-installation-repository.ts`）
  - `list()` — 获取所有安装记录
  - `setEnabled(skillName, enabled)` — 全局启/停某技能

### 1.3 运行时合并（核心算法）

**文件**: `packages/nextclaw-digital-employee/server/services/employee-runtime-preparation.ts`

```typescript
export async function prepareEmployeeRuntime(params) {
  // 1. 查询员工绑定的技能
  const employeeSkills = await params.employeeSkillRepo.listByEmployeeId(employee.id);

  // 2. 查询全平台安装记录
  const installations = await params.skillInstallationRepo.list();

  // 3. 计算全局启用的技能名集合
  const globallyEnabled = new Set(
    installations.filter(i => i.enabled).map(i => i.skillName)
  );

  // 4. 员工绑定技能：enabled=true 即生效（不受全局禁用影响）
  const boundSkills = employeeSkills
    .filter(skill => skill.enabled)
    .map(skill => skill.skillName);

  // 5. 最终合并 = 员工绑定 ∪ 全局启用，Set 去重
  const skillNames = [...new Set([...boundSkills, ...globallyEnabled])];

  return { workspace, skillNames };
}
```

**合并规则总结**：

| 场景 | 技能是否生效 | 说明 |
|------|-------------|------|
| 员工绑定 + enabled | ✅ 生效 | 员工绑定优先，不受全局启停影响 |
| 员工绑定 + enabled + 全局 enabled=false | ✅ 生效 | 员工级绑定优先于全局禁用 |
| 员工未绑定 + 全局 enabled=true | ✅ 生效 | 通过 globallyEnabled 无条件并入 |
| 员工未绑定 + 全局无记录 | ❌ 不生效 | 既不在 boundSkills 也不在 globallyEnabled |
| 员工未绑定 + 全局 enabled=false | ❌ 不生效 | 既不在 boundSkills 也不在 globallyEnabled |

**核心逻辑**：员工绑定的技能只要 `enabled=true` 就始终生效，不受全局 `skill_installations` 表的启停状态干扰。全局启用的技能会无条件并入所有员工的技能集合。

### 1.4 下发到引擎

**文件**: `packages/nextclaw-digital-employee/server/services/employee-run-service.ts`

`EmployeeRunService.runEmployeeTurn()` 调用 `prepareEmployeeRuntime()` 后，将 `skillNames` 传给网关：

```typescript
const result = await this.gateway.runEmployeeTurn({
  employeeId: employee.id,
  agentId: employee.code,
  workspace,
  message: params.message,
  model: employee.model || undefined,
  requestedSkills: skillNames.length > 0 ? skillNames : undefined,
  disableCronTool: params.triggerType === "scheduled"
});
```

**网关层**（`NextclawEngineGateway.ts`）将 `requestedSkills` 写入 LLM 调用的 `metadata.requested_skills`。

### 1.5 Agent 核心循环处理

**文件**: `packages/nextclaw-core/src/agent/loop.ts`

#### 1.5.1 解析 requested_skills

```typescript
private resolveRequestedSkillNames(metadata: Record<string, unknown>): string[] {
  const rawValue = metadata.requested_skills ?? metadata.requestedSkills;
  // 支持数组或逗号分隔字符串两种格式
  // ...解析逻辑...
  // ⚠️ 最终去重并截断：最多保留 8 个
  return Array.from(new Set(values)).slice(0, 8);
}
```

> **重要限制**: `AgentLoop` 对 `requested_skills` **最多保留 8 个**。如果员工绑定 + 全局启用超过 8 个技能，会被截断。

#### 1.5.2 用户消息前缀注入

```typescript
private prependRequestedSkills(content: string, requestedSkillNames: string[]): string {
  if (!requestedSkillNames.length) return content;
  const names = requestedSkillNames.join(", ");
  return `[Requested skills for this turn: ${names}]\n\n${content}`;
}
```

实际发送给模型的用户消息会被加上类似前缀：
```
[Requested skills for this turn: zentao-project-analysis, weekly-report, dingtalk-notify]

用户原始消息...
```

### 1.6 System Prompt 中的技能注入

**文件**: `packages/nextclaw-core/src/agent/context.ts`

`ContextBuilder.buildSystemPrompt(skillNames)` 分两部分注入技能信息：

#### 1.6.1 Requested Skills（SKILL.md 全文注入）

```typescript
if (skillNames && skillNames.length) {
  const requestedContent = this.skills.loadSkillsForContext(skillNames);
  // 注入 "# Requested Skills" 段，包含 SKILL.md 去掉 frontmatter 后的正文
}
```

#### 1.6.2 Available Skills Summary（XML 摘要）

```typescript
const skillsSummary = this.skills.buildSkillsSummary(skillNames);
// 生成 <available_skills><skills>...</skills></available_skills> XML 摘要
// 模型可按名称/路径再用 read_file 深入查看
```

#### 1.6.3 Always Skills（始终注入）

```typescript
const alwaysSkills = this.skills.getAlwaysSkills();
// SKILL.md frontmatter 中标记 always: true 的技能
// 注入到 "# Active Skills" 段，不受 requested_skills 限制
```

### 1.7 技能加载器（SkillsLoader）

**文件**: `packages/nextclaw-core/src/agent/skills.ts`

#### 加载优先级

```
工作区 skills/ > 附加目录(全局技能目录) > 内置技能目录
```

同名技能以**先发现者为准**（工作区覆盖内置）。

#### 技能发现规则

- 扫描目录下的子目录
- 每个子目录必须包含 `SKILL.md` 文件
- 目录名 = 技能名（即 `skillName`）

#### 可用性检查

技能的 frontmatter `metadata` 中可声明运行时依赖：

```yaml
metadata:
  nextclaw:
    requires:
      bins: ["node", "git"]  # 需要的 CLI 工具
      env: ["GITHUB_TOKEN"]  # 需要的环境变量
```

缺少依赖的技能会被标记为 `available=false`。

---

## 二、Skill 名称展示机制

### 2.1 数据来源：SKILL.md Frontmatter

每个技能的 `SKILL.md` 文件顶部 YAML frontmatter 定义元信息：

```yaml
---
name: zentao-project-analysis
name_zh: 禅道项目分析
description: "利用禅道基础工具分析项目健康状态..."
metadata:
  nextclaw:
    emoji: "📈"
    category: "project-management"
---
```

| 字段 | 用途 |
|------|------|
| `name` | 技能唯一标识（= 目录名） |
| `name_zh` / `nameZh` | 中文展示名 |
| `description` | 技能描述 |
| `category` | 技能分类 slug |

### 2.2 网关读取中文名

**文件**: `packages/nextclaw-digital-employee/server/engine/NextclawEngineGateway.ts`

```typescript
async listAvailableSkills(): Promise<AvailableSkillView[]> {
  const loader = new SkillsLoader(this.workspaceDir);
  return loader.listSkills(false).map((skill) => {
    const metadata = loader.getSkillMetadata(skill.name);
    // 同时支持 name_zh 和 nameZh 两种 key
    const nameZh =
      metadata?.name_zh?.trim() ?? metadata?.nameZh?.trim() ?? undefined;
    const category = metadata?.category?.trim() ?? undefined;
    return { name: skill.name, path: skill.path, source: skill.source, description, nameZh, category };
  });
}
```

### 2.3 API 层传递

| API | 返回结构 | 说明 |
|-----|----------|------|
| `GET /api/skills` | `SkillCatalogEntryView[]` | 含 `name`, `nameZh`, `purpose`, `categoryLabel` 等 |
| `GET /api/employees` | `skills: [{ skillName }]` | 精简版，仅 skillName |
| `GET /api/employees/:id` | `skills: EmployeeSkillView[]` | 含 `skillName`, `enabled`, `config` |

**SkillCatalogEntryView 类型定义**（`shared/ui-models.ts`）：

```typescript
export type SkillCatalogEntryView = {
  name: string;        // 技能唯一标识
  nameZh?: string;     // 中文展示名（可选）
  path: string;        // SKILL.md 路径
  source: string;      // "workspace" | "builtin"
  sourceType: string;
  sourceUri: string | null;
  enabled: boolean;
  usageCount: number;  // 使用该技能的员工数
  usedBy: string[];    // 使用该技能的员工名
  statusLabel: string; // "已启用" | "已停用" | "内置可用" | "已发现未登记"
  purpose: string;     // 技能用途描述
  categoryLabel: string; // 分类标签
};
```

### 2.4 前端 Store 构建展示名映射

**文件**: `packages/nextclaw-digital-employee/app/stores/skills.ts`

```typescript
export const useSkillsStore = defineStore("skills", () => {
  const { data, refresh } = useLazyFetch<SkillPayload>("/api/skills");

  const list = computed(() => data.value?.data ?? []);

  // 核心：构建 skillName → 展示名 的映射
  const displayNameMap = computed(() => {
    const m = new Map<string, string>();
    for (const s of list.value) {
      m.set(s.name, s.nameZh ?? s.name);
      //                ^^^^^^    ^^^^^^
      //                优先中文   回退到 skillName
    }
    return m;
  });
});
```

### 2.5 UI 组件展示

#### 仪表盘员工卡片（`EmployeeCard.vue`）

```html
<span v-for="skill in employee.skills" :key="skill.skillName">
  {{ getSkillDisplayName(skill.skillName) }}
</span>
```

```typescript
function getSkillDisplayName(skillName: string): string {
  return props.skillDisplayNames.get(skillName) || skillName;
}
```

#### 员工概览（`ProfileCard.vue`）

```html
<span v-for="skill in employee.skills" :key="skill.id">
  {{ skillDisplayNames.get(skill.skillName) || skill.skillName }}
</span>
```

#### 新建/编辑员工表单（`EmployeeFormSlideOver.vue`）

```html
<label v-for="skill in filteredSkills" :key="skill.name">
  <input v-model="form.skillNames" type="checkbox" :value="skill.name" />
  <p>{{ skill.nameZh || skill.name }}</p>
  <span>{{ skill.categoryLabel }}</span>
  <p>{{ skill.purpose }}</p>
</label>
```

### 2.6 展示名回退策略

```
优先级：nameZh（中文展示名） → name（技能目录名/skill id）
```

**所有 UI 组件统一使用此策略**。如果 SKILL.md 没有 `name_zh` 或 `nameZh` 字段，则直接展示技能的目录名（如 `zentao-project-analysis`）。

---

## 三、完整数据流图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SKILL.md (文件系统)                          │
│  ---                                                                │
│  name: zentao-project-analysis                                      │
│  name_zh: 禅道项目分析                                              │
│  description: "..."                                                 │
│  category: project-management                                       │
│  ---                                                                │
│  # 技能正文 ...                                                     │
└─────────┬───────────────────────────────────────┬───────────────────┘
          │                                       │
          ▼                                       ▼
┌─────────────────────┐               ┌───────────────────────┐
│  SkillsLoader        │               │  listAvailableSkills() │
│  (发现 + 加载技能)    │               │  (读取 frontmatter)    │
│                      │               │  → nameZh, category   │
│  优先级:             │               └────────┬──────────────┘
│  workspace > 附加    │                        │
│  > builtin           │                        ▼
└─────────┬────────────┘               ┌───────────────────────┐
          │                            │  GET /api/skills       │
          │                            │  → SkillCatalogEntry[] │
          │                            └────────┬──────────────┘
          │                                     │
          ▼                                     ▼
┌─────────────────────┐               ┌───────────────────────┐
│  employee_skills     │               │  useSkillsStore       │
│  (DB: 员工绑定)      │               │  displayNameMap:      │
│                      │               │  name → nameZh ?? name│
│  skill_installations │               └────────┬──────────────┘
│  (DB: 全局启停)      │                        │
└─────────┬────────────┘                        ▼
          │                            ┌───────────────────────┐
          ▼                            │  UI 组件展示           │
┌─────────────────────┐               │  EmployeeCard.vue     │
│ prepareEmployeeRuntime│              │  ProfileCard.vue      │
│ 合并算法:            │               │  EmployeeFormSlideOver│
│ bound ∪ globalEnabled│               │                       │
│ → skillNames[]       │               │  显示: nameZh || name │
└─────────┬────────────┘               └───────────────────────┘
          │
          ▼
┌─────────────────────┐
│ EmployeeRunService   │
│ → gateway.runTurn()  │
│ → metadata.requested │
│   _skills            │
└─────────┬────────────┘
          │
          ▼
┌─────────────────────┐
│ AgentLoop            │
│ 1. 解析 metadata     │
│ 2. 去重 + 截断(≤8)   │
│ 3. 用户消息前缀注入  │
│    [Requested skills │
│     for this turn:]  │
└─────────┬────────────┘
          │
          ▼
┌─────────────────────┐
│ ContextBuilder       │
│ buildSystemPrompt:   │
│ 1. Requested Skills  │
│    (SKILL.md 全文)   │
│ 2. Available Skills  │
│    (XML 摘要)        │
│ 3. Always Skills     │
│    (始终注入)        │
└─────────────────────┘
```

---

## 四、关键注意事项

1. **8 技能上限**：`AgentLoop` 对 `requested_skills` 最多保留 8 个，超过会被截断（无警告）
2. **always 技能不受限制**：SKILL.md 中标记 `always: true` 的技能始终注入，不计入 8 个限制
3. **全局启用会无条件并入**：即使员工没有绑定某技能，只要该技能在 `skill_installations` 中 `enabled=true`，就会加入该员工的技能集合
4. **员工绑定优先于全局禁用**：员工明确绑定的技能（`enabled=true`）始终生效，不受全局 `skill_installations` 表中 `enabled=false` 的影响。全局禁用仅影响"未被任何员工绑定但通过全局启用并入"的技能
5. **展示名回退**：所有 UI 统一优先显示 `nameZh`（SKILL.md frontmatter 的 `name_zh`），无则回退到目录名
6. **绑定是全量替换**：创建/更新员工时，`replaceForEmployee()` 先删除旧绑定再插入新绑定

---

## 测试/验证/验收方式

- 代码改动涉及 `packages/nextclaw-digital-employee`，需执行受影响包的 `build`/`tsc`
- 冒烟验证：创建一个员工绑定某技能 → 将该技能全局禁用 → 该员工运行时仍能获取该技能

## 发布/部署方式

- 随下一次 `@nextclaw/digital-employee` 发版一同发布

## 用户/产品视角的验收步骤

1. 阅读本文档，确认描述与产品期望行为一致
2. 验证：员工绑定的技能不受全局禁用影响
3. 验证：全局启用的技能仍能无条件并入所有员工

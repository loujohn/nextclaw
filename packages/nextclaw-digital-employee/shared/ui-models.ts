export type ScheduleSummaryInput = {
  scheduleKind: string;
  nextRunAt?: string | null;
} | null;

export type DashboardSummaryInput = {
  employees: Array<{ id: string; status: string; schedule: ScheduleSummaryInput }>;
  runs: Array<{ id: string; status: string; triggerType: string }>;
  installedSkills: Array<{ skillName: string; enabled: boolean }>;
};

export type SkillCatalogInput = {
  availableSkills: Array<{ name: string; path: string; source: string; description?: string }>;
  installations: Array<{ skillName: string; sourceType: string; sourceUri: string; enabled: boolean }>;
  skillBindings: Array<{ employeeId: string; employeeName: string; skillName: string }>;
};

export type DashboardSummaryView = {
  totalEmployees: number;
  activeEmployees: number;
  scheduledEmployees: number;
  failedRuns: number;
  enabledSkills: number;
};

export type SkillCatalogEntryView = {
  name: string;
  path: string;
  source: string;
  sourceType: string;
  sourceUri: string | null;
  enabled: boolean;
  usageCount: number;
  usedBy: string[];
  statusLabel: string;
  purpose: string;
  categoryLabel: string;
};

export type ChatMessageView = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
};

export type ChatResultCardKind = "summary" | "projects" | "owners" | "actions" | "details" | "error";

export type ChatResultCardView = {
  kind: ChatResultCardKind;
  title: string;
  content: string;
  items: string[];
  tone: "teal" | "amber" | "slate" | "rose";
};

export type RunListInput = {
  employees: Array<{ id: string; name: string }>;
  jobs?: Array<{ id: string; name: string }>;
  runs: Array<{
    id: string;
    employeeId: string | null;
    triggerType: string;
    triggerSource: string;
    status: string;
    startedAt: string;
    summary: string;
    result: Record<string, unknown>;
  }>;
};

export type RunListEntryView = {
  id: string;
  employeeName: string;
  statusLabel: string;
  triggerLabel: string;
  scheduleJobName: string | null;
  summary: string;
  highlight: string;
  tone: "teal" | "amber" | "slate" | "danger";
  startedAtLabel: string;
};

export type IntegrationCardsInput = {
  model: {
    provider: string;
    model: string;
    apiBase: string | null;
    configured: boolean;
  };
  integrations: Array<{
    type: string;
    name: string;
    enabled: boolean;
    lastCheckedAt: string | null;
  }>;
};

export type IntegrationCardView = {
  id: string;
  title: string;
  statusLabel: string;
  description: string;
  detail: string;
  actionLabel: string;
  tone: "teal" | "amber" | "slate";
};

const SECTION_META: Array<{
  kind: ChatResultCardKind;
  title: string;
  keywords: string[];
  tone: ChatResultCardView["tone"];
}> = [
  { kind: "summary", title: "管理摘要", keywords: ["管理摘要", "摘要", "结论"], tone: "teal" },
  { kind: "projects", title: "项目维度", keywords: ["项目维度", "项目明细", "项目"], tone: "slate" },
  { kind: "owners", title: "负责人/成员维度", keywords: ["负责人/成员维度", "负责人", "成员"], tone: "amber" },
  { kind: "actions", title: "建议动作", keywords: ["建议动作", "建议", "下一步"], tone: "teal" }
];

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatScheduleSummary(schedule: ScheduleSummaryInput): string {
  if (!schedule) {
    return "未配置自动运行";
  }
  if (schedule.scheduleKind === "heartbeat") {
    return "心跳巡检";
  }
  if (schedule.scheduleKind === "every") {
    return "固定间隔运行";
  }
  if (schedule.nextRunAt) {
    return `下次运行 ${formatDateTime(schedule.nextRunAt)}`;
  }
  return "按计划自动运行";
}

export function buildDashboardSummary(input: DashboardSummaryInput): DashboardSummaryView {
  return {
    totalEmployees: input.employees.length,
    activeEmployees: input.employees.filter((employee) => employee.status === "active").length,
    scheduledEmployees: input.employees.filter((employee) => Boolean(employee.schedule)).length,
    failedRuns: input.runs.filter((run) => run.status === "failed").length,
    enabledSkills: input.installedSkills.filter((skill) => skill.enabled).length
  };
}

function inferSkillPurpose(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("summar")) {
    return "用于汇总项目状态、生成日报或管理摘要。";
  }
  if (normalized.includes("skill")) {
    return "用于扩展员工能力或辅助生成新的技能草案。";
  }
  if (normalized.includes("weather")) {
    return "用于获取外部环境信息并补充上下文。";
  }
  if (normalized.includes("cron") || normalized.includes("tmux")) {
    return "用于系统调度、执行辅助或运行时编排。";
  }
  if (normalized.includes("github")) {
    return "用于读取研发协作信息并辅助产出研发侧结果。";
  }
  return "用于扩展员工的任务执行能力。";
}

function inferSkillCategory(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("summar")) {
    return "内容生成";
  }
  if (normalized.includes("github") || normalized.includes("weather")) {
    return "外部数据";
  }
  if (normalized.includes("skill")) {
    return "平台扩展";
  }
  return "通用能力";
}

export function buildSkillCatalogEntries(input: SkillCatalogInput): SkillCatalogEntryView[] {
  const installationMap = new Map(input.installations.map((installation) => [installation.skillName, installation]));
  const usageMap = new Map<string, string[]>();
  for (const binding of input.skillBindings) {
    const existing = usageMap.get(binding.skillName) ?? [];
    if (!existing.includes(binding.employeeName)) {
      existing.push(binding.employeeName);
      usageMap.set(binding.skillName, existing);
    }
  }
  return [...input.availableSkills]
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .map((skill) => {
      const installation = installationMap.get(skill.name);
      const usedBy = usageMap.get(skill.name) ?? [];
      const enabled = installation?.enabled ?? skill.source === "builtin";
      return {
        name: skill.name,
        path: skill.path,
        source: skill.source,
        sourceType: installation?.sourceType ?? skill.source,
        sourceUri: installation?.sourceUri ?? null,
        enabled,
        usageCount: usedBy.length,
        usedBy,
        statusLabel: installation ? (enabled ? "已启用" : "已停用") : skill.source === "builtin" ? "内置可用" : "已发现未登记",
        purpose: skill.description?.trim() || inferSkillPurpose(skill.name),
        categoryLabel: inferSkillCategory(skill.name)
      };
    });
}

function cleanReplyLines(reply: string): string[] {
  return reply
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeListItem(line: string): string {
  return line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
}

function matchSectionMeta(title: string): { kind: ChatResultCardKind; title: string; tone: ChatResultCardView["tone"] } {
  const found = SECTION_META.find((item) => item.keywords.some((keyword) => title.includes(keyword)));
  if (found) {
    return found;
  }
  return {
    kind: "details",
    title,
    tone: "slate"
  };
}

export function buildChatResultCards(reply: string): ChatResultCardView[] {
  const content = reply.trim();
  if (!content) {
    return [
      {
        kind: "summary",
        title: "管理摘要",
        content: "本次执行暂未返回结果。",
        items: [],
        tone: "slate"
      }
    ];
  }

  const lines = cleanReplyLines(content);
  const cards: ChatResultCardView[] = [];
  let currentTitle = "管理摘要";
  let bucket: string[] = [];

  const flush = (): void => {
    if (bucket.length === 0) {
      return;
    }
    const meta = matchSectionMeta(currentTitle);
    const items = bucket.map(normalizeListItem).filter(Boolean);
    cards.push({
      kind: meta.kind,
      title: meta.title,
      content: items[0] ?? "",
      items,
      tone: meta.tone
    });
    bucket = [];
  };

  for (const line of lines) {
    const titleMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (titleMatch) {
      flush();
      currentTitle = titleMatch[1]?.trim() || "管理摘要";
      continue;
    }
    bucket.push(line);
  }
  flush();

  if (cards.length === 0) {
    return [
      {
        kind: "summary",
        title: "管理摘要",
        content,
        items: [content],
        tone: "teal"
      }
    ];
  }
  return cards;
}

export function translateRunText(text: string): string {
  if (!text) return text;
  if (/^HEARTBEAT_OK$/i.test(text.trim())) return "心跳正常";
  return text
    .replace(/\bHEARTBEAT_OK\b/gi, "心跳正常")
    .replace(/\bError:\s*Connection\s+error\b/gi, "错误：连接失败")
    .replace(/\bConnection\s+error\b/gi, "连接失败")
    .replace(/\bNetwork\s+error\b/gi, "网络错误")
    .replace(/\bConnection\s+timeout\b/gi, "连接超时")
    .replace(/\bRequest\s+timeout\b/gi, "请求超时")
    .replace(/\bFailed\s+to\s+fetch\b/gi, "请求失败")
    .replace(/\bFetch\s+failed\b/gi, "请求失败");
}

function readFirstCardContent(result: Record<string, unknown>): string {
  const cards = Array.isArray(result.resultCards) ? result.resultCards : [];
  const firstCard = cards[0];
  if (firstCard && typeof firstCard === "object" && firstCard !== null) {
    const maybeContent = Reflect.get(firstCard, "content");
    if (typeof maybeContent === "string" && maybeContent.trim()) {
      return maybeContent.trim();
    }
  }
  return "";
}

function formatTriggerLabel(triggerType: string, triggerSource: string): string {
  if (triggerSource === "chat" || triggerType === "manual") {
    return "聊天触发";
  }
  if (triggerType === "scheduled") {
    return "自动运行";
  }
  return "手动触发";
}

function formatRunStatus(status: string): { label: string; tone: RunListEntryView["tone"] } {
  if (status === "completed") {
    return { label: "已完成", tone: "teal" };
  }
  if (status === "failed") {
    return { label: "执行失败", tone: "danger" };
  }
  if (status === "running") {
    return { label: "执行中", tone: "amber" };
  }
  return { label: "等待中", tone: "slate" };
}

export function formatRunStatusLabel(status: string): string {
  return formatRunStatus(status).label;
}

export function buildRunListEntries(input: RunListInput): RunListEntryView[] {
  const employeeNameMap = new Map(input.employees.map((employee) => [employee.id, employee.name]));
  const jobNameMap = new Map((input.jobs ?? []).map((job) => [job.id, job.name]));
  return input.runs.map((run) => {
    const statusMeta = formatRunStatus(run.status);
    const rawHighlight = readFirstCardContent(run.result) || run.summary || "等待执行结果";
    const highlight = translateRunText(rawHighlight);
    const isScheduled = run.triggerType === "scheduled";
    const scheduleJobName = isScheduled ? (jobNameMap.get(run.triggerSource) ?? null) : null;
    return {
      id: run.id,
      employeeName: employeeNameMap.get(run.employeeId ?? "") ?? "未关联员工",
      statusLabel: statusMeta.label,
      triggerLabel: formatTriggerLabel(run.triggerType, run.triggerSource),
      scheduleJobName,
      summary: translateRunText(run.summary || "尚未生成摘要"),
      highlight,
      tone: statusMeta.tone,
      startedAtLabel: formatDateTime(run.startedAt)
    };
  });
}

function buildModelDetail(input: IntegrationCardsInput["model"]): string {
  if (!input.configured) {
    return "尚未配置 API Key、模型名称或接入地址。";
  }
  const base = input.apiBase ? ` · ${input.apiBase}` : "";
  return `${input.provider} / ${input.model}${base}`;
}

function getIntegrationTitle(type: string): string {
  if (type === "zentao") {
    return "禅道";
  }
  if (type === "dingtalk") {
    return "钉钉";
  }
  return type;
}

// ── Automation Summary (multi-job model) ──────────────────────────────────────

export type AutomationJobBrief = {
  enabled: boolean;
  nextRunAt: string | null;
};

export type AutomationSummaryView = {
  totalJobs: number;
  enabledJobs: number;
  nextScheduledRunAt: string | null;
  hasFailedRecently: boolean;
  countLabel: string;
  statusLabel: string;
  tone: "teal" | "amber" | "slate" | "danger";
  healthOk: boolean;
};

export function buildAutomationSummary(
  jobs: AutomationJobBrief[],
  recentScheduledRuns: Array<{ status: string }>
): AutomationSummaryView {
  const totalJobs = jobs.length;
  const enabledJobs = jobs.filter((j) => j.enabled).length;
  const pausedJobs = totalJobs - enabledJobs;

  const nextScheduledRunAt =
    jobs
      .filter((j) => j.enabled && j.nextRunAt)
      .map((j) => j.nextRunAt!)
      .sort()[0] ?? null;

  const hasFailedRecently = recentScheduledRuns.some((r) => r.status === "failed");

  const countLabel =
    totalJobs === 0 ? "暂无任务" : totalJobs === 1 ? "1 个任务" : `${totalJobs} 个任务`;

  let statusLabel: string;
  let tone: AutomationSummaryView["tone"];
  let healthOk: boolean;

  if (totalJobs === 0) {
    statusLabel = "未配置";
    tone = "slate";
    healthOk = false;
  } else if (hasFailedRecently) {
    statusLabel = "存在失败";
    tone = "danger";
    healthOk = false;
  } else if (enabledJobs === 0) {
    statusLabel = "全部暂停";
    tone = "amber";
    healthOk = false;
  } else if (pausedJobs > 0) {
    statusLabel = `${pausedJobs} 个暂停`;
    tone = "amber";
    healthOk = false;
  } else {
    statusLabel = "运行健康";
    tone = "teal";
    healthOk = true;
  }

  return {
    totalJobs,
    enabledJobs,
    nextScheduledRunAt,
    hasFailedRecently,
    countLabel,
    statusLabel,
    tone,
    healthOk
  };
}

export function buildIntegrationCards(input: IntegrationCardsInput): IntegrationCardView[] {
  const integrationMap = new Map(input.integrations.map((item) => [item.type, item]));
  const cards: IntegrationCardView[] = [
    {
      id: "model",
      title: "模型提供商",
      statusLabel: input.model.configured ? "已配置" : "待配置",
      description: input.model.configured ? "当前聊天与自动运行都可调用模型。" : "员工对话和自动运行仍缺少模型能力。",
      detail: buildModelDetail(input.model),
      actionLabel: "管理模型",
      tone: input.model.configured ? "teal" : "amber"
    }
  ];

  for (const type of ["zentao", "dingtalk"]) {
    const integration = integrationMap.get(type);
    const enabled = Boolean(integration?.enabled);
    cards.push({
      id: type,
      title: getIntegrationTitle(type),
      statusLabel: enabled ? "已连接" : "待配置",
      description: enabled
        ? `${getIntegrationTitle(type)} 已可用于员工自动任务与结果投递。`
        : `尚未接入 ${getIntegrationTitle(type)}，相关员工无法完成业务闭环。`,
      detail: integration?.name
        ? `${integration.name}${integration.lastCheckedAt ? ` · 最近检查 ${formatDateTime(integration.lastCheckedAt)}` : ""}`
        : `还没有可用的 ${getIntegrationTitle(type)} 连接。`,
      actionLabel: enabled ? "查看配置" : "去配置",
      tone: enabled ? "teal" : "amber"
    });
  }

  return cards;
}

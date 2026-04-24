/**
 * NO_PROXY 规则解析与匹配的纯函数工具。
 *
 * 语义与 curl / Go / Python requests 对齐，同时兼容常见"通配符"写法：
 * - 未配置：返回空规则集 → 所有请求经代理出站；
 * - `*`：全通配；
 * - `foo.com` / `.foo.com` / `*.foo.com`：统一宽松语义，匹配 `foo.com`
 *   自身以及其所有子域，避免调用方因前缀差异产生歧义；
 * - `foo.com:8080`：解析时剥离端口后按 host 规则匹配；
 * - 无法识别的规则自动丢弃，不影响其它规则生效；
 * - 全部比较均大小写不敏感。
 *
 * 设计约束：
 * - 纯函数、无副作用、输入输出可预测，便于单元测试覆盖；
 * - 代码中不内置任何默认 NO_PROXY 规则，全部由调用方（即部署环境
 *   变量）决定。
 */

export type NoProxyRule = {
  /** 归一化后的匹配目标 host（不带端口、不带前缀） */
  host: string;
  /** 是否匹配所有 host（`*` 规则） */
  matchAll: boolean;
  /**
   * 原始写法是否带 `.` 或 `*.` 前缀，仅用于日志回显以便运维核对配置。
   * 匹配行为与该字段无关。
   */
  suffixOnly: boolean;
};

export function parseNoProxyRule(rawRule: string): NoProxyRule | null {
  const trimmed = rawRule.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "*") return { host: "*", matchAll: true, suffixOnly: false };

  let value = trimmed;
  if (value.startsWith("*.")) value = value.slice(2);
  else if (value.startsWith(".")) value = value.slice(1);

  const lastColon = value.lastIndexOf(":");
  const lastBracket = value.lastIndexOf("]");
  if (lastColon > -1 && lastColon > lastBracket) {
    value = value.slice(0, lastColon);
  }

  if (!value) return null;

  const suffixOnly = trimmed.startsWith("*.") || trimmed.startsWith(".");
  return { host: value, matchAll: false, suffixOnly };
}

export function parseNoProxy(raw: string | undefined): NoProxyRule[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(parseNoProxyRule)
    .filter((rule): rule is NoProxyRule => rule !== null);
}

export function matchesNoProxyRule(hostname: string, rule: NoProxyRule): boolean {
  if (rule.matchAll) return true;
  const host = hostname.toLowerCase();
  if (host === rule.host) return true;
  return host.endsWith(`.${rule.host}`);
}

export function shouldBypassProxy(hostname: string, rules: NoProxyRule[]): boolean {
  if (!hostname || !rules.length) return false;
  return rules.some((rule) => matchesNoProxyRule(hostname, rule));
}

export function formatNoProxyRulesForLog(rules: NoProxyRule[]): string {
  if (!rules.length) return "(none)";
  return rules
    .map((rule) => (rule.matchAll ? "*" : rule.suffixOnly ? `.${rule.host}` : rule.host))
    .join(",");
}

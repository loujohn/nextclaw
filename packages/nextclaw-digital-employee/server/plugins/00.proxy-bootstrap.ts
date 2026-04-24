import http from "node:http";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

/**
 * 代理引导插件。
 *
 * 同时覆盖两条出站路径，并原生支持 NO_PROXY（内网直连、外网走代理）：
 *
 * 1. fetch / ofetch / $fetch：底层走 undici → 通过 `EnvHttpProxyAgent`
 *    自动读取 HTTP_PROXY / HTTPS_PROXY / NO_PROXY；
 * 2. http.request / https.request：通过自定义 ProxyAwareAgent
 *    替换 globalAgent，按目标 host 动态选择走代理或直连。
 *
 * 设计约束：
 * - 未配置任何 *_PROXY 时整个插件不生效，保持零侵入；
 * - NO_PROXY 未配置视为"全部走代理"（长度为 0 的规则集），行为与
 *   curl / Go / Python requests 一致；
 * - 支持常见 NO_PROXY 通配写法，匹配规则在 {@link matchesNoProxyRule}
 *   中集中处理，避免调用点出现歧义。
 */

type ClientRequest = http.ClientRequest;
type AgentRequestOptions = http.RequestOptions & {
  hostname?: string;
  host?: string;
};
type AgentWithAddRequest = http.Agent & {
  addRequest(req: ClientRequest, options: AgentRequestOptions): void;
};

type NoProxyRule = {
  /** 归一化后的匹配目标（hostname，不带端口、不带前缀） */
  host: string;
  /** 是否匹配所有 host（`*` 规则） */
  matchAll: boolean;
  /** 是否为"域名 + 所有子域"匹配（`.foo.com` / `*.foo.com` 等） */
  suffixOnly: boolean;
};

/**
 * 解析单条 NO_PROXY 规则，兼容常见写法：
 * - `*`                     → 全通配
 * - `foo.com`               → 精确匹配 `foo.com` 自身及其所有子域
 * - `.foo.com` / `*.foo.com`→ 仅匹配 `foo.com` 的子域（含自身，向后兼容最宽松语义）
 * - `foo.com:8080`          → 去掉端口部分后按 host 规则匹配
 *
 * 为避免规则歧义，在无法识别时返回 null（调用方会跳过该条）。
 */
function parseNoProxyRule(rawRule: string): NoProxyRule | null {
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

function parseNoProxy(raw: string | undefined): NoProxyRule[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(parseNoProxyRule)
    .filter((rule): rule is NoProxyRule => rule !== null);
}

function matchesNoProxyRule(hostname: string, rule: NoProxyRule): boolean {
  if (rule.matchAll) return true;
  const host = hostname.toLowerCase();
  if (host === rule.host) return true;
  return host.endsWith(`.${rule.host}`);
}

function shouldBypassProxy(hostname: string, rules: NoProxyRule[]): boolean {
  if (!hostname || !rules.length) return false;
  return rules.some((rule) => matchesNoProxyRule(hostname, rule));
}

class ProxyAwareAgent extends http.Agent {
  constructor(
    private readonly proxyAgent: AgentWithAddRequest,
    private readonly directAgent: AgentWithAddRequest,
    private readonly bypassRules: NoProxyRule[]
  ) {
    super();
  }

  addRequest(req: ClientRequest, options: AgentRequestOptions): void {
    const host = options.hostname ?? options.host ?? "";
    const delegate =
      host && shouldBypassProxy(host, this.bypassRules)
        ? this.directAgent
        : this.proxyAgent;
    delegate.addRequest(req, options);
  }
}

function formatRulesForLog(rules: NoProxyRule[]): string {
  if (!rules.length) return "(none)";
  return rules
    .map((rule) => (rule.matchAll ? "*" : rule.suffixOnly ? `.${rule.host}` : rule.host))
    .join(",");
}

export default defineNitroPlugin(() => {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) return;

  setGlobalDispatcher(new EnvHttpProxyAgent());

  const bypassRules = parseNoProxy(process.env.NO_PROXY ?? process.env.no_proxy);
  const proxyAgent = new HttpsProxyAgent(proxyUrl) as unknown as AgentWithAddRequest;
  const directHttpAgent = new http.Agent() as AgentWithAddRequest;
  const directHttpsAgent = new https.Agent() as unknown as AgentWithAddRequest;

  http.globalAgent = new ProxyAwareAgent(proxyAgent, directHttpAgent, bypassRules);
  https.globalAgent = new ProxyAwareAgent(
    proxyAgent,
    directHttpsAgent,
    bypassRules
  ) as unknown as https.Agent;

  console.log(
    `[proxy-bootstrap] proxy=${proxyUrl} noProxy=${formatRulesForLog(bypassRules)}`
  );
});

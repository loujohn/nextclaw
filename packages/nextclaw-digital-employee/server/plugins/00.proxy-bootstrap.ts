import http from "node:http";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import {
  type NoProxyRule,
  formatNoProxyRulesForLog,
  parseNoProxy,
  shouldBypassProxy
} from "../utils/no-proxy";

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
 * - NO_PROXY 未配置视为"全部走代理"；
 * - NO_PROXY 规则解析与匹配统一委托给 utils/no-proxy，避免重复实现
 *   并便于单元测试覆盖。
 */

type ClientRequest = http.ClientRequest;
type AgentRequestOptions = http.RequestOptions & {
  hostname?: string;
  host?: string;
};
type AgentWithAddRequest = http.Agent & {
  addRequest(req: ClientRequest, options: AgentRequestOptions): void;
};

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
    const bypass = shouldBypassProxy(host, this.bypassRules);
    console.log(`[proxy-bootstrap] http.request host=${host} bypass=${bypass}`);
    const delegate = bypass ? this.directAgent : this.proxyAgent;
    delegate.addRequest(req, options);
  }
}

class TracingEnvHttpProxyAgent extends EnvHttpProxyAgent {
  dispatch(
    opts: Parameters<EnvHttpProxyAgent["dispatch"]>[0],
    handlers: Parameters<EnvHttpProxyAgent["dispatch"]>[1]
  ) {
    const origin = opts.origin ?? "";
    const path = opts.path ?? "";
    console.log(`[proxy-bootstrap] undici origin=${origin} path=${path}`);
    return super.dispatch(opts, handlers);
  }
}

export default defineNitroPlugin(() => {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) return;

  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? "";

  setGlobalDispatcher(
    new TracingEnvHttpProxyAgent({
      httpProxy: proxyUrl,
      httpsProxy: proxyUrl,
      noProxy,
    })
  );

  const bypassRules = parseNoProxy(noProxy);
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
    `[proxy-bootstrap] proxy=${proxyUrl} noProxy=${formatNoProxyRulesForLog(bypassRules)}`
  );
});
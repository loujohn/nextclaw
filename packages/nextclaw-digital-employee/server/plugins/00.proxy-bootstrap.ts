import http from "node:http";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";

function matchesNoProxy(hostname: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const p = pattern.startsWith(".") ? pattern.slice(1) : pattern;
  return hostname === p || hostname.endsWith("." + p);
}

function buildAgent(proxyUrl: string): http.Agent {
  const noProxyPatterns = (process.env.NO_PROXY ?? process.env.no_proxy ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (noProxyPatterns.length === 0) return new HttpsProxyAgent(proxyUrl) as unknown as http.Agent;

  // 返回一个动态决策的 agent，按目标 hostname 决定是否走代理
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  const directAgent = new http.Agent();

  return new Proxy(directAgent, {
    get(target, prop) {
      if (prop !== "addRequest") return (target as any)[prop];
      return function (req: http.ClientRequest, options: http.RequestOptions) {
        const hostname = options.hostname ?? options.host ?? "";
        const bypass = noProxyPatterns.some((p) => matchesNoProxy(hostname, p));
        const chosen = bypass ? target : (proxyAgent as unknown as http.Agent);
        return (chosen as any).addRequest(req, options);
      };
    },
  });
}

export default defineNitroPlugin(() => {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) return;

  const agent = buildAgent(proxyUrl);
  http.globalAgent = agent;
  https.globalAgent = agent as unknown as https.Agent;

  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy ?? "(none)";
  console.log(`[proxy-bootstrap] global agent patched → ${proxyUrl}, NO_PROXY=${noProxy}`);
});

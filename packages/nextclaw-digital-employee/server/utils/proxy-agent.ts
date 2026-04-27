import http from "node:http";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { parseNoProxy, shouldBypassProxy } from "./no-proxy";

export type ProxyRoute = "direct" | "proxy";

export type ResolvedHttpRequestAgent = {
  agent?: http.Agent | https.Agent | HttpsProxyAgent<string>;
  proxyUrl?: string;
  route: ProxyRoute;
};

function resolveProxyUrl(protocol: string): string | undefined {
  if (protocol === "http:") {
    return (
      process.env.HTTP_PROXY ??
      process.env.http_proxy ??
      process.env.HTTPS_PROXY ??
      process.env.https_proxy
    );
  }

  return (
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy
  );
}

function createDirectAgent(protocol: string): http.Agent | https.Agent {
  return protocol === "https:" ? new https.Agent() : new http.Agent();
}

export function resolveHttpRequestAgent(
  rawUrl: string | URL
): ResolvedHttpRequestAgent {
  const url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  const proxyUrl = resolveProxyUrl(url.protocol);
  if (!proxyUrl) {
    return { route: "direct" };
  }

  const bypassRules = parseNoProxy(process.env.NO_PROXY ?? process.env.no_proxy);
  if (shouldBypassProxy(url.hostname, bypassRules)) {
    return {
      agent: createDirectAgent(url.protocol),
      route: "direct",
    };
  }

  return {
    agent: new HttpsProxyAgent(proxyUrl),
    proxyUrl,
    route: "proxy",
  };
}

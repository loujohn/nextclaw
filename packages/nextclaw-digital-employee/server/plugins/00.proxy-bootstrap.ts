import http from "node:http";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ProxyAgent, setGlobalDispatcher } from "undici";

export default defineNitroPlugin(() => {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) return;

  // 覆盖 node http/https globalAgent
  const agent = new HttpsProxyAgent(proxyUrl);
  http.globalAgent = agent as unknown as http.Agent;
  https.globalAgent = agent as unknown as https.Agent;

  // 覆盖 undici dispatcher
  const undiciAgent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(undiciAgent);

  console.log(`[proxy-bootstrap] global agent patched → ${proxyUrl}`);
});
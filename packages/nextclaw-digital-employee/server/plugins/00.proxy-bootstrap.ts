import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import {
  formatNoProxyRulesForLog,
  parseNoProxy
} from "../utils/no-proxy";

/**
 * 代理引导插件。
 *
 * 只配置 fetch / ofetch / $fetch 的 undici 出站代理。
 *
 * 1. fetch / ofetch / $fetch：底层走 undici → 通过 `EnvHttpProxyAgent`
 *    自动读取 HTTP_PROXY / HTTPS_PROXY / NO_PROXY；
 *
 * 设计约束：
 * - 未配置任何 *_PROXY 时整个插件不生效，保持零侵入；
 * - NO_PROXY 未配置视为"全部走代理"；
 * - 不替换 http.globalAgent / https.globalAgent，避免影响同进程插件和
 *   第三方 SDK 自己的代理实现；
 * - 自有 http.request / https.request 调用必须在调用点显式传入代理 agent。
 */

export default defineNitroPlugin(() => {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) return;

  setGlobalDispatcher(new EnvHttpProxyAgent());

  const bypassRules = parseNoProxy(process.env.NO_PROXY ?? process.env.no_proxy);

  console.log(
    `[proxy-bootstrap] fetch proxy=${proxyUrl} noProxy=${formatNoProxyRulesForLog(bypassRules)}`
  );
});

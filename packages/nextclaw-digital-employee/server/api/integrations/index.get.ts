import { getPlatformContext, buildPlatformGatewayConfig } from "../../runtime/platform-context";
import { buildIntegrationCards } from "../../../shared/ui-models";
import { getDingTalkChannelConfig } from "../../runtime/dingtalk-config";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const config = buildPlatformGatewayConfig();
  const dingtalk = await getDingTalkChannelConfig(ctx.integrationConnectionRepo);
  const [providerName] = Object.keys(config.providers);
  const providerConfig = providerName ? (config.providers[providerName] ?? { apiKey: "", apiBase: null }) : { apiKey: "", apiBase: null };

  return {
    ok: true,
    data: buildIntegrationCards({
      model: {
        provider: providerName ?? "openai",
        model: config.agents.defaults.model,
        apiBase: providerConfig.apiBase,
        configured: Boolean(providerConfig.apiKey && config.agents.defaults.model)
      },
      integrations: [
        {
          type: "zentao",
          enabled: true,
          name: "禅道生产环境",
          lastCheckedAt: "2026-03-26T08:00:00.000Z"
        },
        {
          type: "dingtalk",
          enabled: dingtalk.enabled,
          name:
            dingtalk.accounts.length > 0
              ? `默认 ${dingtalk.defaultAccountId} · ${dingtalk.accounts.length} 个机器人入口`
              : "",
          lastCheckedAt: null
        }
      ]
    })
  };
});

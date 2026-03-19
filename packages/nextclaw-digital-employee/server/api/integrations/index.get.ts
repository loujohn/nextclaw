import { getPlatformContext, buildPlatformGatewayConfig } from "../../runtime/platform-context";
import { buildIntegrationCards } from "../../../shared/ui-models";
import { getDingTalkChannelConfig } from "../../runtime/dingtalk-config";

export default defineEventHandler(async () => {
  await getPlatformContext();
  const config = buildPlatformGatewayConfig();
  const dingtalk = getDingTalkChannelConfig();
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
          type: "dingtalk",
          enabled: dingtalk.enabled,
          name: dingtalk.clientId,
          lastCheckedAt: null
        }
      ]
    })
  };
});

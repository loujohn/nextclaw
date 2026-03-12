import { getPlatformContext, buildPlatformGatewayConfig } from "../../runtime/platform-context";
import { buildIntegrationCards } from "../../../shared/ui-models";

export default defineEventHandler(async () => {
  await getPlatformContext();
  const config = buildPlatformGatewayConfig();
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
      integrations: []
    })
  };
});

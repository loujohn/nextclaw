import { buildPlatformGatewayConfig } from "../../runtime/platform-context";

export default defineEventHandler(() => {
  const { agents } = buildPlatformGatewayConfig();
  return { ok: true, data: { model: agents.defaults.model } };
});

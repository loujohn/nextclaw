import { getPlatformContext } from "../../runtime/platform-context";
import { getDingTalkChannelConfig, getDingTalkRoutingConfig } from "../../runtime/dingtalk-config";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  return {
    ok: true,
    data: {
      channel: await getDingTalkChannelConfig(ctx.integrationConnectionRepo),
      routing: await getDingTalkRoutingConfig(ctx.integrationConnectionRepo)
    }
  };
});

import { getPlatformContext } from "../../runtime/platform-context";
import { getDingTalkRoutingConfig } from "../../runtime/dingtalk-config";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const routing = await getDingTalkRoutingConfig(ctx.integrationConnectionRepo);
  return {
    ok: true,
    data: routing.groups
  };
});

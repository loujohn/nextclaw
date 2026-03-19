import { getPlatformContext } from "../../runtime/platform-context";
import { getDingTalkChannelConfig } from "../../runtime/dingtalk-config";

export default defineEventHandler(async () => {
  await getPlatformContext();
  return {
    ok: true,
    data: getDingTalkChannelConfig()
  };
});

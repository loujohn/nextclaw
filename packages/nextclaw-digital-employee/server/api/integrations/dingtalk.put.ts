import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import {
  applyDingTalkConfigUpdate,
  type DingTalkChannelUpdate,
  type DingTalkEmployeeBindingsView
} from "../../runtime/dingtalk-config";

type UpdateDingTalkBody = {
  channel?: DingTalkChannelUpdate;
  routing?: DingTalkEmployeeBindingsView;
};

export default defineEventHandler(async (event) => {
  const ctx = await getPlatformContext();
  const body = await readBody<UpdateDingTalkBody>(event);
  try {
    const { channel, routing } = await applyDingTalkConfigUpdate(ctx.integrationConnectionRepo, {
      channel: body?.channel,
      routing: body?.routing,
      reload: () => ctx.channelRuntime.reload()
    });
    return {
      ok: true,
      data: {
        channel,
        routing
      }
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});

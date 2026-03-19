import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { updateDingTalkChannelConfig, type DingTalkChannelUpdate } from "../../runtime/dingtalk-config";

export default defineEventHandler(async (event) => {
  await getPlatformContext();
  const body = await readBody<DingTalkChannelUpdate>(event);
  try {
    const data = updateDingTalkChannelConfig(body ?? {});
    return {
      ok: true,
      data
    };
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : String(error)
    });
  }
});

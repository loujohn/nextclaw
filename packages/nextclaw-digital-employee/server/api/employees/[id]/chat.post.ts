import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

type ChatBody = {
  message?: string;
};

export default defineEventHandler(async (event) => {
  const employeeId = getRouterParam(event, "id") ?? "";
  const body = await readBody<ChatBody>(event);
  const message = body?.message?.trim() ?? "";
  if (!message) {
    throw createError({
      statusCode: 400,
      statusMessage: "message is required"
    });
  }
  const ctx = await getPlatformContext();
  try {
    const result = await ctx.employeeRunService.runEmployeeTurn({
      employeeId,
      message,
      triggerType: "manual",
      triggerSource: "chat"
    });
    return { ok: true, data: result };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (messageText.includes("No API key configured yet")) {
      throw createError({
        statusCode: 400,
        statusMessage: messageText
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: messageText
    });
  }
});

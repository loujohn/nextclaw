import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";
import type { ChatAttachmentView } from "../../../../shared/ui-models";

type ChatBody = {
  message?: string;
  sessionKey?: string;
  attachments?: ChatAttachmentView[];
};

function toSseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const push = (name: string, data: unknown) => {
        controller.enqueue(encoder.encode(toSseFrame(name, data)));
      };

      try {
        await ctx.employeeRunService.streamChatTurn({
          employeeId,
          message,
          attachments: Array.isArray(body?.attachments) ? body.attachments : [],
          sessionKey: body?.sessionKey?.trim() || undefined,
          onEvent: (streamEvent) => {
            push(streamEvent.event, streamEvent.data);
          }
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        push("run_failed", {
          runId: "",
          message: messageText
        });
        push("done", {
          runId: "",
          sessionKey: body?.sessionKey?.trim() || "",
          status: "failed"
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
});

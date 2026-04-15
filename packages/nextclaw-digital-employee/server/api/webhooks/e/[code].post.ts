import { defineEventHandler, readBody, getHeader, getHeaders, getQuery, createError } from "h3";
import { timingSafeEqual } from "node:crypto";
import { getPlatformContext } from "../../../runtime/platform-context";
import { createLogger } from "../../../utils/logger";

const logger = createLogger("Webhook");

const SENSITIVE_HEADERS = new Set([
  "authorization", "cookie", "x-webhook-secret",
]);

function sanitizeHeaders(raw: Partial<Record<string, string | undefined>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || SENSITIVE_HEADERS.has(key.toLowerCase())) continue;
    result[key] = value;
  }
  return result;
}

export default defineEventHandler(async (event) => {
  const code = (event.context.params?.code ?? "").trim();
  if (!code) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getByCode(code);

  if (!employee || !employee.webhookEnabled) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  if (employee.webhookSecret) {
    const query = getQuery(event);
    const tokenFromQuery = typeof query.token === "string" ? query.token : "";
    const tokenFromHeader = getHeader(event, "x-webhook-secret") ?? "";
    const provided = tokenFromQuery || tokenFromHeader;

    const a = Buffer.from(provided);
    const b = Buffer.from(employee.webhookSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      logger.warn(`员工 ${code} 的 Webhook 密钥不匹配`);
      throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
    }
  }

  const body = await readBody(event);
  const headers = sanitizeHeaders(getHeaders(event));

  const message =
    `你收到了一个外部 Webhook 请求，请根据你的技能分析并处理。\n\n` +
    `## 请求头\n\`\`\`json\n${JSON.stringify(headers, null, 2)}\n\`\`\`\n\n` +
    `## 请求体\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\``;

  logger.info(`收到员工 ${code} 的 Webhook 请求，分派处理中...`);

  ctx.employeeRunService
    .runEmployeeTurn({
      employeeId: employee.id,
      message,
      triggerType: "webhook",
      triggerSource: `webhook:${code}`,
      sessionTitle: `Webhook · ${new Date().toISOString().slice(0, 16)}`,
    })
    .then((result) => {
      logger.info(`员工 ${code} 的 Webhook 任务完成 (runId: ${result.runId})`);
    })
    .catch((err) => {
      logger.error(`员工 ${code} 的 Webhook 任务失败:`, err);
    });

  return {
    ok: true,
    message: "Webhook received",
    employee: code,
  };
});

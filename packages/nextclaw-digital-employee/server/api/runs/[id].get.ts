import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { translateRunText } from "../../../shared/ui-models";

export default defineEventHandler(async (event) => {
  const runId = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const run = await ctx.runRepo.getById(runId);
  if (!run) {
    throw createError({
      statusCode: 404,
      statusMessage: `run not found: ${runId}`
    });
  }
  const employee = run.employeeId ? await ctx.employeeRepo.getById(run.employeeId) : null;
  return {
    ok: true,
    data: {
      ...run,
      summary: translateRunText(run.summary ?? ""),
      employeeName: employee?.name ?? "未关联员工",
      statusLabel: run.status === "completed" ? "已完成" : run.status === "failed" ? "执行失败" : "执行中",
      triggerLabel: run.triggerSource === "chat" || run.triggerType === "manual" ? "聊天触发" : "自动运行"
    }
  };
});

import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { translateRunText, formatTriggerLabel } from "../../../shared/ui-models";
import { requireAuth } from "../../utils/auth-guards";
import { resolveRolePermissionAccessScope } from "../../utils/chat-session-access";
import { RUN_RECORD_VIEW_ALL_PERMISSION } from "../../../shared/role-permissions";

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const runId = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const accessScope = await resolveRolePermissionAccessScope(user, ctx.rolePermissionRepo, RUN_RECORD_VIEW_ALL_PERMISSION);
  const run = await ctx.runRepo.getById(runId);
  if (!run) {
    throw createError({
      statusCode: 404,
      statusMessage: `run not found: ${runId}`
    });
  }
  if (accessScope === "own" && run.createdByUserId !== user.id) {
    throw createError({
      statusCode: 404,
      statusMessage: `run not found: ${runId}`
    });
  }
  const [employee, scheduleJob] = await Promise.all([
    run.employeeId ? ctx.employeeRepo.getById(run.employeeId) : Promise.resolve(null),
    run.triggerType === "scheduled" && run.triggerSource && run.triggerSource !== "cron"
      ? ctx.employeeScheduleJobRepo.getById(run.triggerSource)
      : Promise.resolve(null)
  ]);
  const displayNamesById = run.createdByUserId
    ? await ctx.userRepo.listDisplayNamesByIds([run.createdByUserId])
    : {};
  return {
    ok: true,
    data: {
      ...run,
      summary: translateRunText(run.summary ?? ""),
      createdByUserDisplayName: run.createdByUserId ? displayNamesById[run.createdByUserId] ?? null : null,
      employeeName: employee?.name ?? "未关联员工",
      statusLabel:
        run.status === "completed"
          ? "已完成"
          : run.status === "failed"
            ? "执行失败"
            : run.status === "aborted"
              ? "已取消"
              : run.status === "interrupted"
                ? "已中断"
                : "执行中",
      triggerLabel: formatTriggerLabel(run.triggerType, run.triggerSource),
      scheduleJobName: scheduleJob?.name ?? null
    }
  };
});

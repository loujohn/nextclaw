import { createError, getRouterParam } from "h3";
import { join } from "node:path";
import { getPlatformContext } from "../../runtime/platform-context";
import { buildAutomationSummary } from "../../../shared/ui-models";
import { readSkillVersion } from "../../engine/employee-workspace";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({
      statusCode: 404,
      statusMessage: `employee not found: ${id}`
    });
  }
  const [skills, schedule, recentRunsFull, jobs] = await Promise.all([
    ctx.employeeSkillRepo.listByEmployeeId(id),
    ctx.employeeScheduleRepo.getByEmployeeId(id),
    ctx.runRepo.listByEmployeeId(id, 20),
    ctx.employeeScheduleJobRepo.listByEmployeeId(id)
  ]);
  const scheduledRuns = recentRunsFull.filter((r) => r.triggerType === "scheduled");

  // 附加版本对比信息 & 全局技能是否已被删除
  const globalSkillsDir = join(ctx.workspaceDir, "skills");
  const skillsWithVersion = skills.map((skill) => {
    const latestVersion = readSkillVersion(join(globalSkillsDir, skill.skillName));
    return {
      ...skill,
      latestVersion,
      hasUpdate: latestVersion != null && latestVersion !== skill.version,
      /** 全局技能已被删除（文件目录不存在），员工侧副本仍保留 */
      installMissing: latestVersion === null
    };
  });

  const automationSummary = buildAutomationSummary(
    jobs.map((j) => ({ enabled: j.enabled, nextRunAt: j.nextRunAt })),
    scheduledRuns.slice(0, 10).map((r) => ({ status: r.status }))
  );
  const recentRuns = recentRunsFull.map(({ id: runId, status, summary, startedAt, finishedAt }) => ({
    id: runId, status, summary, startedAt, finishedAt,
  }));
  return {
    ok: true,
    data: {
      ...employee,
      skills: skillsWithVersion,
      schedule,
      recentRuns,
      automationSummary,
      health: {
        hasPrompt: Boolean(employee.systemPrompt.trim()),
        hasSkills: skills.length > 0,
        hasSchedule: Boolean(schedule),
        jobsCount: jobs.length,
        enabledJobsCount: jobs.filter((j) => j.enabled).length
      }
    }
  };
});

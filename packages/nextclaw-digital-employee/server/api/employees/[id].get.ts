import { createError, getRouterParam } from "h3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformContext } from "../../runtime/platform-context";
import { buildAutomationSummary } from "../../../shared/ui-models";
import { readSkillVersion, resolveEmployeeWorkspace } from "../../engine/employee-workspace";

function hasSoulFileContent(homeDir: string, employeeCode: string): boolean {
  const soulPath = join(resolveEmployeeWorkspace(homeDir, employeeCode), "SOUL.md");
  if (!existsSync(soulPath)) return false;
  return readFileSync(soulPath, "utf-8").trim().length > 0;
}

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
  const [skills, recentRunsFull, jobs] = await Promise.all([
    ctx.employeeSkillRepo.listByEmployeeId(id),
    ctx.runRepo.listByEmployeeId(id, 20),
    ctx.employeeScheduleJobRepo.listByEmployeeId(id)
  ]);
  const scheduledRuns = recentRunsFull.filter((r) => r.triggerType === "scheduled");

  // 附加版本对比信息 & 全局技能是否已被删除
  const globalSkillsDir = join(ctx.workspaceDir, "skills");
  const skillsWithVersion = skills.map((skill) => {
    const skillDir = join(globalSkillsDir, skill.skillName);
    const globalExists = existsSync(skillDir);
    // 全局技能存在但无 version 字段时，默认视为 1.0.0
    const latestVersion = globalExists ? (readSkillVersion(skillDir) ?? "1.0.0") : null;
    // 员工侧未记录版本时，也视为 1.0.0（版本追踪功能上线前绑定的技能）
    const currentVersion = skill.version || "1.0.0";
    return {
      ...skill,
      latestVersion,
      hasUpdate: latestVersion != null && latestVersion !== currentVersion,
      /** 全局技能已被删除（文件目录不存在），员工侧副本仍保留 */
      installMissing: !globalExists
    };
  });

  const automationSummary = buildAutomationSummary(
    jobs.map((j) => ({ enabled: j.enabled, nextRunAt: j.nextRunAt })),
    scheduledRuns.slice(0, 10).map((r) => ({ status: r.status }))
  );
  const recentRuns = recentRunsFull.map(({ id: runId, status }) => ({
    id: runId, status,
  }));
  return {
    ok: true,
    data: {
      id: employee.id,
      name: employee.name,
      code: employee.code,
      description: employee.description,
      departmentId: employee.departmentId,
      skills: skillsWithVersion,
      recentRuns,
      automationSummary,
      health: {
        hasPrompt: hasSoulFileContent(ctx.gateway.homeDir, employee.code) || Boolean(employee.systemPrompt.trim()),
        hasSkills: skills.length > 0
      }
    }
  };
});

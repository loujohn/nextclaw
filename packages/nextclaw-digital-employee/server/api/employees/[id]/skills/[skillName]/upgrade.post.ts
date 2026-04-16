import { createError, getRouterParam } from "h3";
import { join } from "node:path";
import { getPlatformContext } from "../../../../../runtime/platform-context";
import { copySkillToEmployee, resolveEmployeeWorkspace } from "../../../../../engine/employee-workspace";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const skillName = getRouterParam(event, "skillName") ?? "";
  if (!id || !skillName) {
    throw createError({ statusCode: 400, statusMessage: "id and skillName are required" });
  }

  const ctx = await getPlatformContext();

  const employee = await ctx.employeeRepo.getById(id);
  if (!employee) {
    throw createError({ statusCode: 404, statusMessage: `employee not found: ${id}` });
  }

  const skills = await ctx.employeeSkillRepo.listByEmployeeId(id);
  const existing = skills.find((s) => s.skillName === skillName);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: `skill "${skillName}" not bound to employee ${id}` });
  }

  const previousVersion = existing.version;
  const globalSkillsDir = join(ctx.workspaceDir, "skills");
  const employeeWorkspace = resolveEmployeeWorkspace(ctx.homeDir, employee.code);

  const currentVersion = copySkillToEmployee(globalSkillsDir, employeeWorkspace, skillName);
  if (currentVersion === null && !existing.version) {
    // 全局目录不存在该技能（如 builtin），无需升级
    throw createError({ statusCode: 400, statusMessage: `skill "${skillName}" has no upgradeable copy in global skills directory` });
  }

  await ctx.employeeSkillRepo.updateSkillVersion(id, skillName, currentVersion);

  return {
    ok: true,
    data: {
      skillName,
      previousVersion,
      currentVersion
    }
  };
});

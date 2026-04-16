import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../../runtime/platform-context";

/**
 * DELETE /api/skills/:name
 *
 * 删除全局技能：
 * 1. 删除文件系统中的技能目录
 * 2. 删除 skill_installations 记录
 * 3. 员工侧的 employee_skills 记录保留（文件副本也保留），
 *    GET /api/employees/:id 会通过 installMissing 字段告知前端该技能已被全局删除
 */
export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name") ?? "";
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "skill name is required" });
  }

  const ctx = await getPlatformContext();

  // 删除文件系统中的全局目录
  ctx.gateway.deleteSkill(name);

  // 删除安装记录
  await ctx.skillInstallationRepo.deleteBySkillName(name);

  return { ok: true };
});

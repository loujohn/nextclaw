import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();

  const existing = await ctx.departmentRepo.getById(id);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: `department not found: ${id}` });
  }

  // 检查本部门及所有子孙部门是否挂有员工（数字员工 + 人类员工）
  const selfAndDescendants = [id, ...(await ctx.departmentRepo.getAllDescendantIds(id))];
  for (const deptId of selfAndDescendants) {
    const [digitalCount, humanCount] = await Promise.all([
      ctx.departmentRepo.countEmployees(deptId),
      ctx.humanEmployeeRepo.countByDepartmentId(deptId)
    ]);
    const totalCount = digitalCount + humanCount;
    if (totalCount > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `cannot delete department with employees: department '${deptId}' still has ${totalCount} member(s) (${digitalCount} digital, ${humanCount} human)`
      });
    }
  }

  await ctx.departmentRepo.deleteById(id);
  return { ok: true };
});

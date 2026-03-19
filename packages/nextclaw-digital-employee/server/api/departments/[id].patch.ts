import { createError, getRouterParam, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type UpdateDepartmentBody = {
  name?: string;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
};

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const body = await readBody<UpdateDepartmentBody>(event);
  const ctx = await getPlatformContext();

  const existing = await ctx.departmentRepo.getById(id);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: `department not found: ${id}` });
  }

  // 防止部门将自身设为父级（循环依赖）
  if (body?.parentId && body.parentId === id) {
    throw createError({ statusCode: 400, statusMessage: "department cannot be its own parent" });
  }

  // 防止将父级设置为自己的子孙（循环依赖）
  if (body?.parentId) {
    const descendants = await ctx.departmentRepo.getAllDescendantIds(id);
    if (descendants.includes(body.parentId)) {
      throw createError({ statusCode: 400, statusMessage: "circular department hierarchy is not allowed" });
    }
  }

  const updated = await ctx.departmentRepo.updateById(id, {
    name: body?.name,
    description: body?.description,
    parentId: "parentId" in (body ?? {}) ? body!.parentId : undefined,
    sortOrder: body?.sortOrder
  });

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: `department not found: ${id}` });
  }

  return { ok: true, data: updated };
});

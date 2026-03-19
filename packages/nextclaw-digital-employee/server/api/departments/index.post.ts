import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type CreateDepartmentBody = {
  name?: string;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
};

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateDepartmentBody>(event);
  const name = body?.name?.trim() ?? "";
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "name is required" });
  }
  const ctx = await getPlatformContext();
  const department = await ctx.departmentRepo.create({
    name,
    description: body?.description ?? "",
    parentId: body?.parentId ?? null,
    sortOrder: typeof body?.sortOrder === "number" ? body.sortOrder : 0
  });
  return { ok: true, data: department };
});

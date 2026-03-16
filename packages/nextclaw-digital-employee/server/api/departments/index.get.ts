import { getPlatformContext } from "../../runtime/platform-context";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const departments = await ctx.departmentRepo.list();
  return { ok: true, data: departments };
});

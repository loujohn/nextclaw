import { createError, getRouterParam } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireAuth } from "../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const id = getRouterParam(event, "id") ?? "";
  const ctx = await getPlatformContext();
  try {
    const result = await ctx.lifecycleService.deleteEmployee(id, user.id);
    return { ok: true, data: result };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    throw createError({
      statusCode: e?.statusCode ?? 500,
      statusMessage: e?.message ?? "删除员工失败"
    });
  }
});

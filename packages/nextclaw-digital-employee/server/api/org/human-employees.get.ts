import { getQuery } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import type { HumanEmployeeView } from "../../repositories/human-employee-repository";

let cachedAll: { data: HumanEmployeeView[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateHumanEmployeeCache() {
  cachedAll = null;
}

export default defineEventHandler(async (event) => {
  const { departmentId } = getQuery(event);
  const ctx = await getPlatformContext();

  if (!departmentId) {
    if (cachedAll && Date.now() < cachedAll.expiresAt) {
      return { ok: true, data: cachedAll.data };
    }
    const list = await ctx.humanEmployeeRepo.list();
    cachedAll = { data: list, expiresAt: Date.now() + CACHE_TTL_MS };
    return { ok: true, data: list };
  }

  const filter = { departmentId: String(departmentId) };
  const list = await ctx.humanEmployeeRepo.list(filter);
  return { ok: true, data: list };
});

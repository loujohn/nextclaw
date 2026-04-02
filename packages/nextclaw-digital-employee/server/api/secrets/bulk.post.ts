import { createError, readBody } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";

type BulkItem = { key: string; value: string; scope?: string; description?: string };
type BulkBody = { items: BulkItem[] };

export default defineEventHandler(async (event) => {
  const body = await readBody<BulkBody>(event);
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "items array is required and must not be empty" });
  }
  if (body.items.length > 200) {
    throw createError({ statusCode: 400, statusMessage: "too many items, max 200 per request" });
  }

  const invalid = body.items.findIndex((item: BulkItem) => !item?.key?.trim() || !item?.value);
  if (invalid !== -1) {
    throw createError({
      statusCode: 400,
      statusMessage: `item[${invalid}] is missing key or value`,
    });
  }

  const ctx = await getPlatformContext();

  const results: Array<{ key: string; status: "created" | "skipped" | "updated"; error?: string }> = [];

  for (const item of body.items) {
    const trimmedKey = item.key.trim();
    try {
      await ctx.secretsRepo.create({
        key: trimmedKey,
        value: item.value,
        scope: item.scope,
        description: item.description,
      });
      results.push({ key: trimmedKey, status: "created" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 若 key 已存在（唯一约束冲突），尝试更新值
      const isConflict = msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate");
      if (isConflict) {
        try {
          await ctx.secretsRepo.update(trimmedKey, {
            value: item.value,
            description: item.description,
          });
          results.push({ key: trimmedKey, status: "updated" });
        } catch (updateErr: unknown) {
          const updateMsg = updateErr instanceof Error ? updateErr.message : "update failed";
          results.push({ key: trimmedKey, status: "skipped", error: updateMsg });
        }
      } else {
        results.push({ key: trimmedKey, status: "skipped", error: msg });
      }
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return { ok: true, data: { results, summary: { total: results.length, created, updated, skipped } } };
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPlatformContext } from "../runtime/platform-context";
import { writePlatformUsageGuide } from "../engine/platform-usage-seeder";
import { createLogger } from "../utils/logger";

const log = createLogger("SeedPlatformUsage");

/**
 * 将 PLATFORM_USAGE.md 从 Nitro serverAssets (nuxt.config.ts: `{ baseName: "usage" }`)
 * 植入每个工作区根目录。与 `seed-skills.ts` 采用完全一致的策略：
 *   - 开发（nuxi dev）：直接从 `process.cwd()/server/assets/PLATFORM_USAGE.md` 读源文件，
 *     便于所见即所得地编辑。
 *   - 生产（nitro bundled）：用 `useStorage("assets:usage").getItem(...)`，避免依赖
 *     `.output/server/assets/` 的打包路径约定。
 *
 * 写入策略（见 `platform-usage-seeder.ts`）对 marker 做幂等处理，用户手改过的
 * 文件（缺 managed marker）不会被覆盖。
 */
export default defineNitroPlugin(async () => {
  const ctx = await getPlatformContext();

  // 开发模式：优先读源码，便于热改
  const devPath = resolve(process.cwd(), "server/assets/PLATFORM_USAGE.md");
  let content: string | null = null;
  if (existsSync(devPath)) {
    try {
      content = readFileSync(devPath, "utf-8");
    } catch (err) {
      log.warn(`failed to read dev asset at ${devPath}:`, err);
    }
  }

  // 生产模式（或 dev 路径读失败）：走 Nitro serverAssets storage
  if (!content) {
    try {
      const raw = await useStorage("assets:usage").getItem("PLATFORM_USAGE.md");
      if (typeof raw === "string") {
        content = raw;
      } else if (raw != null) {
        content = String(raw);
      }
    } catch (err) {
      log.warn("failed to read PLATFORM_USAGE.md from assets:usage storage:", err);
    }
  }

  if (!content) {
    log.error(
      "PLATFORM_USAGE.md asset not found in `server/assets/` (dev) or Nitro `assets:usage` " +
        "storage (prod). Digital employees will not see the platform usage guide. " +
        "Verify `nuxt.config.ts` registers `{ baseName: \"usage\", dir: \"./server/assets\" }` " +
        "and the asset file exists."
    );
    return;
  }

  try {
    const result = writePlatformUsageGuide(ctx.workspaceDir, content);
    if (result?.status === "written") {
      log.info(`installed/refreshed ${result.target}`);
    } else if (result?.status === "user-edited-skipped") {
      log.debug(`left user-edited ${result.target} untouched`);
    }
  } catch (err) {
    // Writing is best-effort: disk full / ro mount / permission issues
    // should not bring the Nitro plugin host down on boot. The AI will
    // operate without the guide but the rest of the platform still
    // functions normally.
    log.warn("failed to write PLATFORM_USAGE.md:", err);
  }
});

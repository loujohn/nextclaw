import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getPlatformContext } from "../runtime/platform-context";
import { createLogger } from "../utils/logger";

const log = createLogger("SeedSkills");

/**
 * 服务启动时自动将 skills/ 目录下的自定义技能安装到工作区。
 * 开发模式：自动扫描源码 skills/ 目录，无需手动维护列表。
 * 生产模式：从 Nitro serverAssets (useStorage('assets:skills')) 读取并写入磁盘。
 * 每次启动强制覆盖，确保自定义 skill 与源码/资产保持同步。
 */
export default defineNitroPlugin(async () => {
  const ctx = await getPlatformContext();
  const workspaceSkillsDir = join(ctx.workspaceDir, "skills");

  // 开发模式：自动扫描 skills/ 目录下的所有子目录
  const skillsSrcDir = resolve(process.cwd(), "skills");
  const skillNames = existsSync(skillsSrcDir)
    ? readdirSync(skillsSrcDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(skillsSrcDir, e.name, "SKILL.md")))
        .map((e) => e.name)
    : (await useStorage("assets:skills").getKeys())
        .map((k) => k.split(":")[0])
        .filter((v, i, arr) => arr.indexOf(v) === i);

  const userImportedSkills = await ctx.skillInstallationRepository.findUserImportedNames();

  for (const skillName of skillNames) {
    if (userImportedSkills.has(skillName)) {
      log.info(`skipping user-imported skill: ${skillName}`);
      continue;
    }
    const installPath = join(workspaceSkillsDir, skillName);

    const srcPath = resolve(process.cwd(), "skills", skillName);
    if (existsSync(srcPath)) {
      try {
        mkdirSync(workspaceSkillsDir, { recursive: true });
        rmSync(installPath, { recursive: true, force: true });
        cpSync(srcPath, installPath, { recursive: true, force: true });
        log.info(`installed from source: ${skillName}`);
      } catch (err) {
        log.warn(`failed to install ${skillName}:`, err);
      }
      continue;
    }

    try {
      const storage = useStorage("assets:skills");
      const keys = await storage.getKeys(skillName);
      if (keys.length === 0) {
        log.warn(`no assets found for skill: ${skillName}`);
        continue;
      }
      rmSync(installPath, { recursive: true, force: true });
      mkdirSync(installPath, { recursive: true });
      for (const key of keys) {
        const content = await storage.getItemRaw(key);
        if (content == null) continue;
        const relPath = key.replace(`${skillName}:`, "").replace(/:/g, "/");
        const destFile = join(installPath, relPath);
        mkdirSync(dirname(destFile), { recursive: true });
        writeFileSync(destFile, content as Buffer);
      }
      log.info(`installed from assets: ${skillName}`);
    } catch (err) {
      log.warn(`failed to install ${skillName} from assets:`, err);
    }
  }
});

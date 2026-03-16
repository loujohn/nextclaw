import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getPlatformContext } from "../runtime/platform-context";

/**
 * 服务启动时自动将 skills/ 目录下的自定义技能安装到工作区。
 * 开发模式：直接从源码目录 cpSync。
 * 生产模式：从 Nitro serverAssets (useStorage('assets:skills')) 读取并写入磁盘。
 * 已存在则跳过，避免覆盖用户修改。
 */
export default defineNitroPlugin(async () => {
  const ctx = await getPlatformContext();
  const workspaceSkillsDir = join(ctx.workspaceDir, "skills");

  const skillNames = ["employee-creator"];

  for (const skillName of skillNames) {
    const installPath = join(workspaceSkillsDir, skillName);
    if (existsSync(join(installPath, "SKILL.md"))) {
      continue;
    }

    // 开发模式：源码目录存在，直接复制
    const srcPath = resolve(process.cwd(), "skills", skillName);
    if (existsSync(srcPath)) {
      try {
        mkdirSync(workspaceSkillsDir, { recursive: true });
        cpSync(srcPath, installPath, { recursive: true });
        console.log(`[seed-skills] installed from source: ${skillName}`);
      } catch (err) {
        console.warn(`[seed-skills] failed to install ${skillName}:`, err);
      }
      continue;
    }

    // 生产模式：从 serverAssets 读取
    try {
      const storage = useStorage("assets:skills");
      const keys = await storage.getKeys(skillName);
      if (keys.length === 0) {
        console.warn(`[seed-skills] no assets found for skill: ${skillName}`);
        continue;
      }
      mkdirSync(installPath, { recursive: true });
      for (const key of keys) {
        const content = await storage.getItemRaw(key);
        if (content == null) continue;
        // key 格式如 "employee-creator:SKILL.md" → 转为相对路径
        const relPath = key.replace(`${skillName}:`, "").replace(/:/g, "/");
        const destFile = join(installPath, relPath);
        mkdirSync(dirname(destFile), { recursive: true });
        writeFileSync(destFile, content as Buffer);
      }
      console.log(`[seed-skills] installed from assets: ${skillName}`);
    } catch (err) {
      console.warn(`[seed-skills] failed to install ${skillName} from assets:`, err);
    }
  }
});

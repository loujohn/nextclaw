import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getPlatformContext } from "../runtime/platform-context";

/**
 * 服务启动时自动将 skills/ 目录下的自定义技能安装到工作区。
 * 与 seedBuiltinSkills 的逻辑一致，无需手动在页面导入。
 */
export default defineNitroPlugin(async () => {
  const ctx = await getPlatformContext();

  const skillsToSeed = [
    resolve(process.cwd(), "skills/employee-creator")
  ];

  for (const skillPath of skillsToSeed) {
    if (!existsSync(skillPath)) continue;
    try {
      await ctx.skillInstallService.importFromLocalPath(skillPath);
    } catch {
      // 已安装或路径无效，跳过
    }
  }
});

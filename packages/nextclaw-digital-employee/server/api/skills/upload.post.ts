import { createError, readBody } from "h3";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPlatformContext } from "../../runtime/platform-context";

type UploadedFile = {
  /** webkitRelativePath, e.g. "my-skill/SKILL.md" */
  path: string;
  content: string;
};

function parseSkillNameFromContent(content: string, fallback: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return fallback;
  for (const line of (match[1] ?? "").split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key?.trim() === "name") {
      const value = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
      if (value) return value;
    }
  }
  return fallback;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ files: UploadedFile[] }>(event);
  const files = body?.files;

  if (!Array.isArray(files) || files.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No files provided" });
  }

  // Find SKILL.md (path ends with /SKILL.md or equals SKILL.md)
  const skillMdFile = files.find((f) => /(?:^|\/)SKILL\.md$/.test(f.path));
  if (!skillMdFile) {
    throw createError({ statusCode: 400, statusMessage: "No SKILL.md found in uploaded files" });
  }

  // Root dir name is the first path segment (webkitRelativePath root = folder name)
  const rootDir = skillMdFile.path.includes("/") ? skillMdFile.path.split("/")[0]! : ".";
  const fallbackName = rootDir === "." ? "uploaded-skill" : rootDir;
  const skillName = parseSkillNameFromContent(skillMdFile.content, fallbackName);

  const ctx = await getPlatformContext();
  const installPath = join(ctx.workspaceDir, "skills", skillName);
  mkdirSync(installPath, { recursive: true });

  // Write all files, stripping the root dir prefix
  for (const file of files) {
    const relPath = rootDir !== "." && file.path.startsWith(rootDir + "/")
      ? file.path.slice(rootDir.length + 1)
      : file.path;
    const destFile = join(installPath, relPath);
    mkdirSync(dirname(destFile), { recursive: true });
    writeFileSync(destFile, file.content, "utf-8");
  }

  const installation = await ctx.skillInstallationRepo.upsert({
    skillName,
    sourceType: "local",
    sourceUri: `upload:${skillName}`,
    installPath,
    metadata: {}
  });

  return { ok: true, data: installation };
});

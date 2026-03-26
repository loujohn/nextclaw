// Synced approach from packages/nextclaw/src/cli/workspace.ts (WorkspaceManager.createWorkspaceTemplates)
// Keep consistent with upstream template seeding logic.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { APP_NAME } from "@nextclaw/core";

export type EmployeeIdentity = {
  code: string;
  name: string;
  description: string;
  systemPrompt: string;
};

export function resolveEmployeeWorkspace(homeDir: string, employeeCode: string): string {
  return resolve(homeDir, "agents", employeeCode);
}

export function ensureEmployeeWorkspace(
  homeDir: string,
  employee: EmployeeIdentity,
  globalWorkspaceDir: string
): string {
  const wsDir = resolveEmployeeWorkspace(homeDir, employee.code);
  mkdirSync(wsDir, { recursive: true });
  mkdirSync(join(wsDir, "memory"), { recursive: true });

  seedFromTemplates(wsDir);
  seedFromGlobal(wsDir, globalWorkspaceDir);
  linkGlobalSkills(wsDir, globalWorkspaceDir);

  writeSoulFile(wsDir, employee);
  writeIdentityFile(wsDir, employee);

  return wsDir;
}

const TEMPLATE_SEED_FILES = [
  "AGENTS.md",
  "TOOLS.md",
  "USER.md",
  "BOOT.md",
  "HEARTBEAT.md",
  "MEMORY.md",
  "memory/MEMORY.md"
];

function seedFromTemplates(wsDir: string): void {
  const templateDir = resolveTemplateDir();
  if (!templateDir) return;

  for (const relPath of TEMPLATE_SEED_FILES) {
    const dest = join(wsDir, relPath);
    if (existsSync(dest)) continue;
    const src = join(templateDir, relPath);
    if (!existsSync(src)) continue;

    mkdirSync(dirname(dest), { recursive: true });
    const raw = readFileSync(src, "utf-8");
    const content = raw.replace(/\$\{APP_NAME\}/g, APP_NAME);
    writeFileSync(dest, content, "utf-8");
  }
}

function resolveTemplateDir(): string | null {
  const override = process.env.NEXTCLAW_TEMPLATE_DIR?.trim();
  if (override && existsSync(override)) return override;

  const localCandidate = resolve(process.cwd(), "templates");
  if (existsSync(localCandidate)) return localCandidate;

  const monorepoCandidate = resolve(process.cwd(), "..", "nextclaw", "templates");
  if (existsSync(monorepoCandidate)) return monorepoCandidate;

  return null;
}

const GLOBAL_SEED_FILES = ["AGENTS.md", "TOOLS.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md"];

function seedFromGlobal(wsDir: string, globalWorkspaceDir: string): void {
  for (const file of GLOBAL_SEED_FILES) {
    const dest = join(wsDir, file);
    if (existsSync(dest)) continue;
    const src = join(globalWorkspaceDir, file);
    if (existsSync(src)) {
      cpSync(src, dest);
    }
  }
}

// 将全局 skills 目录符号链接到员工工作区，
// 使 SKILL.md 中的相对路径（如 `scripts/xxx.js`）能正确解析。
// Windows 上使用 junction（无需管理员权限），其他平台使用 dir symlink。
function linkGlobalSkills(wsDir: string, globalWorkspaceDir: string): void {
  const globalSkills = join(globalWorkspaceDir, "skills");
  const localSkills = join(wsDir, "skills");
  if (!existsSync(globalSkills)) return;
  try {
    if (existsSync(localSkills)) {
      const stat = lstatSync(localSkills);
      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) {
        rmSync(localSkills, { recursive: true, force: true });
      }
    }
    symlinkSync(globalSkills, localSkills, "junction");
  } catch {
    // 符号链接失败时静默跳过（权限受限环境等）
  }
}

function writeSoulFile(wsDir: string, emp: EmployeeIdentity): void {
  const content = emp.systemPrompt.trim()
    ? `# SOUL.md - ${emp.name}\n\n${emp.systemPrompt.trim()}\n`
    : `# SOUL.md - ${emp.name}\n\nYou are ${emp.name}.\n\n${emp.description || "No role description provided yet."}\n`;
  writeFileSync(join(wsDir, "SOUL.md"), content, "utf-8");
}

function writeIdentityFile(wsDir: string, emp: EmployeeIdentity): void {
  const content = [
    `# IDENTITY.md - ${emp.name}`,
    "",
    `- Name: ${emp.name}`,
    `- Code: ${emp.code}`,
    "- Creature: AI digital employee",
    `- Description: ${emp.description || "Not specified"}`,
    ""
  ].join("\n");
  writeFileSync(join(wsDir, "IDENTITY.md"), content, "utf-8");
}

export function removeEmployeeWorkspace(homeDir: string, employeeCode: string): void {
  const wsDir = resolveEmployeeWorkspace(homeDir, employeeCode);
  rmSync(wsDir, { recursive: true, force: true });
}

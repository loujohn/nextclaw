// Synced approach from packages/nextclaw/src/cli/workspace.ts (WorkspaceManager.createWorkspaceTemplates)
// Keep consistent with upstream template seeding logic.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Skill versioning helpers
// ---------------------------------------------------------------------------

/**
 * 读取指定技能目录中 SKILL.md frontmatter 的 version 字段。
 */
export function readSkillVersion(skillDir: string): string | null {
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return null;
  const raw = readFileSync(skillFile, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  for (const line of (match[1] ?? "").split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key?.trim() === "version") {
      return rest.join(":").trim().replace(/^['"]|['"]$/g, "") || null;
    }
  }
  return null;
}

/**
 * 将全局目录中的技能复制（或覆盖）到员工工作目录，返回版本号。
 * 若全局目录中不存在该技能（如 builtin 技能），返回 null 且不做任何操作。
 */
export function copySkillToEmployee(
  globalSkillsDir: string,
  employeeWorkspace: string,
  skillName: string
): string | null {
  const src = join(globalSkillsDir, skillName);
  if (!existsSync(src)) return null;
  const dest = join(employeeWorkspace, "skills", skillName);
  mkdirSync(join(employeeWorkspace, "skills"), { recursive: true });
  cpSync(src, dest, { recursive: true });
  return readSkillVersion(dest);
}

/**
 * 从员工工作目录删除指定技能的本地副本。
 */
export function removeSkillFromEmployee(employeeWorkspace: string, skillName: string): void {
  const dest = join(employeeWorkspace, "skills", skillName);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
}

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

export function resolveEmployeeUploadRoot(homeDir: string, employeeCode: string): string {
  return join(resolveEmployeeWorkspace(homeDir, employeeCode), "uploadFile");
}

export function resolveEmployeeUploadDateDir(homeDir: string, employeeCode: string, dateLabel: string): string {
  return join(resolveEmployeeUploadRoot(homeDir, employeeCode), dateLabel);
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

  seedSoulFile(wsDir, employee);
  seedIdentityFile(wsDir, employee);

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

function seedSoulFile(wsDir: string, emp: EmployeeIdentity): void {
  const target = join(wsDir, "SOUL.md");
  if (existsSync(target)) return;
  const content = emp.systemPrompt.trim()
    ? `# SOUL.md - ${emp.name}\n\n${emp.systemPrompt.trim()}\n`
    : `# SOUL.md - ${emp.name}\n\nYou are ${emp.name}.\n\n${emp.description || "No role description provided yet."}\n`;
  writeFileSync(target, content, "utf-8");
}

function seedIdentityFile(wsDir: string, emp: EmployeeIdentity): void {
  const target = join(wsDir, "IDENTITY.md");
  if (existsSync(target)) return;
  const content = [
    `# IDENTITY.md - ${emp.name}`,
    "",
    `- Name: ${emp.name}`,
    `- Code: ${emp.code}`,
    "- Creature: AI digital employee",
    `- Description: ${emp.description || "Not specified"}`,
    ""
  ].join("\n");
  writeFileSync(target, content, "utf-8");
}

export function removeEmployeeWorkspace(homeDir: string, employeeCode: string): void {
  const wsDir = resolveEmployeeWorkspace(homeDir, employeeCode);
  rmSync(wsDir, { recursive: true, force: true });
}

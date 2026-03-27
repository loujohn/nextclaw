import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_METADATA_KEY } from "../config/brand.js";

const BUILTIN_SKILLS_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "skills");

export type SkillInfo = {
  name: string;
  path: string;
  source: "workspace" | "builtin";
};

// 技能加载器：从工作区、附加目录和内置目录发现并加载技能。
// 加载优先级：工作区 > 附加目录 > 内置（同名技能以先发现者为准）。
export class SkillsLoader {
  private workspaceSkills: string;
  private builtinSkills: string;
  private additionalSkillsDirs: string[];

  constructor(private workspace: string, builtinSkillsDir?: string, additionalSkillsDirs?: string[]) {
    this.workspaceSkills = join(workspace, "skills");
    this.builtinSkills = builtinSkillsDir ?? BUILTIN_SKILLS_DIR;
    this.additionalSkillsDirs = additionalSkillsDirs ?? [];
  }

  listSkills(filterUnavailable = true): SkillInfo[] {
    const skills: SkillInfo[] = [];
    // 工作区技能优先级最高
    this.collectSkillsFromDir(this.workspaceSkills, "workspace", skills);
    // 附加目录（如全局技能目录）次之
    for (const dir of this.additionalSkillsDirs) {
      this.collectSkillsFromDir(dir, "workspace", skills);
    }
    // 内置技能优先级最低
    this.collectSkillsFromDir(this.builtinSkills, "builtin", skills);
    if (filterUnavailable) {
      return skills.filter((skill) => this.checkRequirements(this.getSkillMeta(skill.name)));
    }
    return skills;
  }

  // 从指定目录收集技能，同名技能不重复添加（`!skills.some` 保证先发现者优先）
  private collectSkillsFromDir(dir: string, source: SkillInfo["source"], skills: SkillInfo[]): void {
    try {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillFile = join(dir, entry.name, "SKILL.md");
        if (existsSync(skillFile) && !skills.some((s) => s.name === entry.name)) {
          skills.push({ name: entry.name, path: skillFile, source });
        }
      }
    } catch (err) {
      console.warn(`[SkillsLoader] 读取技能目录失败: ${dir}`, err);
    }
  }

  loadSkill(name: string): string | null {
    const workspaceSkill = join(this.workspaceSkills, name, "SKILL.md");
    if (existsSync(workspaceSkill)) {
      return readFileSync(workspaceSkill, "utf-8");
    }
    for (const dir of this.additionalSkillsDirs) {
      const candidate = join(dir, name, "SKILL.md");
      if (existsSync(candidate)) {
        return readFileSync(candidate, "utf-8");
      }
    }
    const builtinSkill = join(this.builtinSkills, name, "SKILL.md");
    if (existsSync(builtinSkill)) {
      return readFileSync(builtinSkill, "utf-8");
    }
    return null;
  }

  getSkillDir(name: string): string | null {
    const workspaceCandidate = join(this.workspaceSkills, name);
    if (existsSync(join(workspaceCandidate, "SKILL.md"))) return workspaceCandidate;
    for (const dir of this.additionalSkillsDirs) {
      const candidate = join(dir, name);
      if (existsSync(join(candidate, "SKILL.md"))) return candidate;
    }
    const builtinCandidate = join(this.builtinSkills, name);
    if (existsSync(join(builtinCandidate, "SKILL.md"))) return builtinCandidate;
    return null;
  }

  loadSkillsForContext(skillNames: string[]): string {
    const parts: string[] = [];
    for (const name of skillNames) {
      const content = this.loadSkill(name);
      if (content) {
        const skillDir = this.getSkillDir(name);
        const locationHint = skillDir
          ? `\n\n**Skill Directory**: \`${skillDir}\`\n(Execute scripts from this directory, e.g. \`cd ${skillDir} && node scripts/xxx.js\`)\n`
          : "";
        parts.push(`### Skill: ${name}${locationHint}\n\n${this.stripFrontmatter(content)}`);
      }
    }
    return parts.length ? parts.join("\n\n---\n\n") : "";
  }

  buildSkillsSummary(filterNames?: string[]): string {
    let allSkills = this.listSkills(false);
    if (filterNames && filterNames.length > 0) {
      const nameSet = new Set(filterNames);
      allSkills = allSkills.filter((s) => nameSet.has(s.name));
    }
    if (!allSkills.length) {
      return "";
    }

    const escapeXml = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const lines: string[] = ["<skills>"];
    for (const skill of allSkills) {
      const desc = escapeXml(this.getSkillDescription(skill.name));
      const meta = this.getSkillMeta(skill.name);
      const available = this.checkRequirements(meta);
      lines.push(`  <skill available="${available}">`);
      lines.push(`    <name>${escapeXml(skill.name)}</name>`);
      lines.push(`    <description>${desc}</description>`);
      lines.push(`    <location>${skill.path}</location>`);
      if (!available) {
        const missing = this.getMissingRequirements(meta);
        if (missing) {
          lines.push(`    <requires>${escapeXml(missing)}</requires>`);
        }
      }
      lines.push("  </skill>");
    }
    lines.push("</skills>");
    return lines.join("\n");
  }

  getAlwaysSkills(): string[] {
    const result: string[] = [];
    for (const skill of this.listSkills(true)) {
      const meta = this.getSkillMetadata(skill.name) ?? {};
      const parsed = this.parseSkillMetadata(meta.metadata ?? "");
      if (parsed.always || (meta as { always?: string }).always === "true") {
        result.push(skill.name);
      }
    }
    return result;
  }

  getSkillMetadata(name: string): Record<string, string> | null {
    const content = this.loadSkill(name);
    if (!content || !content.startsWith("---")) {
      return null;
    }
    const match = content.match(/^---\n(.*?)\n---/s);
    if (!match) {
      return null;
    }
    const metadata: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
      const [key, ...rest] = line.split(":");
      if (!key || rest.length === 0) {
        continue;
      }
      metadata[key.trim()] = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
    }
    return metadata;
  }

  private getSkillDescription(name: string): string {
    const meta = this.getSkillMetadata(name);
    if (meta?.description) {
      return meta.description;
    }
    return name;
  }

  private stripFrontmatter(content: string): string {
    if (content.startsWith("---")) {
      const match = content.match(/^---\n.*?\n---\n/s);
      if (match) {
        return content.slice(match[0].length).trim();
      }
    }
    return content;
  }

  private parseSkillMetadata(raw: string): Record<string, unknown> {
    try {
      const data = JSON.parse(raw);
      if (typeof data !== "object" || !data) {
        return {};
      }
      const meta = (data as Record<string, unknown>)[SKILL_METADATA_KEY];
      if (typeof meta === "object" && meta) {
        return meta as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private getSkillMeta(name: string): Record<string, unknown> {
    const meta = this.getSkillMetadata(name) ?? {};
    return this.parseSkillMetadata(meta.metadata ?? "");
  }

  private checkRequirements(skillMeta: Record<string, unknown>): boolean {
    const requires = (skillMeta.requires ?? {}) as { bins?: string[]; env?: string[] };
    if (requires.bins) {
      for (const bin of requires.bins) {
        if (!this.which(bin)) {
          return false;
        }
      }
    }
    if (requires.env) {
      for (const env of requires.env) {
        if (!process.env[env]) {
          return false;
        }
      }
    }
    return true;
  }

  private getMissingRequirements(skillMeta: Record<string, unknown>): string {
    const missing: string[] = [];
    const requires = (skillMeta.requires ?? {}) as { bins?: string[]; env?: string[] };
    if (requires.bins) {
      for (const bin of requires.bins) {
        if (!this.which(bin)) {
          missing.push(`CLI: ${bin}`);
        }
      }
    }
    if (requires.env) {
      for (const env of requires.env) {
        if (!process.env[env]) {
          missing.push(`ENV: ${env}`);
        }
      }
    }
    return missing.join(", ");
  }

  private which(binary: string): boolean {
    const paths = (process.env.PATH ?? "").split(":");
    for (const dir of paths) {
      const full = join(dir, binary);
      if (existsSync(full)) {
        return true;
      }
    }
    return false;
  }
}

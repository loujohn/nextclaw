import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type SkillInstallationRecord } from "../db/schema";
import { dbNow } from "../db/knex";

export type SkillInstallationView = {
  id: string;
  skillName: string;
  sourceType: string;
  sourceUri: string;
  version: string | null;
  installPath: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type UpsertSkillInstallationInput = {
  skillName: string;
  sourceType: string;
  sourceUri: string;
  version?: string | null;
  installPath: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
};

function toView(record: SkillInstallationRecord): SkillInstallationView {
  return {
    id: record.id,
    skillName: record.skill_name,
    sourceType: record.source_type,
    sourceUri: record.source_uri,
    version: record.version,
    installPath: record.install_path,
    enabled: Boolean(record.enabled),
    metadata: JSON.parse(record.metadata_json),
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class SkillInstallationRepository {
  constructor(private readonly db: Knex) {}

  async upsert(input: UpsertSkillInstallationInput): Promise<SkillInstallationView> {
    const existing = await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
      .where({ skill_name: input.skillName })
      .first();
    const now = dbNow();
    const payload = {
      skill_name: input.skillName,
      source_type: input.sourceType,
      source_uri: input.sourceUri,
      version: input.version ?? null,
      install_path: input.installPath,
      enabled: input.enabled ?? true,
      metadata_json: JSON.stringify(input.metadata ?? {}),
      updated_at: now
    };
    if (existing) {
      await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
        .where({ id: existing.id })
        .update(payload);
      const updated = await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
        .where({ id: existing.id })
        .first();
      return toView(updated as SkillInstallationRecord);
    }
    const created: SkillInstallationRecord = {
      id: randomUUID(),
      ...payload,
      created_at: now
    };
    await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations).insert(created);
    return toView(created);
  }

  async findBySkillName(skillName: string): Promise<SkillInstallationView | null> {
    const record = await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
      .where({ skill_name: skillName })
      .first();
    return record ? toView(record) : null;
  }

  async list(): Promise<SkillInstallationView[]> {
    const rows = await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations).orderBy("updated_at", "desc");
    return rows.map(toView);
  }

  async deleteBySkillName(skillName: string): Promise<boolean> {
    const deleted = await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
      .where({ skill_name: skillName })
      .delete();
    return deleted > 0;
  }

  async setEnabled(skillName: string, enabled: boolean): Promise<SkillInstallationView | null> {
    const existing = await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
      .where({ skill_name: skillName })
      .first();
    if (!existing) {
      return null;
    }
    await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
      .where({ id: existing.id })
      .update({
        enabled,
        updated_at: dbNow()
      });
    const updated = await this.db<SkillInstallationRecord>(PLATFORM_TABLES.skillInstallations)
      .where({ id: existing.id })
      .first();
    return updated ? toView(updated) : null;
  }
}

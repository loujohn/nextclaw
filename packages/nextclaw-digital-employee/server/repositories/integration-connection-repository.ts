import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES } from "../db/schema";

type IntegrationConnectionRecord = {
  id: string;
  type: string;
  name: string;
  config_json: string;
  enabled: number | boolean;
  created_at: string;
  updated_at: string;
};

export type IntegrationConnectionView = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function toView(record: IntegrationConnectionRecord): IntegrationConnectionView {
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    enabled: Boolean(record.enabled),
    config: JSON.parse(record.config_json),
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class IntegrationConnectionRepository {
  constructor(private readonly db: Knex) {}

  async findByType(type: string): Promise<IntegrationConnectionView | null> {
    const record = await this.db<IntegrationConnectionRecord>(PLATFORM_TABLES.integrationConnections)
      .where({ type: type.trim() })
      .orderBy("updated_at", "desc")
      .first();
    return record ? toView(record) : null;
  }

  async upsertByType(params: {
    type: string;
    name: string;
    enabled?: boolean;
    config: Record<string, unknown>;
  }): Promise<IntegrationConnectionView> {
    const type = params.type.trim();
    const existing = await this.db<IntegrationConnectionRecord>(PLATFORM_TABLES.integrationConnections)
      .where({ type })
      .orderBy("updated_at", "desc")
      .first();
    const now = new Date().toISOString();
    const payload = {
      type,
      name: params.name.trim(),
      enabled: params.enabled ?? true,
      config_json: JSON.stringify(params.config),
      updated_at: now
    };
    if (existing) {
      await this.db<IntegrationConnectionRecord>(PLATFORM_TABLES.integrationConnections)
        .where({ id: existing.id })
        .update(payload);
      const updated = await this.db<IntegrationConnectionRecord>(PLATFORM_TABLES.integrationConnections)
        .where({ id: existing.id })
        .first();
      return toView(updated as IntegrationConnectionRecord);
    }
    const created: IntegrationConnectionRecord = {
      id: randomUUID(),
      ...payload,
      created_at: now
    };
    await this.db<IntegrationConnectionRecord>(PLATFORM_TABLES.integrationConnections).insert(created);
    return toView(created);
  }
}

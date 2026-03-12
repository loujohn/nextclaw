import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type EmployeeRecord } from "../db/schema";

export type CreateEmployeeInput = {
  name: string;
  code: string;
  description: string;
  systemPrompt: string;
  model?: string;
};

export type EmployeeView = {
  id: string;
  name: string;
  code: string;
  description: string;
  systemPrompt: string;
  model: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function toEmployeeView(record: EmployeeRecord): EmployeeView {
  return {
    id: record.id,
    name: record.name,
    code: record.code,
    description: record.description,
    systemPrompt: record.system_prompt,
    model: record.model || "",
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class EmployeeRepository {
  constructor(private readonly db: Knex) {}

  async create(input: CreateEmployeeInput): Promise<EmployeeView> {
    const now = new Date().toISOString();
    const record: EmployeeRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      code: input.code.trim(),
      description: input.description.trim(),
      system_prompt: input.systemPrompt.trim(),
      model: input.model?.trim() ?? "",
      status: "active",
      created_at: now,
      updated_at: now
    };
    await this.db<EmployeeRecord>(PLATFORM_TABLES.employees).insert(record);
    return toEmployeeView(record);
  }

  async getById(id: string): Promise<EmployeeView | null> {
    const record = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees).where({ id }).first();
    return record ? toEmployeeView(record) : null;
  }

  async list(): Promise<EmployeeView[]> {
    const rows = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees).orderBy("created_at", "desc");
    return rows.map(toEmployeeView);
  }
}

import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type EmployeeRecord } from "../db/schema";
import { EmployeeStatus } from "../db/enums";
import { dbNow } from "../db/knex";

export type CreateEmployeeInput = {
  name: string;
  code: string;
  description: string;
  systemPrompt: string;
  model?: string;
  departmentId?: string | null;
};

export type UpdateEmployeeInput = {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  departmentId?: string | null;
};

export type EmployeeView = {
  id: string;
  name: string;
  code: string;
  description: string;
  systemPrompt: string;
  model: string;
  status: string;
  departmentId: string | null;
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
    departmentId: record.department_id ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class EmployeeRepository {
  constructor(private readonly db: Knex) {}

  async create(input: CreateEmployeeInput): Promise<EmployeeView> {
    const now = dbNow();
    const record: EmployeeRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      code: input.code.trim(),
      description: input.description.trim(),
      system_prompt: input.systemPrompt.trim(),
      model: input.model?.trim() ?? "",
      status: EmployeeStatus.Active,
      department_id: input.departmentId ?? null,
      created_at: now,
      updated_at: now
    };
    const existing = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees)
      .where({ code: record.code })
      .whereNot({ status: EmployeeStatus.Archived })
      .first();
    if (existing) {
      throw Object.assign(new Error(`员工 code '${record.code}' 已存在`), { statusCode: 409 });
    }
    await this.db<EmployeeRecord>(PLATFORM_TABLES.employees).insert(record);
    return toEmployeeView(record);
  }

  async getById(id: string, includeArchived = false): Promise<EmployeeView | null> {
    let query = this.db<EmployeeRecord>(PLATFORM_TABLES.employees).where({ id });
    if (!includeArchived) {
      query = query.whereNot({ status: EmployeeStatus.Archived });
    }
    const record = await query.first();
    return record ? toEmployeeView(record) : null;
  }

  async getByCode(code: string): Promise<EmployeeView | null> {
    const record = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees)
      .where({ code: code.trim() })
      .whereNot({ status: EmployeeStatus.Archived })
      .first();
    return record ? toEmployeeView(record) : null;
  }

  async list(filter?: { departmentId?: string | null }): Promise<EmployeeView[]> {
    let query = this.db<EmployeeRecord>(PLATFORM_TABLES.employees)
      .whereNot({ status: EmployeeStatus.Archived })
      .orderBy("created_at", "desc");
    if (filter?.departmentId !== undefined) {
      query = query.where({ department_id: filter.departmentId });
    }
    const rows = await query;
    return rows.map(toEmployeeView);
  }

  async updateById(id: string, input: UpdateEmployeeInput): Promise<EmployeeView | null> {
    const updatedAt = dbNow();
    const patch: Record<string, unknown> = {
      name: input.name.trim(),
      description: input.description.trim(),
      system_prompt: input.systemPrompt.trim(),
      model: input.model?.trim() ?? "",
      updated_at: updatedAt
    };
    if ("departmentId" in input) {
      patch.department_id = input.departmentId ?? null;
    }
    const affected = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees).where({ id }).update(patch);
    if (!affected) {
      return null;
    }
    const record = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees).where({ id }).first();
    return record ? toEmployeeView(record) : null;
  }

  async archiveById(id: string): Promise<boolean> {
    const affected = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees)
      .where({ id })
      .whereNot({ status: EmployeeStatus.Archived })
      .update({ status: EmployeeStatus.Archived, updated_at: dbNow() });
    return affected > 0;
  }

  async hardDeleteById(id: string): Promise<boolean> {
    const affected = await this.db<EmployeeRecord>(PLATFORM_TABLES.employees).where({ id }).delete();
    return affected > 0;
  }
}

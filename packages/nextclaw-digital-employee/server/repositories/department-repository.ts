import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type DepartmentRecord } from "../db/schema";

export type CreateDepartmentInput = {
  name: string;
  description?: string;
  externalId?: string | null;
  parentId?: string | null;
  sortOrder?: number;
};

export type UpdateDepartmentInput = {
  name?: string;
  description?: string;
  externalId?: string | null;
  parentId?: string | null;
  sortOrder?: number;
};

export type DepartmentView = {
  id: string;
  name: string;
  description: string;
  /** 外部系统（如钉钉）的部门 ID，用于数据同步匹配 */
  externalId: string | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function toDepartmentView(record: DepartmentRecord): DepartmentView {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    externalId: record.external_id ?? null,
    parentId: record.parent_id,
    sortOrder: record.sort_order,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class DepartmentRepository {
  constructor(private readonly db: Knex) {}

  async create(input: CreateDepartmentInput): Promise<DepartmentView> {
    const now = new Date().toISOString();
    const record: DepartmentRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      external_id: input.externalId ?? null,
      parent_id: input.parentId ?? null,
      sort_order: input.sortOrder ?? 0,
      created_at: now,
      updated_at: now
    };
    await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).insert(record);
    return toDepartmentView(record);
  }

  async getById(id: string): Promise<DepartmentView | null> {
    const record = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).where({ id }).first();
    return record ? toDepartmentView(record) : null;
  }

  async list(): Promise<DepartmentView[]> {
    const rows = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).orderBy([
      { column: "sort_order", order: "asc" },
      { column: "created_at", order: "asc" }
    ]);
    return rows.map(toDepartmentView);
  }

  async updateById(id: string, input: UpdateDepartmentInput): Promise<DepartmentView | null> {
    const existing = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).where({ id }).first();
    if (!existing) return null;

    const updatedAt = new Date().toISOString();
    const patch: Partial<DepartmentRecord> & { updated_at: string } = { updated_at: updatedAt };
    if (typeof input.name === "string") patch.name = input.name.trim();
    if (typeof input.description === "string") patch.description = input.description.trim();
    if ("externalId" in input) patch.external_id = input.externalId ?? null;
    if ("parentId" in input) patch.parent_id = input.parentId ?? null;
    if (typeof input.sortOrder === "number") patch.sort_order = input.sortOrder;

    await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).where({ id }).update(patch);
    const record = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).where({ id }).first();
    return record ? toDepartmentView(record) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const affected = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).where({ id }).delete();
    return affected > 0;
  }

  /** 统计指定部门下的员工数量，用于删除前校验 */
  async countEmployees(departmentId: string): Promise<number> {
    const result = await this.db(PLATFORM_TABLES.employees)
      .where({ department_id: departmentId })
      .count<{ count: number }>("id as count")
      .first();
    return Number(result?.count ?? 0);
  }

  /** 按外部 ID（如钉钉 dept_id）查找部门 */
  async getByExternalId(externalId: string): Promise<DepartmentView | null> {
    const record = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments)
      .where({ external_id: externalId })
      .first();
    return record ? toDepartmentView(record) : null;
  }

  /** 返回所有有 external_id 的部门，Map<externalId, DepartmentView>，供同步时复用 UUID */
  async mapByExternalId(): Promise<Map<string, DepartmentView>> {
    const rows = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments)
      .whereNotNull("external_id");
    const map = new Map<string, DepartmentView>();
    for (const row of rows) {
      map.set(row.external_id!, toDepartmentView(row));
    }
    return map;
  }

  /** 获取指定部门的所有子孙部门 id（用于递归删除检查） */
  async getAllDescendantIds(id: string): Promise<string[]> {
    const all = await this.db<DepartmentRecord>(PLATFORM_TABLES.departments).select("id", "parent_id");
    const descendants: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const row of all) {
        if (row.parent_id === current) {
          descendants.push(row.id);
          queue.push(row.id);
        }
      }
    }
    return descendants;
  }
}

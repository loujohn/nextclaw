import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type HumanEmployeeRecord } from "../db/schema";

export type CreateHumanEmployeeInput = {
  externalId: string;
  name: string;
  avatar?: string;
  title?: string;
  jobNumber?: string;
  active?: boolean;
  isAdmin?: boolean;
  isBoss?: boolean;
  departmentId?: string | null;
  externalDeptIds?: number[];
  unionid?: string;
};

export type HumanEmployeeView = {
  id: string;
  /** 外部系统用户 ID（如钉钉 userid） */
  externalId: string;
  name: string;
  avatar: string;
  title: string;
  jobNumber: string;
  active: boolean;
  isAdmin: boolean;
  isBoss: boolean;
  /** 主部门 ID（内部 UUID） */
  departmentId: string | null;
  /** 外部系统中该用户所属的所有部门外部 ID 列表 */
  externalDeptIds: number[];
  unionid: string;
  /** 成员类型标识，固定为 "human"，供与数字员工合并展示时区分 */
  memberType: "human";
  createdAt: string;
  updatedAt: string;
};

function toView(record: HumanEmployeeRecord): HumanEmployeeView {
  let externalDeptIds: number[] = [];
  try {
    externalDeptIds = JSON.parse(record.external_dept_ids) as number[];
  } catch {
    // ignore malformed JSON
  }
  return {
    id: record.id,
    externalId: record.external_id,
    name: record.name,
    avatar: record.avatar,
    title: record.title,
    jobNumber: record.job_number,
    active: Boolean(record.active),
    isAdmin: Boolean(record.is_admin),
    isBoss: Boolean(record.is_boss),
    departmentId: record.department_id ?? null,
    externalDeptIds,
    unionid: record.unionid,
    memberType: "human",
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class HumanEmployeeRepository {
  constructor(private readonly db: Knex) {}

  async create(input: CreateHumanEmployeeInput): Promise<HumanEmployeeView> {
    const now = new Date().toISOString();
    const record: HumanEmployeeRecord = {
      id: randomUUID(),
      external_id: input.externalId,
      name: input.name.trim(),
      avatar: input.avatar ?? "",
      title: input.title?.trim() ?? "",
      job_number: input.jobNumber?.trim() ?? "",
      active: input.active !== false ? 1 : 0,
      is_admin: input.isAdmin ? 1 : 0,
      is_boss: input.isBoss ? 1 : 0,
      department_id: input.departmentId ?? null,
      external_dept_ids: JSON.stringify(input.externalDeptIds ?? []),
      unionid: input.unionid ?? "",
      created_at: now,
      updated_at: now
    };
    await this.db<HumanEmployeeRecord>(PLATFORM_TABLES.humanEmployees).insert(record);
    return toView(record);
  }

  async getById(id: string): Promise<HumanEmployeeView | null> {
    const record = await this.db<HumanEmployeeRecord>(PLATFORM_TABLES.humanEmployees).where({ id }).first();
    return record ? toView(record) : null;
  }

  async list(filter?: { departmentId?: string | null }): Promise<HumanEmployeeView[]> {
    let query = this.db<HumanEmployeeRecord>(PLATFORM_TABLES.humanEmployees).orderBy("name", "asc");
    if (filter?.departmentId !== undefined) {
      query = query.where({ department_id: filter.departmentId });
    }
    const rows = await query;
    return rows.map(toView);
  }

  async deleteById(id: string): Promise<boolean> {
    const affected = await this.db<HumanEmployeeRecord>(PLATFORM_TABLES.humanEmployees).where({ id }).delete();
    return affected > 0;
  }

  /** 清空全部人类员工，用于组织同步时的全量替换 */
  async deleteAll(trx?: Knex): Promise<number> {
    return (trx ?? this.db)<HumanEmployeeRecord>(PLATFORM_TABLES.humanEmployees).delete();
  }

  /** 批量创建人类员工，用于组织同步 */
  async batchCreate(inputs: CreateHumanEmployeeInput[], trx?: Knex): Promise<void> {
    if (inputs.length === 0) return;
    const now = new Date().toISOString();
    const records: HumanEmployeeRecord[] = inputs.map((input) => ({
      id: randomUUID(),
      external_id: input.externalId,
      name: input.name.trim(),
      avatar: input.avatar ?? "",
      title: input.title?.trim() ?? "",
      job_number: input.jobNumber?.trim() ?? "",
      active: input.active !== false ? 1 : 0,
      is_admin: input.isAdmin ? 1 : 0,
      is_boss: input.isBoss ? 1 : 0,
      department_id: input.departmentId ?? null,
      external_dept_ids: JSON.stringify(input.externalDeptIds ?? []),
      unionid: input.unionid ?? "",
      created_at: now,
      updated_at: now
    }));
    await (trx ?? this.db).batchInsert(PLATFORM_TABLES.humanEmployees, records as unknown as object[], 100);
  }

  /** 统计指定部门下的人类员工数量，用于删除部门前校验 */
  async countByDepartmentId(departmentId: string, trx?: Knex): Promise<number> {
    const result = await (trx ?? this.db)<HumanEmployeeRecord>(PLATFORM_TABLES.humanEmployees)
      .where({ department_id: departmentId })
      .count<{ count: number }>("id as count")
      .first();
    return Number(result?.count ?? 0);
  }
}

import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES } from "../db/schema";
import { EmployeeStatus } from "../db/enums";
import { dbNow } from "../db/knex";

type EmployeeSkillRecord = {
  id: string;
  employee_id: string;
  skill_name: string;
  enabled: number | boolean;
  config_json: string;
  created_at: string;
  updated_at: string;
};

export type EmployeeSkillView = {
  id: string;
  employeeId: string;
  skillName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function toView(record: EmployeeSkillRecord): EmployeeSkillView {
  return {
    id: record.id,
    employeeId: record.employee_id,
    skillName: record.skill_name,
    enabled: Boolean(record.enabled),
    config: JSON.parse(record.config_json),
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class EmployeeSkillRepository {
  constructor(private readonly db: Knex) {}

  async replaceForEmployee(employeeId: string, skillNames: string[]): Promise<EmployeeSkillView[]> {
    await this.db<EmployeeSkillRecord>(PLATFORM_TABLES.employeeSkills).where({ employee_id: employeeId }).delete();
    if (skillNames.length === 0) {
      return [];
    }
    const now = dbNow();
    const rows: EmployeeSkillRecord[] = skillNames.map((skillName) => ({
      id: randomUUID(),
      employee_id: employeeId,
      skill_name: skillName,
      enabled: true,
      config_json: "{}",
      created_at: now,
      updated_at: now
    }));
    await this.db<EmployeeSkillRecord>(PLATFORM_TABLES.employeeSkills).insert(rows);
    return rows.map(toView);
  }

  async listByEmployeeId(employeeId: string): Promise<EmployeeSkillView[]> {
    const rows = await this.db<EmployeeSkillRecord>(PLATFORM_TABLES.employeeSkills)
      .where({ employee_id: employeeId })
      .orderBy("created_at", "asc");
    return rows.map(toView);
  }

  async listByEmployeeIds(employeeIds: string[]): Promise<Map<string, EmployeeSkillView[]>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await this.db<EmployeeSkillRecord>(PLATFORM_TABLES.employeeSkills)
      .whereIn("employee_id", employeeIds)
      .orderBy("created_at", "asc");
    const map = new Map<string, EmployeeSkillView[]>();
    for (const row of rows) {
      const view = toView(row);
      const list = map.get(view.employeeId) ?? [];
      list.push(view);
      map.set(view.employeeId, list);
    }
    return map;
  }

  async listAll(): Promise<EmployeeSkillView[]> {
    const rows = await this.db<EmployeeSkillRecord>(PLATFORM_TABLES.employeeSkills).orderBy("created_at", "asc");
    return rows.map(toView);
  }

  async listAllWithEmployeeNames(): Promise<Array<{ employeeId: string; employeeName: string; skillName: string }>> {
    const es = PLATFORM_TABLES.employeeSkills;
    const e = PLATFORM_TABLES.employees;
    const rows = await this.db(es)
      .innerJoin(e, `${es}.employee_id`, `${e}.id`)
      .whereNot(`${e}.status`, EmployeeStatus.Archived)
      .select(`${es}.employee_id`, `${e}.name as employee_name`, `${es}.skill_name`)
      .orderBy(`${es}.created_at`, "asc");
    return (rows as Array<{ employee_id: string; employee_name?: string; skill_name: string }>).map((row) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name ?? row.employee_id,
      skillName: row.skill_name
    }));
  }
}

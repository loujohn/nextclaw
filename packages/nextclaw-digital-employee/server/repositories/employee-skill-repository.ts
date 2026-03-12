import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES } from "../db/schema";

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
    const now = new Date().toISOString();
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

  async listAll(): Promise<EmployeeSkillView[]> {
    const rows = await this.db<EmployeeSkillRecord>(PLATFORM_TABLES.employeeSkills).orderBy("created_at", "asc");
    return rows.map(toView);
  }
}

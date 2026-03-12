import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES } from "../db/schema";

type EmployeeScheduleRecord = {
  id: string;
  employee_id: string;
  schedule_kind: string;
  cron_expr: string | null;
  every_ms: number | null;
  heartbeat_enabled: number | boolean;
  heartbeat_interval_s: number | null;
  enabled: number | boolean;
  runtime_job_id: string | null;
  schedule_message: string;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeScheduleView = {
  id: string;
  employeeId: string;
  scheduleKind: string;
  cronExpr: string | null;
  everyMs: number | null;
  heartbeatEnabled: boolean;
  heartbeatIntervalS: number | null;
  enabled: boolean;
  runtimeJobId: string | null;
  scheduleMessage: string;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertEmployeeScheduleInput = {
  employeeId: string;
  scheduleKind: string;
  cronExpr?: string | null;
  everyMs?: number | null;
  heartbeatEnabled?: boolean;
  heartbeatIntervalS?: number | null;
  enabled?: boolean;
  runtimeJobId?: string | null;
  scheduleMessage?: string;
  nextRunAt?: string | null;
};

function toView(record: EmployeeScheduleRecord): EmployeeScheduleView {
  return {
    id: record.id,
    employeeId: record.employee_id,
    scheduleKind: record.schedule_kind,
    cronExpr: record.cron_expr,
    everyMs: record.every_ms,
    heartbeatEnabled: Boolean(record.heartbeat_enabled),
    heartbeatIntervalS: record.heartbeat_interval_s,
    enabled: Boolean(record.enabled),
    runtimeJobId: record.runtime_job_id,
    scheduleMessage: record.schedule_message,
    nextRunAt: record.next_run_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class EmployeeScheduleRepository {
  constructor(private readonly db: Knex) {}

  async upsert(input: UpsertEmployeeScheduleInput): Promise<EmployeeScheduleView> {
    const existing = await this.db<EmployeeScheduleRecord>(PLATFORM_TABLES.employeeSchedules)
      .where({ employee_id: input.employeeId })
      .first();
    const now = new Date().toISOString();
    const payload = {
      employee_id: input.employeeId,
      schedule_kind: input.scheduleKind,
      cron_expr: input.cronExpr ?? null,
      every_ms: input.everyMs ?? null,
      heartbeat_enabled: input.heartbeatEnabled ?? false,
      heartbeat_interval_s: input.heartbeatIntervalS ?? null,
      enabled: input.enabled ?? true,
      runtime_job_id: input.runtimeJobId ?? null,
      schedule_message: input.scheduleMessage ?? "",
      next_run_at: input.nextRunAt ?? null,
      updated_at: now
    };
    if (existing) {
      await this.db<EmployeeScheduleRecord>(PLATFORM_TABLES.employeeSchedules).where({ id: existing.id }).update(payload);
      const updated = await this.db<EmployeeScheduleRecord>(PLATFORM_TABLES.employeeSchedules).where({ id: existing.id }).first();
      return toView(updated as EmployeeScheduleRecord);
    }
    const created: EmployeeScheduleRecord = {
      id: randomUUID(),
      ...payload,
      created_at: now
    };
    await this.db<EmployeeScheduleRecord>(PLATFORM_TABLES.employeeSchedules).insert(created);
    return toView(created);
  }

  async getByEmployeeId(employeeId: string): Promise<EmployeeScheduleView | null> {
    const record = await this.db<EmployeeScheduleRecord>(PLATFORM_TABLES.employeeSchedules)
      .where({ employee_id: employeeId })
      .first();
    return record ? toView(record) : null;
  }

  async deleteByEmployeeId(employeeId: string): Promise<void> {
    await this.db<EmployeeScheduleRecord>(PLATFORM_TABLES.employeeSchedules).where({ employee_id: employeeId }).delete();
  }
}

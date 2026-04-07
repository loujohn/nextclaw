import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES } from "../db/schema";
import { dbNow } from "../db/knex";

type EmployeeScheduleJobRecord = {
  id: string;
  employee_id: string;
  name: string;
  description: string;
  schedule_kind: string;
  cron_expr: string | null;
  every_ms: number | null;
  heartbeat_interval_s: number | null;
  task_prompt: string;
  enabled: number | boolean;
  runtime_job_id: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeScheduleJobView = {
  id: string;
  employeeId: string;
  name: string;
  description: string;
  scheduleKind: string;
  cronExpr: string | null;
  everyMs: number | null;
  heartbeatIntervalS: number | null;
  taskPrompt: string;
  enabled: boolean;
  runtimeJobId: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateEmployeeScheduleJobInput = {
  employeeId: string;
  name: string;
  description?: string;
  scheduleKind: "cron" | "every" | "heartbeat";
  cronExpr?: string | null;
  everyMs?: number | null;
  heartbeatIntervalS?: number | null;
  taskPrompt?: string;
  enabled?: boolean;
  runtimeJobId?: string | null;
  nextRunAt?: string | null;
};

export type UpdateEmployeeScheduleJobInput = Partial<Omit<CreateEmployeeScheduleJobInput, "employeeId">>;

function toView(record: EmployeeScheduleJobRecord): EmployeeScheduleJobView {
  return {
    id: record.id,
    employeeId: record.employee_id,
    name: record.name,
    description: record.description,
    scheduleKind: record.schedule_kind,
    cronExpr: record.cron_expr,
    everyMs: record.every_ms,
    heartbeatIntervalS: record.heartbeat_interval_s,
    taskPrompt: record.task_prompt,
    enabled: Boolean(record.enabled),
    runtimeJobId: record.runtime_job_id,
    nextRunAt: record.next_run_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class EmployeeScheduleJobRepository {
  constructor(private readonly db: Knex) {}

  async create(input: CreateEmployeeScheduleJobInput): Promise<EmployeeScheduleJobView> {
    const now = dbNow();
    const record: EmployeeScheduleJobRecord = {
      id: randomUUID(),
      employee_id: input.employeeId,
      name: input.name,
      description: input.description ?? "",
      schedule_kind: input.scheduleKind,
      cron_expr: input.cronExpr ?? null,
      every_ms: input.everyMs ?? null,
      heartbeat_interval_s: input.heartbeatIntervalS ?? null,
      task_prompt: input.taskPrompt ?? "",
      enabled: input.enabled ?? true,
      runtime_job_id: input.runtimeJobId ?? null,
      next_run_at: input.nextRunAt ?? null,
      created_at: now,
      updated_at: now
    };
    await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs).insert(record);
    return toView(record);
  }

  async update(jobId: string, input: UpdateEmployeeScheduleJobInput): Promise<EmployeeScheduleJobView | null> {
    const now = dbNow();
    const payload: Partial<EmployeeScheduleJobRecord> = { updated_at: now };
    if (input.name !== undefined) payload.name = input.name;
    if (input.description !== undefined) payload.description = input.description;
    if (input.scheduleKind !== undefined) payload.schedule_kind = input.scheduleKind;
    if (input.cronExpr !== undefined) payload.cron_expr = input.cronExpr;
    if (input.everyMs !== undefined) payload.every_ms = input.everyMs;
    if (input.heartbeatIntervalS !== undefined) payload.heartbeat_interval_s = input.heartbeatIntervalS;
    if (input.taskPrompt !== undefined) payload.task_prompt = input.taskPrompt;
    if (input.enabled !== undefined) payload.enabled = input.enabled;
    if (input.runtimeJobId !== undefined) payload.runtime_job_id = input.runtimeJobId;
    if (input.nextRunAt !== undefined) payload.next_run_at = input.nextRunAt;
    await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs)
      .where({ id: jobId })
      .update(payload);
    return this.getById(jobId);
  }

  async delete(jobId: string): Promise<void> {
    await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs).where({ id: jobId }).delete();
  }

  async getById(jobId: string): Promise<EmployeeScheduleJobView | null> {
    const record = await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs)
      .where({ id: jobId })
      .first();
    return record ? toView(record) : null;
  }

  async listByEmployeeId(employeeId: string): Promise<EmployeeScheduleJobView[]> {
    const records = await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs)
      .where({ employee_id: employeeId })
      .orderBy("created_at", "asc")
      .select();
    return records.map(toView);
  }

  async listByEmployeeIds(employeeIds: string[]): Promise<Map<string, EmployeeScheduleJobView[]>> {
    if (employeeIds.length === 0) return new Map();
    const records = await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs)
      .whereIn("employee_id", employeeIds)
      .orderBy("created_at", "asc");
    const map = new Map<string, EmployeeScheduleJobView[]>();
    for (const record of records) {
      const view = toView(record);
      const list = map.get(view.employeeId) ?? [];
      list.push(view);
      map.set(view.employeeId, list);
    }
    return map;
  }

  async listAllEnabled(): Promise<EmployeeScheduleJobView[]> {
    const records = await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs)
      .where({ enabled: 1 })
      .select();
    return records.map(toView);
  }

  async patchNextRunAt(jobId: string, nextRunAt: string | null): Promise<void> {
    await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs)
      .where({ id: jobId })
      .update({ next_run_at: nextRunAt, updated_at: dbNow() });
  }

  async patchRuntimeJobId(jobId: string, runtimeJobId: string | null): Promise<void> {
    await this.db<EmployeeScheduleJobRecord>(PLATFORM_TABLES.employeeScheduleJobs)
      .where({ id: jobId })
      .update({ runtime_job_id: runtimeJobId, updated_at: dbNow() });
  }
}

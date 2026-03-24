import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type RunEventRecord, type RunRecord } from "../db/schema";

export type RunRecordView = {
  id: string;
  employeeId: string | null;
  triggerType: string;
  triggerSource: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  result: Record<string, unknown>;
};

export type RunEventView = {
  id: string;
  runId: string;
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

function toRunRecordView(record: RunRecord): RunRecordView {
  return {
    id: record.id,
    employeeId: record.employee_id,
    triggerType: record.trigger_type,
    triggerSource: record.trigger_source,
    status: record.status,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
    summary: record.summary,
    result: JSON.parse(record.result_json)
  };
}

function toRunEventView(record: RunEventRecord): RunEventView {
  return {
    id: record.id,
    runId: record.run_id,
    seq: record.seq,
    eventType: record.event_type,
    payload: JSON.parse(record.payload_json),
    createdAt: record.created_at
  };
}

export class RunRecordRepository {
  constructor(private readonly db: Knex) {}

  async create(params: {
    employeeId: string;
    triggerType: string;
    triggerSource: string;
  }): Promise<RunRecordView> {
    const startedAt = new Date().toISOString();
    const record: RunRecord = {
      id: randomUUID(),
      employee_id: params.employeeId,
      trigger_type: params.triggerType,
      trigger_source: params.triggerSource,
      status: "running",
      started_at: startedAt,
      finished_at: null,
      summary: "",
      result_json: "{}"
    };
    await this.db<RunRecord>(PLATFORM_TABLES.runRecords).insert(record);
    return toRunRecordView(record);
  }

  async appendEvents(runId: string, events: Array<{ eventType: string; payload: Record<string, unknown> }>): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    const rows: RunEventRecord[] = events.map((event, index) => ({
      id: randomUUID(),
      run_id: runId,
      seq: index + 1,
      event_type: event.eventType,
      payload_json: JSON.stringify(event.payload),
      created_at: now
    }));
    await this.db<RunEventRecord>(PLATFORM_TABLES.runEvents).insert(rows);
  }

  async complete(runId: string, params: { status: string; summary: string; result: Record<string, unknown> }): Promise<RunRecordView> {
    const finishedAt = new Date().toISOString();
    await this.db<RunRecord>(PLATFORM_TABLES.runRecords)
      .where({ id: runId })
      .update({
        status: params.status,
        summary: params.summary,
        result_json: JSON.stringify(params.result),
        finished_at: finishedAt
      });
    const record = await this.db<RunRecord>(PLATFORM_TABLES.runRecords).where({ id: runId }).first();
    return toRunRecordView(record as RunRecord);
  }

  async listByEmployeeId(employeeId: string): Promise<RunRecordView[]> {
    const rows = await this.db<RunRecord>(PLATFORM_TABLES.runRecords)
      .where({ employee_id: employeeId })
      .orderBy("started_at", "desc");
    return rows.map(toRunRecordView);
  }

  async listPagedByEmployeeId(params: { employeeId: string; page: number; pageSize: number; scheduleJobId?: string }): Promise<{ items: RunRecordView[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const applyFilter = (q: ReturnType<typeof this.db<RunRecord>>) => {
      let query = q.where({ employee_id: params.employeeId });
      if (params.scheduleJobId) {
        query = query.where({ trigger_source: params.scheduleJobId });
      }
      return query;
    };
    const [rows, countResult] = await Promise.all([
      applyFilter(this.db<RunRecord>(PLATFORM_TABLES.runRecords).orderBy("started_at", "desc"))
        .limit(params.pageSize)
        .offset(offset),
      applyFilter(this.db<RunRecord>(PLATFORM_TABLES.runRecords)).count({ count: "id" }).first()
    ]);
    const total = Number(countResult?.count ?? 0);
    return { items: rows.map(toRunRecordView), total };
  }

  async list(limit = 50): Promise<RunRecordView[]> {
    const rows = await this.db<RunRecord>(PLATFORM_TABLES.runRecords)
      .orderBy("started_at", "desc")
      .limit(limit);
    return rows.map(toRunRecordView);
  }

  async listPaged(params: { page: number; pageSize: number; status?: string }): Promise<{ items: RunRecordView[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const applyStatus = (q: ReturnType<typeof this.db<RunRecord>>) =>
      params.status ? q.where({ status: params.status }) : q;
    const [rows, countResult] = await Promise.all([
      applyStatus(
        this.db<RunRecord>(PLATFORM_TABLES.runRecords).orderBy("started_at", "desc")
      )
        .limit(params.pageSize)
        .offset(offset),
      applyStatus(this.db<RunRecord>(PLATFORM_TABLES.runRecords)).count({ count: "id" }).first()
    ]);
    const total = Number(countResult?.count ?? 0);
    return { items: rows.map(toRunRecordView), total };
  }

  async getById(runId: string): Promise<(RunRecordView & { events: RunEventView[] }) | null> {
    const record = await this.db<RunRecord>(PLATFORM_TABLES.runRecords).where({ id: runId }).first();
    if (!record) {
      return null;
    }
    const events = await this.db<RunEventRecord>(PLATFORM_TABLES.runEvents).where({ run_id: runId }).orderBy("seq", "asc");
    return {
      ...toRunRecordView(record),
      events: events.map(toRunEventView)
    };
  }

  async deleteByEmployeeId(employeeId: string): Promise<void> {
    await this.db<RunRecord>(PLATFORM_TABLES.runRecords).where({ employee_id: employeeId }).delete();
  }
}

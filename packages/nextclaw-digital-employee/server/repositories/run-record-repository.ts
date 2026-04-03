import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type RunEventRecord, type RunRecord } from "../db/schema";
import { RunStatus } from "../db/enums";
import { dbNow, formatTimestamp, isSqlite } from "../db/knex";

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
    const startedAt = dbNow();
    const record: RunRecord = {
      id: randomUUID(),
      employee_id: params.employeeId,
      trigger_type: params.triggerType,
      trigger_source: params.triggerSource,
      status: RunStatus.Running,
      started_at: startedAt,
      finished_at: null,
      summary: "",
      result_json: "{}"
    };
    await this.db<RunRecord>(PLATFORM_TABLES.runRecords).insert(record);
    return toRunRecordView(record);
  }

  /**
   * Append events with batch-scoped sequential seq (1-based within each call).
   * For single-batch-per-run usage this gives a clean 1..N ordering.
   * If multi-batch append is needed in the future, switch to MAX(seq)+1 query.
   */
  async appendEvents(runId: string, events: Array<{ eventType: string; payload: Record<string, unknown> }>): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const now = dbNow();
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
    const finishedAt = dbNow();
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

  /**
   * On server startup, mark all stuck "running" runs as "interrupted".
   * These are runs that were in-flight when the server crashed or restarted.
   * Returns the number of runs recovered.
   */
  async recoverRunningRuns(): Promise<number> {
    const finishedAt = dbNow();
    const count = await this.db<RunRecord>(PLATFORM_TABLES.runRecords)
      .where({ status: RunStatus.Running })
      .update({ status: RunStatus.Interrupted, finished_at: finishedAt });
    return count;
  }

  async listByEmployeeId(employeeId: string, limit?: number): Promise<RunRecordView[]> {
    let query = this.db<RunRecord>(PLATFORM_TABLES.runRecords)
      .where({ employee_id: employeeId })
      .orderBy("started_at", "desc");
    if (limit) query = query.limit(limit);
    const rows = await query;
    return rows.map(toRunRecordView);
  }

  async getLatestRunSummaryByEmployeeIds(
    employeeIds: string[]
  ): Promise<Map<string, { status: string; summary: string; finishedAt: string | null }>> {
    if (employeeIds.length === 0) return new Map();
    const subquery = this.db(PLATFORM_TABLES.runRecords)
      .select("employee_id")
      .max("started_at as max_started_at")
      .whereIn("employee_id", employeeIds)
      .groupBy("employee_id")
      .as("latest");
    const rows = await this.db(PLATFORM_TABLES.runRecords)
      .select(
        `${PLATFORM_TABLES.runRecords}.employee_id`,
        `${PLATFORM_TABLES.runRecords}.status`,
        `${PLATFORM_TABLES.runRecords}.summary`,
        `${PLATFORM_TABLES.runRecords}.finished_at`
      )
      .join(subquery, function () {
        this.on(`${PLATFORM_TABLES.runRecords}.employee_id`, "=", "latest.employee_id")
          .andOn(`${PLATFORM_TABLES.runRecords}.started_at`, "=", "latest.max_started_at");
      });
    const map = new Map<string, { status: string; summary: string; finishedAt: string | null }>();
    for (const row of rows as Array<{ employee_id: string; status: string; summary: string; finished_at: string | null }>) {
      if (row.employee_id && !map.has(row.employee_id)) {
        map.set(row.employee_id, {
          status: row.status,
          summary: row.summary,
          finishedAt: row.finished_at,
        });
      }
    }
    return map;
  }

  async hasRecentFailureByEmployeeIds(employeeIds: string[]): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const rows = await this.db(PLATFORM_TABLES.runRecords)
      .select("employee_id")
      .whereIn("employee_id", employeeIds)
      .andWhere({ status: "failed" })
      .andWhere("started_at", ">=", this.db.raw(
        isSqlite() ? `datetime('now', '-24 hours')` : `SYSDATE - INTERVAL '24' HOUR`
      ))
      .groupBy("employee_id");
    return new Set((rows as Array<{ employee_id: string }>).map(r => r.employee_id));
  }

  async listPagedByEmployeeId(params: { employeeId: string; page: number; pageSize: number; scheduleJobId?: string }): Promise<{ items: RunRecordView[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const applyFilter = (q: Knex.QueryBuilder) => {
      let query = q.where({ employee_id: params.employeeId });
      if (params.scheduleJobId) {
        query = query.where({ trigger_source: params.scheduleJobId });
      }
      return query;
    };
    const [rows, countResult] = await Promise.all([
      applyFilter(this.db(PLATFORM_TABLES.runRecords).orderBy("started_at", "desc"))
        .limit(params.pageSize)
        .offset(offset),
      applyFilter(this.db(PLATFORM_TABLES.runRecords)).count({ count: "id" }).first()
    ]);
    const total = Number((countResult as { count?: number | string } | undefined)?.count ?? 0);
    return { items: (rows as RunRecord[]).map(toRunRecordView), total };
  }

  async list(limit = 50): Promise<RunRecordView[]> {
    const rows = await this.db<RunRecord>(PLATFORM_TABLES.runRecords)
      .orderBy("started_at", "desc")
      .limit(limit);
    return rows.map(toRunRecordView);
  }

  async listPaged(params: { page: number; pageSize: number; status?: string }): Promise<{ items: RunRecordView[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const applyStatus = (q: Knex.QueryBuilder) =>
      params.status ? q.where({ status: params.status }) : q;
    const [rows, countResult] = await Promise.all([
      applyStatus(
        this.db(PLATFORM_TABLES.runRecords).orderBy("started_at", "desc")
      )
        .limit(params.pageSize)
        .offset(offset),
      applyStatus(this.db(PLATFORM_TABLES.runRecords)).count({ count: "id" }).first()
    ]);
    const total = Number((countResult as { count?: number | string } | undefined)?.count ?? 0);
    return { items: (rows as RunRecord[]).map(toRunRecordView), total };
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

  async getTodayStats(): Promise<{ employeeId: string; total: number; succeeded: number }[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rows = await this.db(PLATFORM_TABLES.runRecords)
      .select("employee_id")
      .count("* as total")
      .select(this.db.raw("count(CASE WHEN status = 'completed' THEN 1 END) as succeeded"))
      .where("started_at", ">=", formatTimestamp(todayStart))
      .groupBy("employee_id");
    return (rows as Array<{ employee_id: string; total: number | string; succeeded: number | string | null }>).map((row) => ({
      employeeId: row.employee_id,
      total: Number(row.total),
      succeeded: Number(row.succeeded ?? 0),
    }));
  }

  async getTotalCountByEmployee(): Promise<{ employeeId: string; total: number }[]> {
    const rows = await this.db(PLATFORM_TABLES.runRecords)
      .select("employee_id")
      .count("* as total")
      .groupBy("employee_id");
    return (rows as Array<{ employee_id: string; total: number | string }>).map((row) => ({
      employeeId: row.employee_id,
      total: Number(row.total),
    }));
  }

  async deleteByEmployeeId(employeeId: string): Promise<void> {
    await this.db<RunRecord>(PLATFORM_TABLES.runRecords).where({ employee_id: employeeId }).delete();
  }
}

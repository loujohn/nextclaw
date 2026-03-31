import type { EmployeeView } from "../repositories/employee-repository";
import { RunRecordRepository } from "../repositories/run-record-repository";
import { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { EmployeeStatus } from "../db/enums";
import { type HealthDetail, buildHealthDetail } from "../../shared/ui-models";

export class EmployeeHealthService {
  constructor(
    private readonly runRepo: RunRecordRepository,
    private readonly gateway: NextclawEngineGateway
  ) {}

  async computeHealth(employee: EmployeeView): Promise<HealthDetail> {
    const hasApiKey = this.gateway.hasConfiguredProvider();
    const isActive = employee.status === EmployeeStatus.Active;

    const recentRuns = await this.runRepo.listPagedByEmployeeId({
      employeeId: employee.id,
      page: 1,
      pageSize: 5,
    });
    const hasRecentFailure = recentRuns.items.some((r) => r.status === "failed");

    return buildHealthDetail({ hasApiKey, hasRecentFailure, isActive });
  }

  /**
   * Batch compute health for multiple employees.
   * TODO(perf): Optimize to use WHERE IN queries instead of N+1 calls.
   */
  async computeHealthBatch(employees: EmployeeView[]): Promise<Map<string, HealthDetail>> {
    const results = new Map<string, HealthDetail>();
    const details = await Promise.all(employees.map((e) => this.computeHealth(e)));
    for (let i = 0; i < employees.length; i++) {
      results.set(employees[i]!.id, details[i]!);
    }
    return results;
  }
}

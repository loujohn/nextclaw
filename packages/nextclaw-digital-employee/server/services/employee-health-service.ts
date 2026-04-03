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

  computeHealthBatchFromPrefetched(
    employees: EmployeeView[],
    recentFailureSet: Set<string>
  ): Map<string, HealthDetail> {
    const hasApiKey = this.gateway.hasConfiguredProvider();
    const results = new Map<string, HealthDetail>();
    for (const employee of employees) {
      const isActive = employee.status === EmployeeStatus.Active;
      const hasRecentFailure = recentFailureSet.has(employee.id);
      results.set(employee.id, buildHealthDetail({ hasApiKey, hasRecentFailure, isActive }));
    }
    return results;
  }

  async computeHealthBatch(employees: EmployeeView[]): Promise<Map<string, HealthDetail>> {
    const ids = employees.map(e => e.id);
    const recentFailureSet = await this.runRepo.hasRecentFailureByEmployeeIds(ids);
    return this.computeHealthBatchFromPrefetched(employees, recentFailureSet);
  }
}

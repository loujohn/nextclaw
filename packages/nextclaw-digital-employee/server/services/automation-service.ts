import { CronService } from "@nextclaw/core";
import { EmployeeRepository } from "../repositories/employee-repository";
import {
  EmployeeScheduleRepository,
  type EmployeeScheduleView
} from "../repositories/employee-schedule-repository";
import { EmployeeRunService } from "./employee-run-service";

export class AutomationService {
  private started = false;

  constructor(
    private readonly scheduleRepo: EmployeeScheduleRepository,
    private readonly employeeRepo: EmployeeRepository,
    private readonly runService: EmployeeRunService,
    private readonly cronService: CronService
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.cronService.onJob = async (job) => {
      const employeeId = job.name.startsWith("employee:") ? job.name.slice("employee:".length) : "";
      if (!employeeId) {
        return null;
      }
      const employee = await this.employeeRepo.getById(employeeId);
      if (!employee) {
        return null;
      }
      const message = job.payload.message || `${employee.systemPrompt}\n\n请执行一次定时任务并输出最新摘要。`;
      const result = await this.runService.runEmployeeTurn({
        employeeId,
        message,
        triggerType: "scheduled",
        triggerSource: "cron"
      });
      return result.reply;
    };
    await this.cronService.start();
    this.started = true;
  }

  async upsertSchedule(input: {
    employeeId: string;
    scheduleKind: "cron" | "every" | "heartbeat";
    cronExpr?: string | null;
    everyMs?: number | null;
    enabled?: boolean;
  }): Promise<EmployeeScheduleView> {
    const employee = await this.employeeRepo.getById(input.employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${input.employeeId}`);
    }
    const existing = await this.scheduleRepo.getByEmployeeId(input.employeeId);
    if (existing?.runtimeJobId) {
      this.cronService.removeJob(existing.runtimeJobId);
    }
    const scheduleMessage = `${employee.systemPrompt}\n\n请按你的职责执行一次定时任务，并输出当前最新摘要。`;
    const job = this.cronService.addJob({
      name: `employee:${input.employeeId}`,
      schedule:
        input.scheduleKind === "cron"
          ? { kind: "cron", expr: input.cronExpr ?? "0 9 * * *" }
          : {
              kind: "every",
              everyMs:
                input.scheduleKind === "heartbeat"
                  ? Math.max(1_000, Math.trunc((input.everyMs ?? 30 * 60 * 1000)))
                  : Math.max(1_000, Math.trunc(input.everyMs ?? 60_000))
            },
      message: scheduleMessage,
      deliver: false
    });
    return this.scheduleRepo.upsert({
      employeeId: input.employeeId,
      scheduleKind: input.scheduleKind,
      cronExpr: input.cronExpr ?? null,
      everyMs: input.everyMs ?? null,
      heartbeatEnabled: input.scheduleKind === "heartbeat",
      heartbeatIntervalS: input.scheduleKind === "heartbeat" ? Math.floor((input.everyMs ?? 30 * 60 * 1000) / 1000) : null,
      enabled: input.enabled ?? true,
      runtimeJobId: job.id,
      scheduleMessage,
      nextRunAt: job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null
    });
  }

  async runNow(employeeId: string): Promise<boolean> {
    const schedule = await this.scheduleRepo.getByEmployeeId(employeeId);
    if (!schedule?.runtimeJobId) {
      return false;
    }
    return this.cronService.runJob(schedule.runtimeJobId, true);
  }
}

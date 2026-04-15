import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../utils/logger";

const logger = createLogger("EmployeeLifecycle");
import { EmployeeRepository, type CreateEmployeeInput, type EmployeeView } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { AutomationService } from "./automation-service";
import { ensureEmployeeWorkspace, resolveEmployeeWorkspace } from "../engine/employee-workspace";
import type { NextclawEngineGateway } from "../engine/NextclawEngineGateway";

const WRITABLE_FILES = new Set(["AGENTS.md", "TOOLS.md", "USER.md", "BOOT.md", "HEARTBEAT.md", "MEMORY.md"]);
const VALID_SCHEDULE_KINDS = new Set(["cron", "every", "heartbeat"]);

export class EmployeeLifecycleService {
  constructor(
    private readonly employeeRepo: EmployeeRepository,
    private readonly skillRepo: EmployeeSkillRepository,
    private readonly automationService: AutomationService,
    private readonly gateway: NextclawEngineGateway
  ) {}

  async createEmployee(input: {
    employee: CreateEmployeeInput;
    skillNames?: string[];
    schedule?: {
      scheduleKind: "cron" | "every" | "heartbeat";
      cronExpr?: string;
      everyMs?: number;
    };
    workspaceFiles?: Record<string, string>;
  }): Promise<EmployeeView & { skills: unknown[]; schedule: unknown }> {
    const employee = await this.employeeRepo.create(input.employee);

    try {
      ensureEmployeeWorkspace(this.gateway.homeDir, {
        code: employee.code,
        name: employee.name,
        description: employee.description,
        systemPrompt: employee.systemPrompt,
      }, this.gateway.workspaceDir);

      const wsFiles = input.workspaceFiles ?? {};
      const wsDir = resolveEmployeeWorkspace(this.gateway.homeDir, employee.code);
      for (const [filename, content] of Object.entries(wsFiles)) {
        if (WRITABLE_FILES.has(filename) && typeof content === "string" && content.trim()) {
          writeFileSync(join(wsDir, filename), content, "utf-8");
        }
      }

      const skills = await this.skillRepo.replaceForEmployee(employee.id, input.skillNames ?? []);

      let schedule = null;
      if (input.schedule?.scheduleKind) {
        schedule = await this.automationService.createJob({
          employeeId: employee.id,
          name: `${employee.name} - 默认调度`,
          scheduleKind: input.schedule.scheduleKind,
          cronExpr: input.schedule.cronExpr,
          everyMs: input.schedule.everyMs,
        });
      }

      logger.info(`Employee created: ${employee.code} (${employee.id})`);
      return { ...employee, skills, schedule };
    } catch (err) {
      logger.error(`Employee creation failed for ${input.employee.code}, rolling back`, err);
      await this.employeeRepo.hardDeleteById(employee.id);
      throw err;
    }
  }

  async deleteEmployee(id: string): Promise<{ id: string; code: string }> {
    const employee = await this.employeeRepo.getById(id);
    if (!employee) {
      throw Object.assign(new Error(`employee not found: ${id}`), { statusCode: 404 });
    }

    await this.automationService.clearSchedule(id);
    const jobs = await this.automationService.listJobsForEmployee(id);
    for (const job of jobs) {
      if (job.enabled) {
        await this.automationService.updateJob(job.id, { enabled: false });
      }
    }

    await this.employeeRepo.archiveById(id);

    logger.info(`Employee archived: ${employee.code} (${id})`);
    return { id, code: employee.code };
  }

  async updateEmployee(
    id: string,
    input: {
      name?: string;
      description?: string;
      systemPrompt?: string;
      model?: string;
      departmentId?: string | null;
      skillNames?: string[];
      schedule?: { scheduleKind: string; cronExpr?: string; everyMs?: number };
      workspaceFiles?: Record<string, string>;
      webhookEnabled?: boolean;
      webhookSecret?: string | null;
    }
  ): Promise<{ employee: EmployeeView; skills: unknown[]; jobs: unknown[] }> {
    const existing = await this.employeeRepo.getById(id);
    if (!existing) {
      throw Object.assign(new Error(`employee not found: ${id}`), { statusCode: 404 });
    }

    const name = input.name?.trim() || existing.name;
    const updateInput: Parameters<EmployeeRepository["updateById"]>[1] = {
      name,
      description: input.description ?? existing.description,
      systemPrompt: input.systemPrompt ?? existing.systemPrompt,
      model: input.model ?? existing.model,
    };
    if (input.departmentId !== undefined) {
      updateInput.departmentId = input.departmentId;
    }
    if (input.webhookEnabled !== undefined) {
      updateInput.webhookEnabled = input.webhookEnabled;
    }
    if (input.webhookSecret !== undefined) {
      updateInput.webhookSecret = input.webhookSecret;
    }
    const updated = await this.employeeRepo.updateById(id, updateInput);
    if (!updated) {
      throw Object.assign(new Error(`employee not found: ${id}`), { statusCode: 404 });
    }

    ensureEmployeeWorkspace(this.gateway.homeDir, {
      code: updated.code,
      name: updated.name,
      description: updated.description,
      systemPrompt: updated.systemPrompt,
    }, this.gateway.workspaceDir);

    const wsFiles = input.workspaceFiles ?? {};
    const wsDir = resolveEmployeeWorkspace(this.gateway.homeDir, updated.code);
    for (const [filename, content] of Object.entries(wsFiles)) {
      if (WRITABLE_FILES.has(filename) && typeof content === "string") {
        writeFileSync(join(wsDir, filename), content, "utf-8");
      }
    }

    let skills = await this.skillRepo.listByEmployeeId(id);
    if (Array.isArray(input.skillNames)) {
      skills = await this.skillRepo.replaceForEmployee(id, input.skillNames);
    }

    let jobs = await this.automationService.listJobsForEmployee(id);
    if (input.schedule?.scheduleKind && VALID_SCHEDULE_KINDS.has(input.schedule.scheduleKind)) {
      const upserted = await this.upsertSchedule(id, updated.name, input.schedule);
      jobs = [upserted];
    }

    logger.info(`Employee updated: ${updated.code} (${id})`);
    return { employee: updated, skills, jobs };
  }

  async upsertSchedule(
    employeeId: string,
    employeeName: string,
    schedule: { scheduleKind: string; cronExpr?: string; everyMs?: number }
  ) {
    const jobs = await this.automationService.listJobsForEmployee(employeeId);
    if (jobs.length > 0) {
      return this.automationService.updateJob(jobs[0]!.id, {
        scheduleKind: schedule.scheduleKind as "cron" | "every" | "heartbeat",
        cronExpr: schedule.cronExpr,
        everyMs: schedule.everyMs,
      });
    }
    return this.automationService.createJob({
      employeeId,
      name: `${employeeName} - 调度`,
      scheduleKind: schedule.scheduleKind as "cron" | "every" | "heartbeat",
      cronExpr: schedule.cronExpr,
      everyMs: schedule.everyMs,
    });
  }
}

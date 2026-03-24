import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Knex } from "knex";
import { CronService, MessageBus, SessionManager } from "@nextclaw/core";
import { findBuiltinProviderByName } from "@nextclaw/runtime";
import { createPlatformKnex, ensurePlatformDatabase } from "../db/knex";
import { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { AutomationService } from "../services/automation-service";
import { EmployeeRunService } from "../services/employee-run-service";
import { SkillInstallService } from "../services/skill-install-service";
import { DepartmentRepository } from "../repositories/department-repository";
import { EmployeeRepository } from "../repositories/employee-repository";
import { EmployeeScheduleRepository } from "../repositories/employee-schedule-repository";
import { EmployeeScheduleJobRepository } from "../repositories/employee-schedule-job-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { HumanEmployeeRepository } from "../repositories/human-employee-repository";
import { RunRecordRepository } from "../repositories/run-record-repository";
import { SkillInstallationRepository } from "../repositories/skill-installation-repository";
import { IntegrationConnectionRepository } from "../repositories/integration-connection-repository";
import { DigitalEmployeeChannelRuntime } from "./channel-runtime";
import { getDingTalkRuntimeConfig } from "./dingtalk-config";
import { loadPlatformRuntimeState } from "./openclaw-runtime";

type PlatformContext = {
  homeDir: string;
  workspaceDir: string;
  db: Knex;
  departmentRepo: DepartmentRepository;
  employeeRepo: EmployeeRepository;
  humanEmployeeRepo: HumanEmployeeRepository;
  employeeSkillRepo: EmployeeSkillRepository;
  employeeScheduleRepo: EmployeeScheduleRepository;
  employeeScheduleJobRepo: EmployeeScheduleJobRepository;
  runRepo: RunRecordRepository;
  skillInstallationRepo: SkillInstallationRepository;
  integrationConnectionRepo: IntegrationConnectionRepository;
  gateway: NextclawEngineGateway;
  skillInstallService: SkillInstallService;
  employeeRunService: EmployeeRunService;
  automationService: AutomationService;
  channelRuntime: DigitalEmployeeChannelRuntime;
};

let contextPromise: Promise<PlatformContext> | null = null;

function resolvePlatformHomeDir(): string {
  return resolve(process.env.NEXTCLAW_DIGITAL_EMPLOYEE_HOME ?? join(process.cwd(), ".nextclaw-digital-employee"));
}

type RuntimeEnv = Record<string, string | undefined>;

function inferProviderName(model: string, explicitProviderName?: string): string {
  const direct = explicitProviderName?.trim();
  if (direct) {
    return direct;
  }
  const [prefix] = model.split("/", 1);
  return prefix?.trim() || "openai";
}

function resolveProviderApiKey(providerName: string, env: RuntimeEnv): string {
  const direct = env.NEXTCLAW_PROVIDER_API_KEY?.trim();
  if (direct) {
    return direct;
  }
  const spec = findBuiltinProviderByName(providerName);
  if (spec?.envKey) {
    return env[spec.envKey]?.trim() ?? "";
  }
  return "";
}

export function buildPlatformGatewayConfig(env: RuntimeEnv = process.env): {
  agents: { defaults: { model: string } };
  providers: Record<string, { apiKey: string; apiBase: string | null }>;
} {
  const model = env.NEXTCLAW_MODEL?.trim() || "openai/gpt-5";
  const providerName = inferProviderName(model, env.NEXTCLAW_PROVIDER_NAME);
  return {
    agents: {
      defaults: {
        model
      }
    },
    providers: {
      [providerName]: {
        apiKey: resolveProviderApiKey(providerName, env),
        apiBase: env.NEXTCLAW_PROVIDER_API_BASE?.trim() || null
      }
    }
  };
}

export async function getPlatformContext(): Promise<PlatformContext> {
  if (!contextPromise) {
    contextPromise = (async () => {
      const homeDir = resolvePlatformHomeDir();
      const workspaceDir = join(homeDir, "workspace");
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });
      const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
      await ensurePlatformDatabase(db);
      const integrationConnectionRepo = new IntegrationConnectionRepository(db);
      const initialRuntimeState = loadPlatformRuntimeState({
        workspaceDir,
        overrideConfig: buildPlatformGatewayConfig(),
        runtimeConfig: await getDingTalkRuntimeConfig(integrationConnectionRepo)
      });
      const bus = new MessageBus();
      const sessionManager = new SessionManager(workspaceDir);
      const gateway = new NextclawEngineGateway({
        homeDir,
        workspaceDir,
        bus,
        sessionManager,
        config: initialRuntimeState.config,
        extensionRegistry: initialRuntimeState.extensionRegistry,
        defaultConfig: buildPlatformGatewayConfig()
      });
      const departmentRepo = new DepartmentRepository(db);
      const employeeRepo = new EmployeeRepository(db);
      const humanEmployeeRepo = new HumanEmployeeRepository(db);
      const employeeSkillRepo = new EmployeeSkillRepository(db);
      const employeeScheduleRepo = new EmployeeScheduleRepository(db);
      const employeeScheduleJobRepo = new EmployeeScheduleJobRepository(db);
      const runRepo = new RunRecordRepository(db);
      const skillInstallationRepo = new SkillInstallationRepository(db);
      const skillInstallService = new SkillInstallService(skillInstallationRepo, gateway);
      const employeeRunService = new EmployeeRunService(employeeRepo, employeeSkillRepo, runRepo, gateway);
      const channelRuntime = new DigitalEmployeeChannelRuntime({
        gateway,
        employeeRepo,
        employeeSkillRepo,
        loadState: async () =>
          loadPlatformRuntimeState({
            workspaceDir,
            overrideConfig: buildPlatformGatewayConfig(),
            runtimeConfig: await getDingTalkRuntimeConfig(integrationConnectionRepo)
          })
      });
      const automationService = new AutomationService(
        employeeScheduleRepo,
        employeeScheduleJobRepo,
        employeeRepo,
        employeeRunService,
        new CronService(join(homeDir, "cron", "jobs.json")),
        gateway
      );
      await channelRuntime.start();
      await automationService.start();
      return {
        homeDir,
        workspaceDir,
        db,
        departmentRepo,
        employeeRepo,
        humanEmployeeRepo,
        employeeSkillRepo,
        employeeScheduleRepo,
        employeeScheduleJobRepo,
        runRepo,
        skillInstallationRepo,
        integrationConnectionRepo,
        gateway,
        skillInstallService,
        employeeRunService,
        automationService,
        channelRuntime
      };
    })();
  }
  return contextPromise;
}

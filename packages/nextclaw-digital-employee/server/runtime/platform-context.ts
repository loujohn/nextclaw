import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Knex } from "knex";
import { createLogger } from "../utils/logger";

const logger = createLogger("platform-context");
import { CronService, MessageBus, SessionManager } from "@nextclaw/core";
import { findBuiltinProviderByName } from "@nextclaw/runtime";
import { createPlatformKnex, ensureDmSchema, resolveDbConfigFromEnv } from "../db/knex";
import { bundledMigrationSource } from "../db/migration-source";
import { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { AutomationService } from "../services/automation-service";
import { EmployeeHealthService } from "../services/employee-health-service";
import { EmployeeLifecycleService } from "../services/employee-lifecycle-service";
import { EmployeeRunService } from "../services/employee-run-service";
import { SkillInstallService } from "../services/skill-install-service";
import { DepartmentRepository } from "../repositories/department-repository";
import { EmployeeRepository } from "../repositories/employee-repository";
import { EmployeeScheduleRepository } from "../repositories/employee-schedule-repository";
import { EmployeeScheduleJobRepository } from "../repositories/employee-schedule-job-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { HumanEmployeeRepository } from "../repositories/human-employee-repository";
import { RunRecordRepository } from "../repositories/run-record-repository";
import { ChatSessionRepository } from "../repositories/chat-session-repository";
import { ChatMessageRepository } from "../repositories/chat-message-repository";
import { SkillInstallationRepository } from "../repositories/skill-installation-repository";
import { IntegrationConnectionRepository } from "../repositories/integration-connection-repository";
import { SecretsRepository } from "../repositories/secrets-repository";
import { UserRepository } from "../repositories/user-repository";
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
  chatSessionRepo: ChatSessionRepository;
  chatMessageRepo: ChatMessageRepository;
  skillInstallationRepo: SkillInstallationRepository;
  integrationConnectionRepo: IntegrationConnectionRepository;
  secretsRepo: SecretsRepository;
  userRepo: UserRepository;
  gateway: NextclawEngineGateway;
  skillInstallService: SkillInstallService;
  employeeRunService: EmployeeRunService;
  automationService: AutomationService;
  lifecycleService: EmployeeLifecycleService;
  healthService: EmployeeHealthService;
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
      const homePkg = join(homeDir, "package.json");
      if (!existsSync(homePkg)) {
        writeFileSync(homePkg, '{ "private": true, "type": "commonjs" }\n', "utf-8");
      }
      const dbConfig = resolveDbConfigFromEnv();
      const db = createPlatformKnex(dbConfig);
      await ensureDmSchema(db);
      await db.migrate.latest({ migrationSource: bundledMigrationSource });
      const integrationConnectionRepo = new IntegrationConnectionRepository(db);
      const initialRuntimeState = loadPlatformRuntimeState({
        workspaceDir,
        overrideConfig: buildPlatformGatewayConfig(),
        runtimeConfig: await getDingTalkRuntimeConfig(integrationConnectionRepo)
      });
      const bus = new MessageBus();
      const sessionManager = new SessionManager(workspaceDir);
      const cronService = new CronService(join(homeDir, "cron", "jobs.json"));
      const secretsRepo = new SecretsRepository(db, homeDir);
      const userRepo = new UserRepository(db);
      const gateway = new NextclawEngineGateway({
        homeDir,
        workspaceDir,
        bus,
        sessionManager,
        cronService,
        config: initialRuntimeState.config,
        extensionRegistry: initialRuntimeState.extensionRegistry,
        defaultConfig: buildPlatformGatewayConfig(),
        secretsRepo
      });
      const departmentRepo = new DepartmentRepository(db);
      const employeeRepo = new EmployeeRepository(db);
      const humanEmployeeRepo = new HumanEmployeeRepository(db);
      const employeeSkillRepo = new EmployeeSkillRepository(db);
      const employeeScheduleRepo = new EmployeeScheduleRepository(db);
      const employeeScheduleJobRepo = new EmployeeScheduleJobRepository(db);
      const runRepo = new RunRecordRepository(db);
      const chatSessionRepo = new ChatSessionRepository(db);
      const chatMessageRepo = new ChatMessageRepository(db);
      const skillInstallationRepo = new SkillInstallationRepository(db);
      const skillInstallService = new SkillInstallService(skillInstallationRepo, gateway);
      const employeeRunService = new EmployeeRunService(
        employeeRepo,
        employeeSkillRepo,
        runRepo,
        gateway,
        skillInstallationRepo,
        chatSessionRepo,
        chatMessageRepo
      );
      const channelRuntime = new DigitalEmployeeChannelRuntime({
        gateway,
        employeeRepo,
        employeeSkillRepo,
        skillInstallationRepo,
        runRepo,
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
        cronService,
        gateway
      );
      // 当 Agent 通过对话创建定时任务时，同步写入数据库以便 UI 显示。
      // 达梦可能出现锁等待——保留单次重试作为防御。
      cronService.onJobAdded = (job) => {
        if (!job.agentId) return;
        const agentCode = job.agentId;
        const syncToDb = async (isRetry = false): Promise<void> => {
          try {
            const employee = await employeeRepo.getByCode(agentCode);
            if (!employee) return;
            const schedule = job.schedule;
            const scheduleKind = schedule.kind === "every" ? "every" as const : "cron" as const;
            const cronExpr = schedule.kind === "cron" ? (schedule.expr ?? null) : null;
            const everyMs = schedule.kind === "every" ? (schedule.everyMs ?? null) : null;
            await employeeScheduleJobRepo.create({
              employeeId: employee.id,
              name: job.name,
              description: `通过对话创建 (${job.id})`,
              scheduleKind,
              cronExpr,
              everyMs,
              taskPrompt: job.payload.message,
              enabled: job.enabled,
              runtimeJobId: job.id
            });
          } catch (err) {
            if (!isRetry) {
              logger.warn(`定时任务 "${job.name}" (${job.id}) 同步失败，500ms 后重试`);
              await new Promise((r) => setTimeout(r, 500));
              return syncToDb(true);
            }
            logger.error(`定时任务 "${job.name}" (${job.id}) 同步数据库失败:`, err);
          }
        };
        void syncToDb();
      };
      const healthService = new EmployeeHealthService(runRepo, gateway);
      const lifecycleService = new EmployeeLifecycleService(
        employeeRepo,
        employeeSkillRepo,
        automationService,
        gateway
      );
      // Recover stuck "running" runs from before this server session.
      // Without this, employees whose last run was in-flight during a crash/restart
      // would show "离线" forever (finishedAt stays null).
      const recoveredRuns = await runRepo.recoverRunningRuns();
      if (recoveredRuns > 0) {
        logger.info(`Recovered ${recoveredRuns} interrupted run(s) from previous session`);
      }
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
        chatSessionRepo,
        chatMessageRepo,
        skillInstallationRepo,
        integrationConnectionRepo,
        secretsRepo,
        userRepo,
        gateway,
        skillInstallService,
        employeeRunService,
        automationService,
        lifecycleService,
        healthService,
        channelRuntime
      };
    })();
  }
  return contextPromise;
}

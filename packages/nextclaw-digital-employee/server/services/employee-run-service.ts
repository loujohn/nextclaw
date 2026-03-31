import { EmployeeRepository } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { SkillInstallationRepository } from "../repositories/skill-installation-repository";
import { RunRecordRepository } from "../repositories/run-record-repository";
import { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { buildChatResultCards, type ChatMessageView, type ChatResultCardView } from "../../shared/ui-models";
import { prepareEmployeeRuntime } from "./employee-runtime-preparation";
import { ConfigError, classifyError } from "../errors/platform-errors";
import { RunStatus } from "../db/enums";

export type EmployeeTurnResult = {
  runId: string;
  reply: string;
  sessionKey: string;
  messages: ChatMessageView[];
  resultCards: ChatResultCardView[];
  runSummary: string;
};

export class EmployeeRunService {
  constructor(
    private readonly employeeRepo: EmployeeRepository,
    private readonly employeeSkillRepo: EmployeeSkillRepository,
    private readonly runRepo: RunRecordRepository,
    private readonly gateway: NextclawEngineGateway,
    private readonly skillInstallationRepo?: SkillInstallationRepository
  ) {}

  async runEmployeeTurn(params: {
    employeeId: string;
    message: string;
    triggerType: string;
    triggerSource: string;
  }): Promise<EmployeeTurnResult> {
    const employee = await this.employeeRepo.getById(params.employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${params.employeeId}`);
    }

    // Pre-check: model API key must be configured (skip if method not available, e.g. in tests)
    if (typeof this.gateway.hasConfiguredProvider === "function" && !this.gateway.hasConfiguredProvider()) {
      throw new ConfigError(
        "未配置模型 API Key",
        "请在「系统设置 → 模型提供商」中配置 API Key 后再执行。"
      );
    }

    const { workspace, skillNames } = await prepareEmployeeRuntime({
      employee,
      employeeSkillRepo: this.employeeSkillRepo,
      skillInstallationRepo: this.skillInstallationRepo,
      homeDir: this.gateway.homeDir,
      workspaceDir: this.gateway.workspaceDir
    });

    const run = await this.runRepo.create({
      employeeId: employee.id,
      triggerType: params.triggerType,
      triggerSource: params.triggerSource
    });

    try {
      const result = await this.gateway.runEmployeeTurn({
        employeeId: employee.id,
        agentId: employee.code,
        workspace,
        message: params.message,
        model: employee.model || undefined,
        requestedSkills: skillNames.length > 0 ? skillNames : undefined
      });
      const messages = this.gateway.getSessionHistory(result.sessionKey);
      const resultCards = buildChatResultCards(result.reply);
      await this.runRepo.appendEvents(
        run.id,
        result.events.map((event) => ({
          eventType: event.type,
          payload: event.data
        }))
      );
      await this.runRepo.complete(run.id, {
        status: RunStatus.Completed,
        summary: result.reply,
        result: {
          reply: result.reply,
          sessionKey: result.sessionKey,
          messages,
          resultCards,
          runSummary: result.reply
        }
      });
      return {
        runId: run.id,
        reply: result.reply,
        sessionKey: result.sessionKey,
        messages,
        resultCards,
        runSummary: result.reply
      };
    } catch (error) {
      const classified = classifyError(error);
      await this.runRepo.complete(run.id, {
        status: RunStatus.Failed,
        summary: String(error),
        result: {
          error: classified.toJSON()
        }
      });
      throw classified;
    }
  }
}

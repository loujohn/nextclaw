import { EmployeeRepository } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { RunRecordRepository } from "../repositories/run-record-repository";
import { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { ensureEmployeeWorkspace, syncEmployeeSkills } from "../engine/employee-workspace";
import { buildChatResultCards, type ChatMessageView, type ChatResultCardView } from "../../shared/ui-models";

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
    private readonly gateway: NextclawEngineGateway
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

    const employeeSkills = await this.employeeSkillRepo.listByEmployeeId(employee.id);
    const skillNames = employeeSkills.filter((s) => s.enabled).map((s) => s.skillName);

    const workspace = ensureEmployeeWorkspace(
      this.gateway.homeDir,
      {
        code: employee.code,
        name: employee.name,
        description: employee.description,
        systemPrompt: employee.systemPrompt
      },
      this.gateway.workspaceDir
    );

    if (skillNames.length > 0) {
      syncEmployeeSkills(this.gateway.homeDir, employee.code, skillNames, this.gateway.workspaceDir);
    }

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
        status: "completed",
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
      await this.runRepo.complete(run.id, {
        status: "failed",
        summary: String(error),
        result: {
          error: String(error)
        }
      });
      throw error;
    }
  }
}

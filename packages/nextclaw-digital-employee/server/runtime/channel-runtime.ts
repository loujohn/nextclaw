import {
  AgentRouteResolver,
  ChannelManager,
  type Config,
  type ExtensionRegistry,
  type InboundMessage
} from "@nextclaw/core";
import {
  setPluginRuntimeBridge,
  startPluginChannelGateways,
  stopPluginChannelGateways,
  type PluginChannelGatewayHandle,
  type PluginRegistry
} from "@nextclaw/openclaw-compat";
import { NextclawEngineGateway } from "../engine/NextclawEngineGateway";
import { EmployeeRepository } from "../repositories/employee-repository";
import { EmployeeSkillRepository } from "../repositories/employee-skill-repository";
import { SkillInstallationRepository } from "../repositories/skill-installation-repository";
import { RunRecordRepository } from "../repositories/run-record-repository";
import { RunStatus } from "../db/enums";
import { prepareEmployeeRuntime } from "../services/employee-runtime-preparation";
import { createLogger } from "../utils/logger";

const log = createLogger("ChannelRuntime");

export type DigitalEmployeeChannelRuntimeState = {
  config: Config;
  extensionRegistry: ExtensionRegistry;
  pluginRegistry: PluginRegistry;
};

type RuntimeStateLoader = () => Promise<DigitalEmployeeChannelRuntimeState> | DigitalEmployeeChannelRuntimeState;

function isShutdownMessage(message: InboundMessage): boolean {
  return message.channel === "__digital_employee_runtime__" && message.metadata.__shutdown__ === true;
}

export class DigitalEmployeeChannelRuntime {
  private readonly routeResolver: AgentRouteResolver;
  private channelManager: ChannelManager | null = null;
  private pluginGatewayHandles: PluginChannelGatewayHandle[] = [];
  private running = false;
  private worker: Promise<void> | null = null;

  constructor(
    private readonly options: {
      gateway: NextclawEngineGateway;
      employeeRepo: EmployeeRepository;
      employeeSkillRepo: EmployeeSkillRepository;
      skillInstallationRepo?: SkillInstallationRepository;
      runRepo?: RunRecordRepository;
      loadState: RuntimeStateLoader;
    }
  ) {
    this.routeResolver = new AgentRouteResolver(options.gateway.runtimeConfig);
  }

  private get gateway(): NextclawEngineGateway {
    return this.options.gateway;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    await this.reload();
    this.running = true;
    this.worker = this.runLoop();
  }

  async reload(): Promise<void> {
    const state = await this.options.loadState();
    this.routeResolver.updateConfig(state.config);
    this.gateway.applyRuntimeConfig(state.config, state.extensionRegistry);

    await this.stopChannels();

    setPluginRuntimeBridge({
      loadConfig: () => this.gateway.runtimeConfig as unknown as Record<string, unknown>
    });

    this.channelManager = new ChannelManager(
      state.config,
      this.gateway.messageBus,
      this.gateway.sessions,
      state.extensionRegistry.channels
    );
    await this.channelManager.startAll();
    const started = await startPluginChannelGateways({
      registry: state.pluginRegistry,
      logger: log
    });
    this.pluginGatewayHandles = started.handles;
  }

  async stop(): Promise<void> {
    if (!this.running) {
      await this.stopChannels();
      setPluginRuntimeBridge(null);
      return;
    }
    this.running = false;
    await this.gateway.messageBus.publishInbound({
      channel: "__digital_employee_runtime__",
      senderId: "system",
      chatId: "shutdown",
      content: "",
      timestamp: new Date(),
      attachments: [],
      metadata: {
        __shutdown__: true
      }
    });
    await this.worker;
    this.worker = null;
    await this.stopChannels();
    setPluginRuntimeBridge(null);
  }

  private async stopChannels(): Promise<void> {
    await stopPluginChannelGateways(this.pluginGatewayHandles);
    this.pluginGatewayHandles = [];
    if (this.channelManager) {
      await this.channelManager.stopAll();
      this.channelManager = null;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      const message = await this.gateway.messageBus.consumeInbound();
      if (isShutdownMessage(message)) {
        continue;
      }
      log.info(`inbound channel=${message.channel} sender=${message.senderId} chat=${message.chatId} contentLen=${message.content.length}`);
      try {
        await this.handleInbound(message);
      } catch (error) {
        log.error(`handleInbound error channel=${message.channel} sender=${message.senderId} chat=${message.chatId}`, error);
        await this.gateway.messageBus.publishOutbound({
          channel: message.channel,
          chatId: message.chatId,
          content: `Sorry, I encountered an error: ${String(error)}`,
          media: [],
          metadata: message.metadata ?? {}
        });
      }
    }
  }

  private async handleInbound(message: InboundMessage): Promise<void> {
    const route = this.routeResolver.resolveInbound({ message });
    if (route.matchedBy === "default") {
      log.warn(`no binding channel=${message.channel} account=${route.accountId} ${route.peer.kind}:${route.peer.id}`);
      throw new Error(
        `No employee binding configured for ${message.channel} account ${route.accountId} ${route.peer.kind}:${route.peer.id}`
      );
    }
    log.info(`route matched agentId=${route.agentId} account=${route.accountId} session=${route.sessionKey} matchedBy=${route.matchedBy}`);
    const employee = await this.options.employeeRepo.getByCode(route.agentId);
    if (!employee) {
      log.warn(`employee not found agentId=${route.agentId}`);
      throw new Error(`Bound employee not found for agentId: ${route.agentId}`);
    }
    log.info(`dispatching to employee code=${employee.code} name=${employee.name} session=${route.sessionKey}`);

    const { workspace } = await prepareEmployeeRuntime({
      employee,
      employeeSkillRepo: this.options.employeeSkillRepo,
      skillInstallationRepo: this.options.skillInstallationRepo,
      homeDir: this.gateway.homeDir,
      workspaceDir: this.gateway.workspaceDir
    });

    const runRepo = this.options.runRepo;
    const run = runRepo
      ? await runRepo.create({
          employeeId: employee.id,
          triggerType: "channel",
          triggerSource: `${message.channel}:${route.accountId}`
        })
      : null;

    try {
      const engine = await this.gateway.getOrCreateEngineWithSecrets({
        agentId: employee.code,
        employeeId: employee.id,
        workspace,
        model: employee.model || undefined
      });
      const response = await engine.handleInbound({
        message,
        sessionKey: route.sessionKey,
        publishResponse: true
      });
      if (run && runRepo) {
        await runRepo.complete(run.id, {
          status: RunStatus.Completed,
          summary: response?.content?.slice(0, 500) || message.content.slice(0, 200),
          result: { channel: message.channel, sessionKey: route.sessionKey }
        });
      }
    } catch (error) {
      if (run && runRepo) {
        await runRepo.complete(run.id, {
          status: RunStatus.Failed,
          summary: String(error).slice(0, 500),
          result: { error: String(error), channel: message.channel }
        });
      }
      throw error;
    }
    log.info(`handleInbound done agentId=${route.agentId} session=${route.sessionKey}`);
  }
}

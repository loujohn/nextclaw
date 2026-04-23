import {
  AgentRouteResolver,
  ChannelManager,
  CommandRegistry,
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
import { buildChatResultCards } from "../../shared/ui-models";
import { createLogger } from "../utils/logger";
import { IdentityResolver } from "../services/identity-resolver";
import { isConversationResetCommand } from "../../shared/chat-command";

const log = createLogger("ChannelRuntime");
const RESET_COMMAND_REPLY = "好的，我们重新开始。接下来想聊什么？";

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
      identityResolver?: IdentityResolver;
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
      const preview = message.content.slice(0, 60).replace(/\n/g, " ");
      log.info(`收到消息 渠道=${message.channel} 发送者=${message.senderId} 会话=${message.chatId} 长度=${message.content.length} 预览="${preview}"`);
      try {
        await this.handleInbound(message);
      } catch (error) {
        log.error(`处理消息失败 渠道=${message.channel} 发送者=${message.senderId} 会话=${message.chatId}`, error);
        await this.gateway.messageBus.publishOutbound({
          channel: message.channel,
          chatId: message.chatId,
          content: `处理消息时遇到错误：${String(error)}`,
          media: [],
          metadata: message.metadata ?? {}
        });
      }
    }
  }

  private async handleInbound(message: InboundMessage): Promise<void> {
    // employee internal channel: route directly by chatId (employee code)
    // Errors are caught here to prevent runLoop from trying to publish an error
    // response to the non-existent "employee" outbound channel adapter.
    if (message.channel === "employee") {
      try {
        await this.handleEmployeeInbound(message);
      } catch (error) {
        log.error(`employee inbox 处理失败 code=${message.chatId}`, error);
      }
      return;
    }
    const meta = message.metadata ?? {};
    const route = this.routeResolver.resolveInbound({
      message,
      forcedAgentId: meta.target_agent_id as string | undefined,
      sessionKeyOverride: meta.session_key_override as string | undefined,
    });
    if (route.matchedBy === "default") {
      log.warn(`未找到绑定 渠道=${message.channel} 账号=${route.accountId} ${route.peer.kind}:${route.peer.id}`);
      throw new Error(
        `未配置员工绑定：渠道 ${message.channel} 账号 ${route.accountId} ${route.peer.kind}:${route.peer.id}`
      );
    }
    log.info(`路由匹配 员工=${route.agentId} 账号=${route.accountId} 会话=${route.sessionKey} 匹配方式=${route.matchedBy}`);
    const employee = await this.options.employeeRepo.getByCode(route.agentId);
    if (!employee) {
      log.warn(`员工未找到 agentId=${route.agentId}`);
      throw new Error(`绑定的员工不存在：agentId=${route.agentId}`);
    }
    log.info(`分派给员工 code=${employee.code} name=${employee.name} 会话=${route.sessionKey}`);

    if (await this.tryHandleConversationCommand(message, route.sessionKey)) {
      return;
    }

    if (this.options.identityResolver && meta.is_group === true && meta.conversation_title && meta.conversation_id) {
      this.options.identityResolver.registerGroup(
        String(meta.conversation_id),
        String(meta.conversation_title),
        String(meta.account_id || meta.accountId || "")
      ).catch((err) => log.warn("registerGroup failed", err));
    }

    const messageWithSender = await this.enrichWithSenderIdentity(message);

    const { workspace, skillNames } = await prepareEmployeeRuntime({
      employee,
      employeeSkillRepo: this.options.employeeSkillRepo,
      skillInstallationRepo: this.options.skillInstallationRepo,
      homeDir: this.gateway.homeDir,
      workspaceDir: this.gateway.workspaceDir
    });

    const enrichedMessage: InboundMessage = skillNames.length > 0
      ? { ...messageWithSender, metadata: { ...messageWithSender.metadata, requested_skills: skillNames } }
      : messageWithSender;

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
        message: enrichedMessage,
        sessionKey: route.sessionKey,
        publishResponse: true
      });
      if (run && runRepo) {
        const reply = response?.content ?? "";
        const messages = this.gateway.getSessionHistory(route.sessionKey);
        const resultCards = buildChatResultCards(reply);
        await runRepo.complete(run.id, {
          status: RunStatus.Completed,
          summary: reply.slice(0, 500) || message.content.slice(0, 200),
          result: {
            reply,
            channel: message.channel,
            sessionKey: route.sessionKey,
            messages,
            resultCards,
            runSummary: reply
          }
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
    log.info(`处理完成 员工=${route.agentId} 会话=${route.sessionKey}`);
  }

  private async handleEmployeeInbound(message: InboundMessage): Promise<void> {
    const targetCode = message.chatId;
    const employee = await this.options.employeeRepo.getByCode(targetCode);
    if (!employee) {
      log.warn(`employee inbox: 目标员工不存在 code=${targetCode}`);
      return;
    }

    // inbox session key: agent:{code}:employee:direct:{code}
    // Matches buildSessionKey per-channel-peer format (5 segments)
    const sessionKey = `agent:${employee.code}:employee:direct:${employee.code}`;
    log.info(`employee inbox 分派 code=${employee.code} session=${sessionKey}`);

    const { workspace, skillNames } = await prepareEmployeeRuntime({
      employee,
      employeeSkillRepo: this.options.employeeSkillRepo,
      skillInstallationRepo: this.options.skillInstallationRepo,
      homeDir: this.gateway.homeDir,
      workspaceDir: this.gateway.workspaceDir
    });

    const enrichedMessage: InboundMessage = skillNames.length > 0
      ? { ...message, metadata: { ...message.metadata, requested_skills: skillNames } }
      : message;

    const engine = await this.gateway.getOrCreateEngineWithSecrets({
      agentId: employee.code,
      employeeId: employee.id,
      workspace,
      model: employee.model || undefined
    });

    // publishResponse: false — fire-and-forget semantics
    // Employee B responds via its own bound channels (e.g. DingTalk), not back to A
    // Note: RunRecord is intentionally omitted for inbox messages — B's response
    // (if any) is dispatched asynchronously through B's own channels.
    await engine.handleInbound({
      message: enrichedMessage,
      sessionKey,
      publishResponse: false
    });
  }

  private async tryHandleConversationCommand(message: InboundMessage, sessionKey: string): Promise<boolean> {
    if (!isConversationResetCommand(message.content)) {
      return false;
    }
    const registry = new CommandRegistry(this.gateway.runtimeConfig, this.gateway.sessions);
    const result = await registry.executeText(message.content, {
      channel: message.channel,
      chatId: message.chatId,
      senderId: message.senderId,
      sessionKey
    });
    if (!result) {
      return false;
    }
    await this.gateway.messageBus.publishOutbound({
      channel: message.channel,
      chatId: message.chatId,
      content: RESET_COMMAND_REPLY,
      media: [],
      metadata: message.metadata ?? {}
    });
    return true;
  }

  private async enrichWithSenderIdentity(message: InboundMessage): Promise<InboundMessage> {
    if (!this.options.identityResolver) return message;
    if (message.channel === "system" || message.channel === "employee" || message.channel === "ui") return message;
    try {
      const identity = await this.options.identityResolver.resolve(message.senderId);
      const senderPrefix = IdentityResolver.buildSenderPrefix(
        identity,
        message.senderId,
        String(message.metadata.sender_name || "")
      );
      return { ...message, content: `${senderPrefix}\n${message.content}` };
    } catch (err) {
      log.warn(`发送者身份解析失败 senderId=${message.senderId}`, err);
      return message;
    }
  }
}

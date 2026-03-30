import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  CronService,
  LLMProvider,
  MessageBus,
  NativeAgentEngine,
  ProviderManager,
  SessionManager,
  SkillsLoader,
  type AgentEngine,
  type AgentEngineFactoryContext,
  type Config,
  type ExtensionRegistry,
  type SkillInfo,
  type SessionEvent,
  HeartbeatService
} from "@nextclaw/core";
import { buildPlatformRuntimeConfig } from "../runtime/openclaw-runtime";
import type { SecretsRepository } from "../repositories/secrets-repository";

export type NextclawEngineGatewayOptions = {
  homeDir: string;
  workspaceDir?: string;
  bus?: MessageBus;
  sessionManager?: SessionManager;
  cronService?: CronService | null;
  config?: Config;
  extensionRegistry?: ExtensionRegistry;
  defaultConfig?: Record<string, unknown>;
  secretsRepo?: SecretsRepository;
};

export type AvailableSkillView = {
  name: string;
  nameZh?: string;
  path: string;
  source: SkillInfo["source"];
  description?: string;
  category?: string;
};

export type ImportedSkillView = {
  skillName: string;
  installPath: string;
  sourceType: "local" | "git";
  sourceUri: string;
};

export type RunEmployeeTurnParams = {
  employeeId: string;
  agentId?: string;
  sessionKey?: string;
  message: string;
  workspace?: string;
  model?: string;
  requestedSkills?: string[];
};

export type RunEmployeeTurnResult = {
  sessionKey: string;
  reply: string;
  events: SessionEvent[];
};

// 工具调用的简化视图（供前端展示）
export type ToolCallView = {
  id: string;
  name: string;
  arguments: string;
};

// 会话消息视图，包含可选的工具调用和推理过程
export type SessionHistoryMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: string;
  toolCalls?: ToolCallView[];
  reasoning?: string;
  toolCallId?: string;
  toolName?: string;
};

function parseSkillName(skillFilePath: string): string {
  const raw = readFileSync(skillFilePath, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return basename(resolve(skillFilePath, ".."));
  }
  const metadataBlock = match[1] ?? "";
  for (const line of metadataBlock.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key?.trim() === "name") {
      const value = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
      if (value) {
        return value;
      }
    }
  }
  return basename(resolve(skillFilePath, ".."));
}

function findSkillDirectory(rootDir: string): string {
  const candidates = [resolve(rootDir)];
  while (candidates.length > 0) {
    const current = candidates.shift();
    if (!current) {
      continue;
    }
    const skillFile = join(current, "SKILL.md");
    if (existsSync(skillFile)) {
      return current;
    }
    if (!existsSync(current)) {
      continue;
    }
    for (const entry of ["skills"]) {
      const nested = join(current, entry);
      if (existsSync(nested)) {
        candidates.push(nested);
      }
    }
    try {
      for (const child of readdirSync(current, { withFileTypes: true })) {
        if (child.isDirectory()) {
          candidates.push(join(current, child.name));
        }
      }
    } catch {
      continue;
    }
  }
  throw new Error(`No SKILL.md found under ${rootDir}`);
}

// Synced from packages/nextclaw/src/cli/commands/plugins.ts (toExtensionRegistry)
// Synced from packages/nextclaw/src/cli/workspace.ts (WorkspaceManager.resolveBuiltinSkillsDir + seedBuiltinSkills)
function resolveBuiltinSkillsDir(): string | null {
  const candidates = [
    resolve(process.cwd(), "packages/nextclaw-core/dist/skills"),
    resolve(process.cwd(), "../nextclaw-core/dist/skills"),
    resolve(process.cwd(), "dist/skills")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function seedBuiltinSkills(workspaceDir: string): Set<string> {
  const builtinNames = new Set<string>();
  const builtinSkillsDir = resolveBuiltinSkillsDir();
  if (!builtinSkillsDir) {
    return builtinNames;
  }
  const workspaceSkillsDir = join(workspaceDir, "skills");
  mkdirSync(workspaceSkillsDir, { recursive: true });
  for (const entry of readdirSync(builtinSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    builtinNames.add(entry.name);
    const sourceDir = join(builtinSkillsDir, entry.name);
    const targetDir = join(workspaceSkillsDir, entry.name);
    cpSync(sourceDir, targetDir, { recursive: true, force: true });
  }
  return builtinNames;
}

// Synced from packages/nextclaw/src/cli/missing-provider.ts
class MissingProvider extends LLMProvider {
  constructor(private readonly defaultModel: string) {
    super(null, null);
  }

  async chat(): Promise<never> {
    throw new Error("No API key configured yet. Configure provider credentials in the platform and retry.");
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }
}

export class NextclawEngineGateway {
  readonly homeDir: string;
  readonly workspaceDir: string;
  private config: Config;
  private readonly bus: MessageBus;
  private readonly sessionManager: SessionManager;
  private readonly providerManager: ProviderManager;
  private extensionRegistry: ExtensionRegistry;
  private readonly cronService: CronService | null;
  private readonly engines: Map<string, AgentEngine> = new Map();
  private fallbackEngine: AgentEngine;
  private readonly heartbeats: Map<string, HeartbeatService> = new Map();
  private readonly builtinSkillNames: Set<string>;
  private readonly secretsRepo?: SecretsRepository;

  constructor(options: NextclawEngineGatewayOptions) {
    this.homeDir = resolve(options.homeDir);
    this.workspaceDir = resolve(options.workspaceDir ?? join(this.homeDir, "workspace"));
    process.env.NEXTCLAW_HOME = this.homeDir;
    mkdirSync(this.homeDir, { recursive: true });
    mkdirSync(this.workspaceDir, { recursive: true });
    this.builtinSkillNames = seedBuiltinSkills(this.workspaceDir);
    this.bus = options.bus ?? new MessageBus();
    this.sessionManager = options.sessionManager ?? new SessionManager(this.workspaceDir);
    this.cronService = options.cronService ?? null;
    this.config =
      options.config ??
      buildPlatformRuntimeConfig({
        workspaceDir: this.workspaceDir,
        overrideConfig: options.defaultConfig
      });
    this.providerManager = new ProviderManager({
      defaultProvider: new MissingProvider(this.config.agents.defaults.model),
      config: this.config
    });
    this.extensionRegistry = options.extensionRegistry ?? { tools: [], channels: [], diagnostics: [], engines: [] };
    this.secretsRepo = options.secretsRepo;
    this.fallbackEngine = this.createEngineForWorkspace("main", this.workspaceDir);
  }

  private createEngineForWorkspace(agentId: string, workspace: string, model?: string, envOverlay?: Record<string, string>): AgentEngine {
    const globalSkillsDir = join(this.workspaceDir, "skills");
    const engineContext: AgentEngineFactoryContext = {
      agentId,
      workspace,
      model: model || this.config.agents.defaults.model,
      maxIterations: this.config.agents.defaults.maxToolIterations,
      contextTokens: this.config.agents.defaults.contextTokens,
      engineConfig: this.config.agents.defaults.engineConfig,
      bus: this.bus,
      providerManager: this.providerManager,
      sessionManager: this.sessionManager,
      cronService: this.cronService,
      restrictToWorkspace: this.config.tools.restrictToWorkspace,
      searchConfig: this.config.search,
      execConfig: this.config.tools.exec,
      contextConfig: this.config.agents.context,
      config: this.config,
      extensionRegistry: this.extensionRegistry,
      additionalSkillsDirs: workspace !== this.workspaceDir ? [globalSkillsDir] : undefined,
      envOverlay
    };
    return this.createEngine(engineContext);
  }

  get messageBus(): MessageBus {
    return this.bus;
  }

  get sessions(): SessionManager {
    return this.sessionManager;
  }

  get runtimeConfig(): Config {
    return this.config;
  }

  applyRuntimeConfig(config: Config, extensionRegistry?: ExtensionRegistry): void {
    this.config = config;
    if (extensionRegistry) {
      this.extensionRegistry = extensionRegistry;
    }
    this.providerManager.setConfig(config);
    this.fallbackEngine.applyRuntimeConfig(config, this.extensionRegistry);
    for (const engine of this.engines.values()) {
      engine.applyRuntimeConfig(config, this.extensionRegistry);
    }
  }

  getOrCreateEngine(agentId: string, workspace?: string, model?: string): AgentEngine {
    if (!workspace) return this.fallbackEngine;
    const cacheKey = model ? `${agentId}:${model}` : agentId;
    const cached = this.engines.get(cacheKey);
    if (cached) return cached;
    const engine = this.createEngineForWorkspace(agentId, workspace, model);
    this.engines.set(cacheKey, engine);
    return engine;
  }

  private createEngine(context: AgentEngineFactoryContext): AgentEngine {
    const engineKind = this.config.agents.defaults.engine?.trim().toLowerCase() || "native";
    if (engineKind === "native") {
      return new NativeAgentEngine(context);
    }
    const customFactory = context.extensionRegistry?.engines.find(
      (entry) => entry.kind.trim().toLowerCase() === engineKind
    )?.factory;
    if (customFactory) {
      return customFactory(context);
    }
    throw new Error(`engine "${engineKind}" is not available`);
  }

  startHeartbeat(
    agentId: string,
    workspace: string,
    intervalS?: number,
    onTurnResult?: (reply: string) => void
  ): void {
    this.stopHeartbeat(agentId);
    const hb = new HeartbeatService(
      workspace,
      async (prompt) => {
        const result = await this.runEmployeeTurn({
          employeeId: agentId,
          agentId,
          workspace,
          message: prompt,
          sessionKey: `employee:${agentId}:heartbeat`
        });
        onTurnResult?.(result.reply);
        return result.reply;
      },
      intervalS,
      true
    );
    this.heartbeats.set(agentId, hb);
    void hb.start();
  }

  stopHeartbeat(agentId: string): void {
    const existing = this.heartbeats.get(agentId);
    if (existing) {
      existing.stop();
      this.heartbeats.delete(agentId);
    }
  }

  stopAllHeartbeats(): void {
    for (const [id, hb] of this.heartbeats) {
      hb.stop();
      this.heartbeats.delete(id);
    }
  }

  async listAvailableSkills(): Promise<AvailableSkillView[]> {
    const loader = new SkillsLoader(this.workspaceDir);
    return loader.listSkills(false).map((skill: SkillInfo) => {
      const metadata = loader.getSkillMetadata?.(skill.name);
      const description = typeof metadata?.description === "string" && metadata.description.trim()
        ? metadata.description.trim()
        : undefined;
      const nameZh =
        (typeof metadata?.name_zh === "string" && metadata.name_zh.trim()
          ? metadata.name_zh.trim()
          : undefined) ??
        (typeof metadata?.nameZh === "string" && metadata.nameZh.trim()
          ? metadata.nameZh.trim()
          : undefined);
      const category =
        typeof metadata?.category === "string" && metadata.category.trim()
          ? metadata.category.trim()
          : undefined;
      return {
        name: skill.name,
        path: skill.path,
        source: skill.source,
        ...(description ? { description } : {}),
        ...(nameZh ? { nameZh } : {}),
        ...(category ? { category } : {})
      };
    });
  }

  async importFromLocalPath(sourcePath: string): Promise<ImportedSkillView> {
    const skillDir = findSkillDirectory(sourcePath);
    const skillName = parseSkillName(join(skillDir, "SKILL.md"));
    if (this.builtinSkillNames.has(skillName)) {
      throw new Error(`Cannot import skill "${skillName}" — conflicts with built-in skill`);
    }
    const installPath = join(this.workspaceDir, "skills", skillName);
    rmSync(installPath, { recursive: true, force: true });
    mkdirSync(join(this.workspaceDir, "skills"), { recursive: true });
    cpSync(skillDir, installPath, { recursive: true });
    return {
      skillName,
      installPath,
      sourceType: "local",
      sourceUri: resolve(sourcePath)
    };
  }

  async importFromGit(sourceUri: string): Promise<ImportedSkillView> {
    const cloneRoot = mkdtempSync(join(tmpdir(), "nextclaw-digital-employee-git-clone-"));
    try {
      execFileSync("git", ["clone", "--depth", "1", sourceUri, cloneRoot], {
        stdio: "ignore"
      });
      const imported = await this.importFromLocalPath(cloneRoot);
      return {
        ...imported,
        sourceType: "git",
        sourceUri
      };
    } finally {
      rmSync(cloneRoot, { recursive: true, force: true });
    }
  }

  async runEmployeeTurn(params: RunEmployeeTurnParams): Promise<RunEmployeeTurnResult> {
    const events: SessionEvent[] = [];
    const sessionKey = params.sessionKey ?? `employee:${params.employeeId}:ui:direct:web`;
    const agentId = params.agentId ?? "main";

    let envOverlay: Record<string, string> | undefined;
    if (this.secretsRepo) {
      const secrets = await this.secretsRepo.getDecryptedForScope(params.employeeId);
      if (secrets.size > 0) {
        envOverlay = Object.fromEntries(secrets);
      }
    }

    const engine = envOverlay
      ? this.createEngineForWorkspace(agentId, params.workspace ?? this.workspaceDir, params.model, envOverlay)
      : this.getOrCreateEngine(agentId, params.workspace, params.model);
    const session = this.sessionManager.getOrCreate(sessionKey);
    const historyCountBefore = this.sessionManager.getHistory(session).length;
    const metadata: Record<string, unknown> = {};
    if (agentId) metadata.agentId = agentId;
    if (params.requestedSkills?.length) metadata.requested_skills = params.requestedSkills;
    const modelName = params.model || this.config.agents.defaults.model || "unknown";
    const t0 = Date.now();
    console.log(`[model-access] START employee=${params.employeeId} model=${modelName} session=${sessionKey} msgLen=${params.message.length}`);
    let reply: string;
    try {
      reply = await engine.processDirect({
        content: params.message,
        sessionKey,
        channel: "ui",
        chatId: params.employeeId,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        onSessionEvent: (event) => {
          events.push(event);
        }
      });
    } catch (err) {
      console.error(`[model-access] ERROR employee=${params.employeeId} model=${modelName} session=${sessionKey} elapsed=${Date.now() - t0}ms`, err);
      throw err;
    }
    console.log(`[model-access] END employee=${params.employeeId} model=${modelName} session=${sessionKey} elapsed=${Date.now() - t0}ms replyLen=${reply.length} events=${events.length}`);
    const historyCountAfter = this.sessionManager.getHistory(session).length;
    if (historyCountAfter === historyCountBefore) {
      this.sessionManager.addMessage(session, "user", params.message);
      this.sessionManager.addMessage(session, "assistant", reply);
    }
    return { sessionKey, reply, events };
  }

  // 获取会话历史，包含工具调用和推理过程等元数据
  getSessionHistory(sessionKey: string): SessionHistoryMessage[] {
    const session = this.sessionManager.getIfExists(sessionKey);
    if (!session) {
      return [];
    }
    const maxMessages = 50;
    const recent = session.messages.length > maxMessages
      ? session.messages.slice(-maxMessages)
      : session.messages;
    return recent
      .map((message) => {
        const role = String(message.role ?? "");
        const content = typeof message.content === "string" ? message.content : "";
        const timestamp = typeof message.timestamp === "string" ? message.timestamp : undefined;

        if (role === "user" || role === "system") {
          return { role, content, timestamp } satisfies SessionHistoryMessage;
        }

        if (role === "assistant") {
          const result: SessionHistoryMessage = { role, content, timestamp };
          const rawToolCalls = message.tool_calls;
          if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
            result.toolCalls = rawToolCalls
              .filter((tc): tc is Record<string, unknown> => tc && typeof tc === "object")
              .map((tc) => ({
                id: String(tc.id ?? ""),
                name: String((tc.function as Record<string, unknown>)?.name ?? tc.name ?? ""),
                arguments: typeof (tc.function as Record<string, unknown>)?.arguments === "string"
                  ? String((tc.function as Record<string, unknown>).arguments)
                  : JSON.stringify(tc.arguments ?? {})
              }));
          }
          const reasoning = message.reasoning_content;
          if (typeof reasoning === "string" && reasoning.trim()) {
            result.reasoning = reasoning;
          }
          return result;
        }

        if (role === "tool") {
          return {
            role: "tool" as const,
            content,
            timestamp,
            toolCallId: typeof message.tool_call_id === "string" ? message.tool_call_id : undefined,
            toolName: typeof message.name === "string" ? message.name : undefined
          } satisfies SessionHistoryMessage;
        }

        return null;
      })
      .filter((message): message is SessionHistoryMessage => Boolean(message));
  }
}

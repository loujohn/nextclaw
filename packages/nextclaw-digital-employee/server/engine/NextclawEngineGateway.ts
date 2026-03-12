import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  ConfigSchema,
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
  type SessionEvent
} from "@nextclaw/core";
import { builtinProviderIds } from "@nextclaw/runtime";
import { loadOpenClawPlugins, type PluginRegistry } from "@nextclaw/openclaw-compat";

export type NextclawEngineGatewayOptions = {
  homeDir: string;
  workspaceDir?: string;
  extensionRegistry?: ExtensionRegistry;
  defaultConfig?: Record<string, unknown>;
};

export type AvailableSkillView = {
  name: string;
  path: string;
  source: SkillInfo["source"];
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
};

export type RunEmployeeTurnResult = {
  sessionKey: string;
  reply: string;
  events: SessionEvent[];
};

export type SessionHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
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

function toExtensionRegistry(config: Config, workspaceDir: string): ExtensionRegistry {
  const pluginRegistry: PluginRegistry = loadOpenClawPlugins({
    config,
    workspaceDir,
    reservedToolNames: [
      "read_file",
      "write_file",
      "edit_file",
      "list_dir",
      "exec",
      "web_search",
      "web_fetch",
      "message",
      "spawn",
      "sessions_list",
      "sessions_history",
      "sessions_send",
      "memory_search",
      "memory_get",
      "subagents",
      "gateway",
      "cron"
    ],
    reservedChannelIds: [],
    reservedProviderIds: builtinProviderIds(),
    reservedEngineKinds: ["native"],
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    }
  });
  return {
    tools: pluginRegistry.tools.map((tool) => ({
      extensionId: tool.pluginId,
      factory: tool.factory,
      names: tool.names,
      optional: tool.optional,
      source: tool.source
    })),
    channels: pluginRegistry.channels.map((channel) => ({
      extensionId: channel.pluginId,
      channel: channel.channel,
      source: channel.source
    })),
    engines: pluginRegistry.engines.map((engine) => ({
      extensionId: engine.pluginId,
      kind: engine.kind,
      factory: engine.factory,
      source: engine.source
    })),
    diagnostics: pluginRegistry.diagnostics.map((diag) => ({
      level: diag.level,
      message: diag.message,
      extensionId: diag.pluginId,
      source: diag.source
    }))
  };
}

function createConfig(workspaceDir: string, override?: Record<string, unknown>): Config {
  const base = {
    agents: {
      defaults: {
        workspace: workspaceDir,
        engine: "native",
        model: "openai/gpt-5"
      }
    }
  };
  const merged = {
    ...base,
    ...(override ?? {}),
    agents: {
      ...base.agents,
      ...((override?.agents as Record<string, unknown> | undefined) ?? {}),
      defaults: {
        ...base.agents.defaults,
        ...(((override?.agents as { defaults?: Record<string, unknown> } | undefined)?.defaults) ?? {})
      }
    }
  };
  return ConfigSchema.parse(merged);
}

function resolveBuiltinSkillsDir(): string | null {
  const candidates = [
    resolve(process.cwd(), "packages/nextclaw-core/dist/skills"),
    resolve(process.cwd(), "../nextclaw-core/dist/skills"),
    resolve(process.cwd(), "dist/skills")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function seedBuiltinSkills(workspaceDir: string): void {
  const builtinSkillsDir = resolveBuiltinSkillsDir();
  if (!builtinSkillsDir) {
    return;
  }
  const workspaceSkillsDir = join(workspaceDir, "skills");
  mkdirSync(workspaceSkillsDir, { recursive: true });
  for (const entry of readdirSync(builtinSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sourceDir = join(builtinSkillsDir, entry.name);
    const targetDir = join(workspaceSkillsDir, entry.name);
    if (existsSync(join(targetDir, "SKILL.md"))) {
      continue;
    }
    cpSync(sourceDir, targetDir, { recursive: true });
  }
}

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
  private readonly config: Config;
  private readonly sessionManager: SessionManager;
  private readonly engine: AgentEngine;

  constructor(options: NextclawEngineGatewayOptions) {
    this.homeDir = resolve(options.homeDir);
    this.workspaceDir = resolve(options.workspaceDir ?? join(this.homeDir, "workspace"));
    process.env.NEXTCLAW_HOME = this.homeDir;
    mkdirSync(this.homeDir, { recursive: true });
    mkdirSync(this.workspaceDir, { recursive: true });
    seedBuiltinSkills(this.workspaceDir);
    this.config = createConfig(this.workspaceDir, options.defaultConfig);
    this.sessionManager = new SessionManager(this.workspaceDir);
    const providerManager = new ProviderManager({
      defaultProvider: new MissingProvider(this.config.agents.defaults.model),
      config: this.config
    });
    const extensionRegistry = options.extensionRegistry ?? toExtensionRegistry(this.config, this.workspaceDir);
    const engineContext: AgentEngineFactoryContext = {
      agentId: "main",
      workspace: this.workspaceDir,
      model: this.config.agents.defaults.model,
      maxIterations: this.config.agents.defaults.maxToolIterations,
      contextTokens: this.config.agents.defaults.contextTokens,
      engineConfig: this.config.agents.defaults.engineConfig,
      bus: new MessageBus(),
      providerManager,
      sessionManager: this.sessionManager,
      cronService: null,
      restrictToWorkspace: this.config.tools.restrictToWorkspace,
      searchConfig: this.config.search,
      execConfig: this.config.tools.exec,
      contextConfig: this.config.agents.context,
      config: this.config,
      extensionRegistry
    };
    this.engine = this.createEngine(engineContext);
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

  async listAvailableSkills(): Promise<AvailableSkillView[]> {
    const loader = new SkillsLoader(this.workspaceDir);
    return loader.listSkills(false).map((skill: SkillInfo) => ({
      name: skill.name,
      path: skill.path,
      source: skill.source
    }));
  }

  async importFromLocalPath(sourcePath: string): Promise<ImportedSkillView> {
    const skillDir = findSkillDirectory(sourcePath);
    const skillName = parseSkillName(join(skillDir, "SKILL.md"));
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
    const session = this.sessionManager.getOrCreate(sessionKey);
    const historyCountBefore = this.sessionManager.getHistory(session).length;
    const reply = await this.engine.processDirect({
      content: params.message,
      sessionKey,
      channel: "ui",
      chatId: params.employeeId,
      metadata: params.agentId ? { agentId: params.agentId } : undefined,
      onSessionEvent: (event) => {
        events.push(event);
      }
    });
    const historyCountAfter = this.sessionManager.getHistory(session).length;
    if (historyCountAfter === historyCountBefore) {
      this.sessionManager.addMessage(session, "user", params.message);
      this.sessionManager.addMessage(session, "assistant", reply);
    }
    return {
      sessionKey,
      reply,
      events
    };
  }

  getSessionHistory(sessionKey: string): SessionHistoryMessage[] {
    const session = this.sessionManager.getIfExists(sessionKey);
    if (!session) {
      return [];
    }
    return this.sessionManager
      .getHistory(session)
      .map((message) => {
        const role = message.role;
        const content = message.content;
        if ((role === "user" || role === "assistant" || role === "system") && typeof content === "string") {
          return {
            role,
            content
          };
        }
        return null;
      })
      .filter((message): message is SessionHistoryMessage => Boolean(message));
  }
}

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createLogger } from "../utils/logger";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
import type { ChatProcessTimelineEntry } from "../../shared/ui-models";
import { buildPlatformRuntimeConfig } from "../runtime/openclaw-runtime";
import { normalizeChatMessageContent } from "../chat/chat-message-normalization";
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
  version: string;
};

export type RunEmployeeTurnParams = {
  employeeId: string;
  agentId?: string;
  sessionKey?: string;
  message: string;
  workspace?: string;
  model?: string;
  requestedSkills?: string[];
  /** 定时任务执行时传 true，防止 AI 在执行期间调用 cron 工具重复创建任务 */
  disableCronTool?: boolean;
  abortSignal?: AbortSignal;
  onAssistantDelta?: (delta: string) => void;
  onSessionEvent?: (event: SessionEvent) => void;
};

export type RunEmployeeTurnResult = {
  sessionKey: string;
  reply: string;
  events: SessionEvent[];
  newMessages: SessionHistoryMessage[];
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
  processTimeline?: ChatProcessTimelineEntry[];
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

/**
 * 读取 SKILL.md 中的 version 字段；若不存在则自动写入默认版本并返回该默认值。
 */
function ensureSkillVersion(skillFilePath: string, defaultVersion = "1.0.0"): string {
  const raw = readFileSync(skillFilePath, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (match) {
    const metadataBlock = match[1] ?? "";
    for (const line of metadataBlock.split("\n")) {
      const [key, ...rest] = line.split(":");
      if (key?.trim() === "version") {
        const value = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
        if (value) return value;
      }
    }
    // version 字段缺失，自动注入
    const updated = raw.replace(
      /^---\n([\s\S]*?)\n---/,
      `---\n${metadataBlock}\nversion: ${defaultVersion}\n---`
    );
    writeFileSync(skillFilePath, updated, "utf-8");
  }
  return defaultVersion;
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
    rmSync(targetDir, { recursive: true, force: true });
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

const gatewayLog = createLogger("EngineGateway");

/** Sentinel agentId used only by `fallbackEngine` (see below). The fallback
 * engine is never stored in `this.engines`, so this value does not collide in
 * the cacheKey space; the sentinel only surfaces inside the fallback engine's
 * `AgentLoop.agentId`. Still kept as a `__…__` string so that if anyone adds
 * logic that *does* compare it against `employee.code` later, a sanity check
 * at the repository layer (`EmployeeRepository.create`) can reject codes
 * matching `/^__.*__$/`. */
const FALLBACK_AGENT_ID = "__fallback__";

/** Excluded skills for platform runtime mode.
 * Platform employees manage themselves via UI + schedule tool, not the CLI
 * self-management flow; cron is replaced by the structured `schedule` tool.
 *
 * Exposed as a frozen readonly set rather than a list so the Gateway can
 * pass the same instance to every `AgentEngineFactoryContext` — avoiding a
 * per-invocation `new Set(...)` allocation. Contained values must never be
 * mutated; ContextBuilder defensively copies if it needs a mutable view. */
const PLATFORM_EXCLUDED_SKILLS: ReadonlySet<string> = Object.freeze(
  new Set<string>(["nextclaw-self-manage", "cron"])
);

/** Stable content digest for a record of env var overrides, used solely as
 * part of the engine cache key so that rotating a secret produces a new entry.
 *
 * NOTE: this is NOT a security primitive. We only need collision resistance
 * within a single process's engine cache (<= engineCacheMax entries), so a
 * 48-bit sha1 prefix is plenty. Do not reuse this for tokens, signing, or
 * anywhere an attacker could exploit collisions. */
function hashEnvOverlay(overlay?: Record<string, string>): string {
  if (!overlay) return "";
  const keys = Object.keys(overlay).sort();
  if (keys.length === 0) return "";
  const hash = createHash("sha1");
  for (const key of keys) {
    hash.update(key);
    hash.update("=");
    hash.update(overlay[key] ?? "");
    hash.update("\n");
  }
  return hash.digest("hex").slice(0, 12);
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
  /** LRU-capped engine cache. Map iteration order is insertion order in JS,
   * so we treat the first entry as the least-recently-used and the last as
   * the most-recently-used. See `getOrCreateEngineCached` for eviction logic.
   * Unbounded growth previously allowed one engine per employee × model ×
   * envHash × cron-mode — a stale secret rotation or per-turn model switch
   * would leak one instance each time. */
  private readonly engines: Map<string, AgentEngine> = new Map();
  /** Upper bound on `engines.size`. Overridable via `NEXTCLAW_ENGINE_CACHE_MAX`
   * env var (parsed once at construction). Default sized for ~100 concurrent
   * employees with a couple of variants each; measured engine footprint is
   * small so this ceiling is intentionally generous. */
  private readonly engineCacheMax: number;
  /** Bootstrap-time fallback engine. Returned by `getOrCreateEngine` when the
   * caller does not supply a workspace (e.g. early startup paths or tests).
   * NOT stored in `this.engines`, so it never participates in LRU eviction
   * and its sentinel agentId cannot collide with per-employee cache keys. */
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
    // PLATFORM_USAGE.md is seeded by the Nitro plugin
    // `server/plugins/seed-platform-usage.ts` so construction stays free of
    // extra I/O. The plugin consumes `getPlatformContext().workspaceDir`,
    // which resolves to the same directory computed above.
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
    this.engineCacheMax = this.resolveEngineCacheMax();
    this.fallbackEngine = this.createEngineForWorkspace(FALLBACK_AGENT_ID, this.workspaceDir);
  }

  private resolveEngineCacheMax(): number {
    const raw = process.env.NEXTCLAW_ENGINE_CACHE_MAX?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 128;
  }

  private createEngineForWorkspace(
    agentId: string,
    workspace: string,
    model?: string,
    envOverlay?: Record<string, string>,
    cronServiceOverride?: CronService | null
  ): AgentEngine {
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
      cronService: cronServiceOverride !== undefined ? cronServiceOverride : this.cronService,
      restrictToWorkspace: this.config.tools.restrictToWorkspace,
      searchConfig: this.config.search,
      execConfig: this.config.tools.exec,
      contextConfig: this.config.agents.context,
      config: this.config,
      extensionRegistry: this.extensionRegistry,
      runtimeMode: "platform",
      // Share the frozen module-level set across all engines; ContextBuilder
      // and AgentLoop both type `excludeSkills` as `ReadonlySet<string>` and
      // never mutate it, so no defensive clone is required here.
      excludeSkills: PLATFORM_EXCLUDED_SKILLS,
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

  /**
   * Returns false only when providers are explicitly configured with empty apiKey.
   * When providers config is absent/empty (e.g. test environments), returns true
   * to avoid blocking — production always has providers via buildPlatformGatewayConfig.
   */
  hasConfiguredProvider(): boolean {
    const providers = this.config.providers;
    if (!providers || typeof providers !== "object") return true;
    const entries = Object.values(providers);
    if (entries.length === 0) return true;
    return entries.some(
      (p: unknown) => {
        const provider = p as { apiKey?: string } | undefined;
        return typeof provider?.apiKey === "string" && provider.apiKey.trim().length > 0;
      }
    );
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
    return this.getOrCreateEngineCached({ agentId, workspace, model });
  }

  /** Unified engine cache. Key components:
   *   agentId | workspace | model | envHash | cronMode
   * An unchanged envOverlay (content-hashed) reuses the cached engine, so the
   * envOverlay-backed code path no longer rebuilds the engine on every turn.
   * A rotated secret produces a new hash and a new cache entry; the stale
   * entry is eligible for GC once no longer referenced. */
  private getOrCreateEngineCached(params: {
    agentId: string;
    workspace: string;
    model?: string;
    envOverlay?: Record<string, string>;
    disableCronTool?: boolean;
  }): AgentEngine {
    const envHash = hashEnvOverlay(params.envOverlay);
    const workspaceKey = params.workspace === this.workspaceDir ? "default" : params.workspace;
    const cacheKey = [
      params.agentId,
      workspaceKey,
      params.model || "default",
      envHash || "no-env",
      params.disableCronTool ? "no-cron" : "cron"
    ].join("|");
    const cached = this.engines.get(cacheKey);
    if (cached) {
      // LRU touch: delete + re-insert moves the entry to the tail (most
      // recently used). Cheap because Map preserves insertion order.
      this.engines.delete(cacheKey);
      this.engines.set(cacheKey, cached);
      return cached;
    }
    const engine = this.createEngineForWorkspace(
      params.agentId,
      params.workspace,
      params.model,
      params.envOverlay,
      params.disableCronTool ? null : undefined
    );
    // Evict least-recently-used entries until we're under the cap. Usually
    // this runs at most once per insertion, but the loop handles concurrent
    // inserts racing past the limit.
    while (this.engines.size >= this.engineCacheMax) {
      const oldestKey = this.engines.keys().next().value;
      if (oldestKey === undefined) break;
      const evicted = this.engines.get(oldestKey);
      this.engines.delete(oldestKey);
      // Best-effort cleanup for engines that carry external subscriptions.
      // The default `NativeAgentEngine` currently has nothing to release, but
      // exposing an optional dispose() hook lets future engine variants
      // participate without leaking listeners when they fall out of the LRU.
      const disposeFn = (evicted as { dispose?: () => void | Promise<void> } | undefined)?.dispose;
      if (typeof disposeFn === "function") {
        try {
          const result = disposeFn.call(evicted);
          if (result && typeof (result as Promise<void>).then === "function") {
            void (result as Promise<void>).catch((err) =>
              gatewayLog.warn(`engine dispose() failed during LRU eviction key=${oldestKey}`, err)
            );
          }
        } catch (err) {
          gatewayLog.warn(`engine dispose() threw during LRU eviction key=${oldestKey}`, err);
        }
      }
      gatewayLog.debug(`engine cache evicted LRU entry key=${oldestKey}`);
    }
    this.engines.set(cacheKey, engine);
    return engine;
  }

  async getOrCreateEngineWithSecrets(params: {
    agentId: string;
    employeeId: string;
    workspace?: string;
    model?: string;
    disableCronTool?: boolean;
  }): Promise<AgentEngine> {
    let envOverlay: Record<string, string> | undefined;
    if (this.secretsRepo) {
      const secrets = await this.secretsRepo.getDecryptedForScope(params.employeeId);
      if (secrets.size > 0) {
        envOverlay = Object.fromEntries(secrets);
      }
    }
    return this.getOrCreateEngineCached({
      agentId: params.agentId,
      workspace: params.workspace ?? this.workspaceDir,
      model: params.model,
      envOverlay,
      disableCronTool: params.disableCronTool
    });
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

  deleteSkill(skillName: string): void {
    const installPath = join(this.workspaceDir, "skills", skillName);
    rmSync(installPath, { recursive: true, force: true });
  }

  async importFromLocalPath(sourcePath: string): Promise<ImportedSkillView> {
    const skillDir = findSkillDirectory(sourcePath);
    const skillFilePath = join(skillDir, "SKILL.md");
    const skillName = parseSkillName(skillFilePath);
    if (this.builtinSkillNames.has(skillName)) {
      throw new Error(`Cannot import skill "${skillName}" — conflicts with built-in skill`);
    }
    const installPath = join(this.workspaceDir, "skills", skillName);
    rmSync(installPath, { recursive: true, force: true });
    mkdirSync(join(this.workspaceDir, "skills"), { recursive: true });
    cpSync(skillDir, installPath, { recursive: true });
    const version = ensureSkillVersion(join(installPath, "SKILL.md"));
    return {
      skillName,
      installPath,
      sourceType: "local",
      sourceUri: resolve(sourcePath),
      version
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

  private mapSessionMessage(message: Record<string, unknown>): SessionHistoryMessage | null {
    const role = String(message.role ?? "");
    const content = normalizeChatMessageContent(message.content);
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
  }

  private mapSessionHistory(messages: Array<Record<string, unknown>>): SessionHistoryMessage[] {
    return messages
      .map((message) => this.mapSessionMessage(message))
      .filter((message): message is SessionHistoryMessage => Boolean(message));
  }

  async runEmployeeTurn(params: RunEmployeeTurnParams): Promise<RunEmployeeTurnResult> {
    const events: SessionEvent[] = [];
    const sessionKey = params.sessionKey ?? `employee:${params.employeeId}:ui:direct:web`;
    const agentId = params.agentId ?? "main";

    const engine = await this.getOrCreateEngineWithSecrets({
      agentId,
      employeeId: params.employeeId,
      workspace: params.workspace,
      model: params.model,
      disableCronTool: params.disableCronTool
    });
    const session = this.sessionManager.getOrCreate(sessionKey);
    const historyCountBefore = this.sessionManager.getHistory(session).length;
    const metadata: Record<string, unknown> = {};
    if (agentId) metadata.agentId = agentId;
    if (params.requestedSkills?.length) metadata.requested_skills = params.requestedSkills;
    const modelName = params.model || this.config.agents.defaults.model || "unknown";
    const t0 = Date.now();
    gatewayLog.info(`START employee=${params.employeeId} model=${modelName} session=${sessionKey} msgLen=${params.message.length}`);
    let reply: string;
    try {
      reply = await engine.processDirect({
        content: params.message,
        sessionKey,
        channel: "ui",
        chatId: params.employeeId,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
        ...(params.onAssistantDelta ? { onAssistantDelta: params.onAssistantDelta } : {}),
        onSessionEvent: (event) => {
          events.push(event);
          params.onSessionEvent?.(event);
        }
      });
    } catch (err) {
      gatewayLog.error(`ERROR employee=${params.employeeId} model=${modelName} session=${sessionKey} elapsed=${Date.now() - t0}ms`, err);
      throw err;
    }
    gatewayLog.info(`END employee=${params.employeeId} model=${modelName} session=${sessionKey} elapsed=${Date.now() - t0}ms replyLen=${reply.length} events=${events.length}`);
    const historyCountAfter = this.sessionManager.getHistory(session).length;
    if (historyCountAfter === historyCountBefore) {
      this.sessionManager.addMessage(session, "user", params.message);
      this.sessionManager.addMessage(session, "assistant", reply);
    }
    const latestMessages = this.sessionManager.getHistory(session);
    const newMessages = latestMessages
      .slice(historyCountBefore)
      .map((message) => this.mapSessionMessage(message as unknown as Record<string, unknown>))
      .filter((message): message is SessionHistoryMessage => Boolean(message));
    return { sessionKey, reply, events, newMessages };
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
      .map((message) => this.mapSessionMessage(message as unknown as Record<string, unknown>))
      .filter((message): message is SessionHistoryMessage => Boolean(message));
  }
}

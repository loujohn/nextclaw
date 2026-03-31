import {
  ConfigSchema,
  type Config,
  type ExtensionRegistry
} from "@nextclaw/core";
import { builtinProviderIds } from "@nextclaw/runtime";
import { loadOpenClawPlugins, type PluginRegistry, type PluginLogger } from "@nextclaw/openclaw-compat";

type RuntimeConfigOptions = {
  workspaceDir: string;
  baseConfig?: Record<string, unknown>;
  overrideConfig?: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
};

type PlatformRuntimeState = {
  config: Config;
  extensionRegistry: ExtensionRegistry;
  pluginRegistry: PluginRegistry;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (override === undefined) {
    return base;
  }
  if (Array.isArray(base) || Array.isArray(override)) {
    return override;
  }
  if (isRecord(base) && isRecord(override)) {
    const output: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      output[key] = deepMerge(base[key], value);
    }
    return output;
  }
  return override;
}

export function buildPlatformRuntimeConfig(options: RuntimeConfigOptions): Config {
  const seed = {
    agents: {
      defaults: {
        workspace: options.workspaceDir,
        engine: "native",
        model: "openai/gpt-5"
      }
    }
  };
  const merged = deepMerge(
    deepMerge(
      deepMerge(seed, options.baseConfig ?? {}) as Record<string, unknown>,
      options.overrideConfig ?? {}
    ) as Record<string, unknown>,
    options.runtimeConfig ?? {}
  ) as Record<string, unknown>;
  return ConfigSchema.parse(merged);
}

export function toExtensionRegistry(pluginRegistry: PluginRegistry): ExtensionRegistry {
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

export function loadPlatformRuntimeState(params: {
  workspaceDir: string;
  baseConfig?: Record<string, unknown>;
  overrideConfig?: Record<string, unknown>;
  runtimeConfig?: Record<string, unknown>;
  logger?: PluginLogger;
}): PlatformRuntimeState {
  const config = buildPlatformRuntimeConfig({
    workspaceDir: params.workspaceDir,
    baseConfig: params.baseConfig,
    overrideConfig: params.overrideConfig,
    runtimeConfig: params.runtimeConfig
  });
  const pluginRegistry = loadOpenClawPlugins({
    config,
    workspaceDir: params.workspaceDir,
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
    logger: params.logger ?? {
      info: (msg: string, ...args: unknown[]) => console.info("[OpenClawPlugins]", msg, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn("[OpenClawPlugins]", msg, ...args),
      error: (msg: string, ...args: unknown[]) => console.error("[OpenClawPlugins]", msg, ...args),
      debug: (msg: string, ...args: unknown[]) => console.debug("[OpenClawPlugins]", msg, ...args)
    }
  });
  return {
    config,
    pluginRegistry,
    extensionRegistry: toExtensionRegistry(pluginRegistry)
  };
}

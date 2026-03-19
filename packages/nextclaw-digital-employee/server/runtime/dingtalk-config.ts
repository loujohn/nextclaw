import { homedir } from "node:os";
import { resolve } from "node:path";
import { ConfigSchema, isSensitiveConfigPath, loadConfig, saveConfig, type Config } from "@nextclaw/core";

const DEFAULT_NEXTCLAW_HOME_DIR = ".nextclaw";
const NEXTCLAW_CONFIG_FILE = "config.json";
const sharedNextclawHomeAtStartup = process.env.NEXTCLAW_HOME?.trim() || "";

export type DingTalkChannelView = {
  enabled: boolean;
  clientId: string;
  clientSecretSet: boolean;
  allowFrom: string[];
};

export type DingTalkChannelUpdate = {
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  allowFrom?: string[];
};

function normalizeAllowFrom(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const deduped = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      deduped.add(trimmed);
    }
  }
  return [...deduped];
}

function readDingTalkChannel(config: Config): DingTalkChannelView {
  const raw = (config.channels as Record<string, Record<string, unknown>>).dingtalk ?? {};
  const secret = typeof raw.clientSecret === "string" ? raw.clientSecret.trim() : "";
  return {
    enabled: Boolean(raw.enabled),
    clientId: typeof raw.clientId === "string" ? raw.clientId : "",
    clientSecretSet: secret.length > 0,
    allowFrom: normalizeAllowFrom(raw.allowFrom)
  };
}

function clearSensitiveRefs(config: Config, fieldNames: string[]): void {
  for (const fieldName of fieldNames) {
    const path = `channels.dingtalk.${fieldName}`;
    if (!isSensitiveConfigPath(path)) {
      continue;
    }
    if (config.secrets.refs[path]) {
      delete config.secrets.refs[path];
    }
  }
}

function resolveSharedConfigPath(): string {
  const homeDir = sharedNextclawHomeAtStartup || resolve(homedir(), DEFAULT_NEXTCLAW_HOME_DIR);
  return resolve(homeDir, NEXTCLAW_CONFIG_FILE);
}

export function getDingTalkChannelConfig(): DingTalkChannelView {
  const config = loadConfig(resolveSharedConfigPath());
  return readDingTalkChannel(config);
}

export function updateDingTalkChannelConfig(patch: DingTalkChannelUpdate): DingTalkChannelView {
  const configPath = resolveSharedConfigPath();
  const config = loadConfig(configPath);
  const channels = config.channels as Record<string, Record<string, unknown>>;
  const current = channels.dingtalk;
  if (!current) {
    throw new Error("unknown channel: dingtalk");
  }

  const nextChannel: Record<string, unknown> = { ...current };
  const touchedFields: string[] = [];

  if (Object.prototype.hasOwnProperty.call(patch, "enabled") && typeof patch.enabled === "boolean") {
    nextChannel.enabled = patch.enabled;
    touchedFields.push("enabled");
  }

  if (Object.prototype.hasOwnProperty.call(patch, "clientId") && typeof patch.clientId === "string") {
    nextChannel.clientId = patch.clientId.trim();
    touchedFields.push("clientId");
  }

  if (Object.prototype.hasOwnProperty.call(patch, "allowFrom") && Array.isArray(patch.allowFrom)) {
    nextChannel.allowFrom = normalizeAllowFrom(patch.allowFrom);
    touchedFields.push("allowFrom");
  }

  if (Object.prototype.hasOwnProperty.call(patch, "clientSecret") && typeof patch.clientSecret === "string") {
    const secret = patch.clientSecret.trim();
    if (secret.length > 0) {
      nextChannel.clientSecret = secret;
      touchedFields.push("clientSecret");
    }
  }

  clearSensitiveRefs(config, touchedFields);
  channels.dingtalk = nextChannel;

  const nextConfig = ConfigSchema.parse(config);
  saveConfig(nextConfig, configPath);
  return readDingTalkChannel(nextConfig);
}

import type { Config } from "@nextclaw/core";

export type DingTalkAccountRecord = NonNullable<Config["channels"]["dingtalk"]["accounts"][string]>;
export type RawRecord = Record<string, unknown>;
export type DingTalkDmPolicy = DingTalkAccountRecord["dmPolicy"];
export type DingTalkGroupPolicy = DingTalkAccountRecord["groupPolicy"];

export const DINGTALK_INTEGRATION_TYPE = "dingtalk";
export const DINGTALK_INTEGRATION_NAME = "DingTalk";

export type DingTalkAccountView = {
  accountId: string;
  clientId: string;
  clientSecretSet: boolean;
  robotCode: string;
  corpId: string;
  agentId: string;
  allowFrom: string[];
  dmPolicy: string;
  groupPolicy: string;
  groupAllowFrom: string[];
  requireMention: boolean;
  mentionPatterns: string[];
  groups: Record<string, { requireMention: boolean; mentionPatterns: string[] }>;
};

export type DingTalkChannelView = {
  enabled: boolean;
  defaultAccountId: string;
  accounts: DingTalkAccountView[];
};

export type DingTalkAccountUpdate = {
  sourceAccountId?: string;
  accountId: string;
  clientId?: string;
  clientSecret?: string;
  robotCode?: string;
  corpId?: string;
  agentId?: string;
  allowFrom?: string[];
  dmPolicy?: string;
  groupPolicy?: string;
  groupAllowFrom?: string[];
  requireMention?: boolean;
  mentionPatterns?: string[];
  groups?: Record<string, { requireMention?: boolean; mentionPatterns?: string[] }>;
};

export type DingTalkChannelUpdate = {
  enabled?: boolean;
  defaultAccountId?: string;
  upserts?: DingTalkAccountUpdate[];
  removeAccountIds?: string[];
};

export type DingTalkGroupBindingView = {
  groupId: string;
  employeeCode: string;
  accountId: string;
  allowCollaboration: boolean;
  allowedEmployeeCodes: string[];
};

export type DingTalkEmployeeBindingsView = {
  defaultByAccount: Record<string, string>;
  groups: DingTalkGroupBindingView[];
};

export type EmployeeDingTalkBindingView = {
  employeeCode: string;
  directAccountIds: string[];
  groupBindings: Array<{
    groupId: string;
    accountId: string;
    allowCollaboration: boolean;
    allowedEmployeeCodes: string[];
  }>;
};

export type EmployeeDingTalkBindingUpdate = {
  directAccountIds?: string[];
  groupBindings?: Array<{
    groupId: string;
    accountId?: string | null;
    allowCollaboration?: boolean;
    allowedEmployeeCodes?: string[];
  }>;
};

export function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = normalizeString(value);
    if (trimmed) {
      deduped.add(trimmed);
    }
  }
  return [...deduped];
}

export function normalizeGroups(
  value: unknown
): Record<string, { requireMention: boolean; mentionPatterns: string[] }> {
  if (!isRecord(value)) {
    return {};
  }
  const output: Record<string, { requireMention: boolean; mentionPatterns: string[] }> = {};
  for (const [groupId, rawRule] of Object.entries(value)) {
    if (!groupId.trim() || !isRecord(rawRule)) {
      continue;
    }
    output[groupId] = {
      requireMention: Boolean(rawRule.requireMention),
      mentionPatterns: normalizeStringList(rawRule.mentionPatterns)
    };
  }
  return output;
}

export function normalizeDmPolicy(value: unknown): DingTalkDmPolicy {
  const normalized = normalizeString(value);
  return normalized === "pairing" || normalized === "allowlist" || normalized === "disabled"
    ? normalized
    : "open";
}

export function normalizeGroupPolicy(value: unknown): DingTalkGroupPolicy {
  const normalized = normalizeString(value);
  return normalized === "allowlist" || normalized === "disabled" ? normalized : "open";
}

export function createLegacyAccount(raw: RawRecord): DingTalkAccountRecord | null {
  const clientId = normalizeString(raw.clientId);
  const clientSecret = normalizeString(raw.clientSecret);
  const robotCode = normalizeString(raw.robotCode);
  const corpId = normalizeString(raw.corpId);
  const agentId = normalizeString(raw.agentId);
  const allowFrom = normalizeStringList(raw.allowFrom);
  const dmPolicy = normalizeDmPolicy(raw.dmPolicy);
  const groupPolicy = normalizeGroupPolicy(raw.groupPolicy);
  const groupAllowFrom = normalizeStringList(raw.groupAllowFrom);
  const requireMention = Boolean(raw.requireMention);
  const mentionPatterns = normalizeStringList(raw.mentionPatterns);
  const groups = normalizeGroups(raw.groups);

  if (
    !clientId &&
    !clientSecret &&
    !robotCode &&
    !corpId &&
    !agentId &&
    allowFrom.length === 0 &&
    groupAllowFrom.length === 0 &&
    mentionPatterns.length === 0 &&
    Object.keys(groups).length === 0
  ) {
    return null;
  }

  return {
    clientId, clientSecret, robotCode, corpId, agentId,
    allowFrom, dmPolicy, groupPolicy, groupAllowFrom,
    requireMention, mentionPatterns, groups
  };
}

export function normalizeAccountRecord(raw: unknown): DingTalkAccountRecord | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    clientId: normalizeString(raw.clientId),
    clientSecret: normalizeString(raw.clientSecret),
    robotCode: normalizeString(raw.robotCode),
    corpId: normalizeString(raw.corpId),
    agentId: normalizeString(raw.agentId),
    allowFrom: normalizeStringList(raw.allowFrom),
    dmPolicy: normalizeDmPolicy(raw.dmPolicy),
    groupPolicy: normalizeGroupPolicy(raw.groupPolicy),
    groupAllowFrom: normalizeStringList(raw.groupAllowFrom),
    requireMention: Boolean(raw.requireMention),
    mentionPatterns: normalizeStringList(raw.mentionPatterns),
    groups: normalizeGroups(raw.groups)
  };
}

export function readNormalizedAccounts(
  rawChannel: RawRecord
): { defaultAccountId: string; accounts: Record<string, DingTalkAccountRecord> } {
  const rawAccounts = isRecord(rawChannel.accounts) ? rawChannel.accounts : {};
  const accounts: Record<string, DingTalkAccountRecord> = {};
  for (const [accountId, rawAccount] of Object.entries(rawAccounts)) {
    const normalized = normalizeAccountRecord(rawAccount);
    if (!normalized || !accountId.trim()) {
      continue;
    }
    accounts[accountId] = normalized;
  }

  if (Object.keys(accounts).length === 0) {
    const legacy = createLegacyAccount(rawChannel);
    if (legacy) {
      accounts.default = legacy;
    }
  }

  const requestedDefault = normalizeString(rawChannel.defaultAccountId) || "default";
  const defaultAccountId =
    accounts[requestedDefault] ? requestedDefault : Object.keys(accounts)[0] || requestedDefault;

  return { defaultAccountId, accounts };
}

export function toAccountView(accountId: string, account: DingTalkAccountRecord): DingTalkAccountView {
  return {
    accountId,
    clientId: account.clientId,
    clientSecretSet: account.clientSecret.trim().length > 0,
    robotCode: account.robotCode,
    corpId: account.corpId,
    agentId: account.agentId,
    allowFrom: [...(account.allowFrom ?? [])],
    dmPolicy: account.dmPolicy,
    groupPolicy: account.groupPolicy,
    groupAllowFrom: [...(account.groupAllowFrom ?? [])],
    requireMention: Boolean(account.requireMention),
    mentionPatterns: [...(account.mentionPatterns ?? [])],
    groups: account.groups ?? {}
  };
}

export function readDingTalkChannel(rawChannel: RawRecord | undefined): DingTalkChannelView {
  const current = rawChannel ?? {};
  const normalized = readNormalizedAccounts(current);
  return {
    enabled: Boolean(current.enabled),
    defaultAccountId: normalized.defaultAccountId,
    accounts: Object.entries(normalized.accounts).map(([id, account]) =>
      toAccountView(id, account)
    )
  };
}

export function isDingTalkBinding(binding: unknown): binding is Config["bindings"][number] {
  return (
    isRecord(binding) &&
    isRecord(binding.match) &&
    normalizeString(binding.match.channel) === "dingtalk" &&
    typeof binding.agentId === "string"
  );
}

export function parseAllowedEmployeeCodes(value: unknown): string[] {
  return normalizeStringList(value);
}

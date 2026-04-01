import type { Config } from "@nextclaw/core";
import { IntegrationConnectionRepository } from "../repositories/integration-connection-repository";

type DingTalkAccountRecord = NonNullable<Config["channels"]["dingtalk"]["accounts"][string]>;
type RawRecord = Record<string, unknown>;
type DingTalkDmPolicy = DingTalkAccountRecord["dmPolicy"];
type DingTalkGroupPolicy = DingTalkAccountRecord["groupPolicy"];
const DINGTALK_INTEGRATION_TYPE = "dingtalk";
const DINGTALK_INTEGRATION_NAME = "DingTalk";
const TEST_FALLBACK_ACCOUNT_ID = "account-86867";
const TEST_FALLBACK_CLIENT_ID = "dingrekgdqu4n1adu9vm";
const TEST_FALLBACK_CLIENT_SECRET = "v_HD-YQ5tgBl4SCXql-RYlpNdcqAWw-13knXh3AfCIvL4Q3AluCS2D5w-Uqi93sz";

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

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(values: unknown): string[] {
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

function normalizeGroups(
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

function normalizeDmPolicy(value: unknown): DingTalkDmPolicy {
  const normalized = normalizeString(value);
  return normalized === "pairing" || normalized === "allowlist" || normalized === "disabled"
    ? normalized
    : "open";
}

function normalizeGroupPolicy(value: unknown): DingTalkGroupPolicy {
  const normalized = normalizeString(value);
  return normalized === "allowlist" || normalized === "disabled" ? normalized : "open";
}

function createLegacyAccount(raw: RawRecord): DingTalkAccountRecord | null {
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
    clientId,
    clientSecret,
    robotCode,
    corpId,
    agentId,
    allowFrom,
    dmPolicy,
    groupPolicy,
    groupAllowFrom,
    requireMention,
    mentionPatterns,
    groups
  };
}

function normalizeAccountRecord(raw: unknown): DingTalkAccountRecord | null {
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

function readNormalizedAccounts(
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

  return {
    defaultAccountId,
    accounts
  };
}

function toAccountView(accountId: string, account: DingTalkAccountRecord): DingTalkAccountView {
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

function readDingTalkChannel(rawChannel: RawRecord | undefined): DingTalkChannelView {
  const current = rawChannel ?? {};
  const normalized = readNormalizedAccounts(current);

  return {
    enabled: Boolean(current.enabled),
    defaultAccountId: normalized.defaultAccountId,
    accounts: Object.entries(normalized.accounts).map(([accountId, account]) =>
      toAccountView(accountId, account)
    )
  };
}

function isDingTalkBinding(binding: unknown): binding is Config["bindings"][number] {
  return (
    isRecord(binding) &&
    isRecord(binding.match) &&
    normalizeString(binding.match.channel) === "dingtalk" &&
    typeof binding.agentId === "string"
  );
}

function parseAllowedEmployeeCodes(value: unknown): string[] {
  return normalizeStringList(value);
}

function buildDingTalkRoutingAccountRewrite(patch?: DingTalkChannelUpdate): {
  renamedAccountIds: Map<string, string>;
  removedAccountIds: Set<string>;
} {
  const renamedAccountIds = new Map<string, string>();
  const removedAccountIds = new Set<string>();

  for (const accountId of patch?.removeAccountIds ?? []) {
    const normalized = normalizeString(accountId);
    if (normalized) {
      removedAccountIds.add(normalized);
    }
  }

  for (const upsert of patch?.upserts ?? []) {
    const nextAccountId = normalizeString(upsert.accountId);
    const sourceAccountId = normalizeString(upsert.sourceAccountId);
    if (!nextAccountId || !sourceAccountId || nextAccountId === sourceAccountId) {
      continue;
    }
    renamedAccountIds.set(sourceAccountId, nextAccountId);
    removedAccountIds.delete(sourceAccountId);
  }

  return {
    renamedAccountIds,
    removedAccountIds
  };
}

function rewriteDingTalkAccountId(
  accountId: string | undefined,
  rewrite: ReturnType<typeof buildDingTalkRoutingAccountRewrite>
): string {
  const normalized = normalizeString(accountId);
  return rewrite.renamedAccountIds.get(normalized) ?? normalized;
}

function reconcileDingTalkRoutingAccounts(
  routing: DingTalkEmployeeBindingsView,
  patch?: DingTalkChannelUpdate
): DingTalkEmployeeBindingsView {
  const rewrite = buildDingTalkRoutingAccountRewrite(patch);
  if (rewrite.renamedAccountIds.size === 0 && rewrite.removedAccountIds.size === 0) {
    return {
      defaultByAccount: { ...routing.defaultByAccount },
      groups: routing.groups.map((group) => ({ ...group }))
    };
  }

  return {
    defaultByAccount: Object.fromEntries(
      Object.entries(routing.defaultByAccount)
        .map(
          ([accountId, employeeCode]): [string, string] => [
            rewrite.renamedAccountIds.get(accountId) ?? accountId,
            employeeCode
          ]
        )
        .filter(([accountId]) => !rewrite.removedAccountIds.has(accountId))
    ),
    groups: routing.groups
      .map((group) => ({
        ...group,
        accountId: rewrite.renamedAccountIds.get(group.accountId) ?? group.accountId
      }))
      .filter((group) => !rewrite.removedAccountIds.has(group.accountId))
  };
}

function areDingTalkBindingsEqual(
  left: DingTalkEmployeeBindingsView,
  right: DingTalkEmployeeBindingsView
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function readDingTalkEmployeeBindings(
  value: Pick<Config, "bindings"> | { bindings?: unknown[] }
): DingTalkEmployeeBindingsView {
  const output: DingTalkEmployeeBindingsView = {
    defaultByAccount: {},
    groups: []
  };
  for (const binding of value.bindings ?? []) {
    if (!isDingTalkBinding(binding)) {
      continue;
    }
    const accountId = normalizeString(binding.match.accountId) || "default";
    const peer = isRecord(binding.match.peer) ? binding.match.peer : undefined;
    if (!peer) {
      output.defaultByAccount[accountId] = binding.agentId;
      continue;
    }
    const peerKind = normalizeString(peer.kind);
    const peerId = normalizeString(peer.id);
    if (peerKind !== "group" || !peerId) {
      continue;
    }
    const metadata = isRecord((binding as RawRecord).metadata) ? ((binding as RawRecord).metadata as RawRecord) : {};
    output.groups.push({
      groupId: peerId,
      employeeCode: binding.agentId,
      accountId,
      allowCollaboration: metadata.allowCollaboration === true,
      allowedEmployeeCodes: parseAllowedEmployeeCodes(metadata.allowedEmployeeCodes)
    });
  }
  return output;
}

export function mergeDingTalkEmployeeBindings(
  value: Pick<Config, "bindings"> | { bindings?: unknown[] },
  nextView: DingTalkEmployeeBindingsView
): { bindings: Array<Record<string, unknown>> } {
  const preserved = (value.bindings ?? []).filter((binding) => !isDingTalkBinding(binding));
  const nextBindings: Array<Record<string, unknown>> = [...preserved.map((binding) => ({ ...(binding as RawRecord) }))];

  for (const [accountId, employeeCode] of Object.entries(nextView.defaultByAccount)) {
    if (!normalizeString(employeeCode)) {
      continue;
    }
    nextBindings.push({
      agentId: employeeCode,
      match: {
        channel: "dingtalk",
        accountId
      }
    });
  }

  for (const group of nextView.groups) {
    const groupId = normalizeString(group.groupId);
    if (!normalizeString(group.employeeCode)) {
      continue;
    }
    nextBindings.push({
      agentId: group.employeeCode,
      match: {
        channel: "dingtalk",
        accountId: normalizeString(group.accountId) || "default",
        peer: {
          kind: "group",
          id: groupId
        }
      },
      metadata: {
        allowCollaboration: group.allowCollaboration,
        allowedEmployeeCodes: parseAllowedEmployeeCodes(group.allowedEmployeeCodes)
      }
    });
  }

  return {
    bindings: nextBindings
  };
}

type StoredDingTalkConfig = {
  channel?: RawRecord;
  routing?: DingTalkEmployeeBindingsView;
};

function readStoredDingTalkConfig(value: unknown): {
  rawChannel: RawRecord;
  channel: DingTalkChannelView;
  routing: DingTalkEmployeeBindingsView;
} {
  const raw = isRecord(value) ? value : {};
  const rawChannel = isRecord(raw.channel) ? raw.channel : {};
  const rawRouting = isRecord(raw.routing) ? raw.routing : {};
  const rawGroups = Array.isArray(rawRouting.groups)
    ? rawRouting.groups
    : isRecord(rawRouting.groups)
      ? Object.entries(rawRouting.groups).map(([groupId, group]) =>
          isRecord(group) ? { groupId, ...group } : group
        )
      : [];
  return {
    rawChannel,
    channel: readDingTalkChannel(rawChannel),
    routing: isRecord(raw.routing)
      ? {
          defaultByAccount: isRecord(rawRouting.defaultByAccount)
            ? Object.fromEntries(
                Object.entries(rawRouting.defaultByAccount).map(([accountId, employeeCode]) => [
                  accountId,
                  normalizeString(employeeCode)
                ])
              )
            : {},
          groups: rawGroups
            .filter((group) => isRecord(group))
            .map((group) => ({
              groupId: normalizeString((group as RawRecord).groupId),
              employeeCode: normalizeString((group as RawRecord).employeeCode),
              accountId: normalizeString((group as RawRecord).accountId) || "default",
              allowCollaboration: (group as RawRecord).allowCollaboration === true,
              allowedEmployeeCodes: parseAllowedEmployeeCodes((group as RawRecord).allowedEmployeeCodes)
            }))
            .filter((group) => group.groupId)
        }
      : { defaultByAccount: {}, groups: [] }
  };
}

function toStoredDingTalkConfig(params: {
  channel: DingTalkChannelView;
  routing: DingTalkEmployeeBindingsView;
}): StoredDingTalkConfig {
  return {
    channel: {
      enabled: params.channel.enabled,
      defaultAccountId: params.channel.defaultAccountId,
      accounts: Object.fromEntries(
        params.channel.accounts.map((account) => [
          account.accountId,
          {
            clientId: account.clientId,
            clientSecret: "",
            robotCode: account.robotCode,
            corpId: account.corpId,
            agentId: account.agentId,
            allowFrom: account.allowFrom,
            dmPolicy: account.dmPolicy,
            groupPolicy: account.groupPolicy,
            groupAllowFrom: account.groupAllowFrom,
            requireMention: account.requireMention,
            mentionPatterns: account.mentionPatterns,
            groups: account.groups
          }
        ])
      )
    },
    routing: params.routing
  };
}

async function readDingTalkConfigRecord(repo: IntegrationConnectionRepository): Promise<{
  id?: string;
  rawChannel: RawRecord;
  channel: DingTalkChannelView;
  routing: DingTalkEmployeeBindingsView;
}> {
  const record = await repo.findByType(DINGTALK_INTEGRATION_TYPE);
  const parsed = readStoredDingTalkConfig(record?.config);
  return {
    id: record?.id,
    rawChannel: parsed.rawChannel,
    channel: parsed.channel,
    routing: parsed.routing
  };
}

async function saveDingTalkConfigRecord(
  repo: IntegrationConnectionRepository,
  params: {
    channel: DingTalkChannelView;
    routing: DingTalkEmployeeBindingsView;
  }
): Promise<void> {
  const existing = await repo.findByType(DINGTALK_INTEGRATION_TYPE);
  const stored = toStoredDingTalkConfig(params);
  if (existing) {
    const existingConfig = isRecord(existing.config) ? existing.config : {};
    const existingChannel = isRecord(existingConfig.channel) ? existingConfig.channel : {};
    const existingAccounts = isRecord(existingChannel.accounts) ? existingChannel.accounts : {};
    const storedChannel = stored.channel as RawRecord;
    const storedAccounts = isRecord(storedChannel.accounts) ? storedChannel.accounts : {};
    for (const [accountId, account] of Object.entries(storedAccounts)) {
      if (!isRecord(account)) {
        continue;
      }
      const prior = isRecord(existingAccounts[accountId]) ? (existingAccounts[accountId] as RawRecord) : {};
      if (!normalizeString(account.clientSecret) && normalizeString(prior.clientSecret)) {
        account.clientSecret = prior.clientSecret;
      }
    }
  }
  await repo.upsertByType({
    type: DINGTALK_INTEGRATION_TYPE,
    name: DINGTALK_INTEGRATION_NAME,
    enabled: params.channel.enabled,
    config: stored as Record<string, unknown>
  });
}

async function restoreDingTalkConfigRecord(
  repo: IntegrationConnectionRepository,
  snapshot: {
    rawChannel: RawRecord;
    channel: DingTalkChannelView;
    routing: DingTalkEmployeeBindingsView;
  }
): Promise<void> {
  await repo.upsertByType({
    type: DINGTALK_INTEGRATION_TYPE,
    name: DINGTALK_INTEGRATION_NAME,
    enabled: snapshot.channel.enabled,
    config: {
      channel: snapshot.rawChannel,
      routing: {
        defaultByAccount: { ...snapshot.routing.defaultByAccount },
        groups: snapshot.routing.groups.map((group) => ({ ...group }))
      }
    }
  });
}

export async function getDingTalkChannelConfig(repo: IntegrationConnectionRepository): Promise<DingTalkChannelView> {
  const stored = await readDingTalkConfigRecord(repo);
  return stored.channel;
}

export async function updateDingTalkChannelConfig(
  repo: IntegrationConnectionRepository,
  patch: DingTalkChannelUpdate
): Promise<DingTalkChannelView> {
  const stored = await readDingTalkConfigRecord(repo);
  const rewrite = buildDingTalkRoutingAccountRewrite(patch);
  const { defaultAccountId, accounts } = readNormalizedAccounts({
    enabled: stored.rawChannel.enabled,
    defaultAccountId: stored.rawChannel.defaultAccountId,
    accounts: stored.rawChannel.accounts
  });
  const nextAccounts = { ...accounts };

  for (const accountId of patch.removeAccountIds ?? []) {
    delete nextAccounts[accountId];
  }

  for (const upsert of patch.upserts ?? []) {
    const accountId = normalizeString(upsert.accountId);
    if (!accountId) {
      continue;
    }
    const sourceAccountId = normalizeString(upsert.sourceAccountId);
    const sourceAccount =
      (sourceAccountId && sourceAccountId !== accountId ? nextAccounts[sourceAccountId] : null) ??
      (sourceAccountId && sourceAccountId !== accountId ? accounts[sourceAccountId] : null);
    const existing = nextAccounts[accountId] ?? sourceAccount ?? normalizeAccountRecord({})!;
    const nextAccount: DingTalkAccountRecord = {
      ...existing,
      ...(typeof upsert.clientId === "string" ? { clientId: upsert.clientId.trim() } : {}),
      ...(typeof upsert.robotCode === "string" ? { robotCode: upsert.robotCode.trim() } : {}),
      ...(typeof upsert.corpId === "string" ? { corpId: upsert.corpId.trim() } : {}),
      ...(typeof upsert.agentId === "string" ? { agentId: upsert.agentId.trim() } : {}),
      ...(Array.isArray(upsert.allowFrom) ? { allowFrom: normalizeStringList(upsert.allowFrom) } : {}),
      ...(typeof upsert.dmPolicy === "string" ? { dmPolicy: normalizeDmPolicy(upsert.dmPolicy) } : {}),
      ...(typeof upsert.groupPolicy === "string" ? { groupPolicy: normalizeGroupPolicy(upsert.groupPolicy) } : {}),
      ...(Array.isArray(upsert.groupAllowFrom) ? { groupAllowFrom: normalizeStringList(upsert.groupAllowFrom) } : {}),
      ...(typeof upsert.requireMention === "boolean" ? { requireMention: upsert.requireMention } : {}),
      ...(Array.isArray(upsert.mentionPatterns) ? { mentionPatterns: normalizeStringList(upsert.mentionPatterns) } : {}),
      ...(isRecord(upsert.groups) ? { groups: normalizeGroups(upsert.groups) } : {})
    };
    if (typeof upsert.clientSecret === "string") {
      const secret = upsert.clientSecret.trim();
      if (secret) {
        nextAccount.clientSecret = secret;
      }
    }
    nextAccounts[accountId] = nextAccount;
  }

  const nextDefaultAccountId =
    rewriteDingTalkAccountId(patch.defaultAccountId, rewrite) ||
    (nextAccounts[defaultAccountId] ? defaultAccountId : Object.keys(nextAccounts)[0] || "default");

  const rawChannel: RawRecord = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : Boolean(stored.rawChannel.enabled),
    defaultAccountId: nextDefaultAccountId,
    accounts: nextAccounts
  };
  const nextChannel = readDingTalkChannel(rawChannel);
  await repo.upsertByType({
    type: DINGTALK_INTEGRATION_TYPE,
    name: DINGTALK_INTEGRATION_NAME,
    enabled: nextChannel.enabled,
    config: {
      channel: rawChannel,
      routing: stored.routing
    }
  });
  return nextChannel;
}

export async function getDingTalkRoutingConfig(
  repo: IntegrationConnectionRepository
): Promise<DingTalkEmployeeBindingsView> {
  const stored = await readDingTalkConfigRecord(repo);
  return stored.routing;
}

export async function updateDingTalkRoutingConfig(
  repo: IntegrationConnectionRepository,
  view: DingTalkEmployeeBindingsView
): Promise<DingTalkEmployeeBindingsView> {
  const stored = await readDingTalkConfigRecord(repo);
  await saveDingTalkConfigRecord(repo, {
    channel: stored.channel,
    routing: {
      defaultByAccount: { ...view.defaultByAccount },
      groups: [...view.groups]
    }
  });
  return view;
}

export async function applyDingTalkConfigUpdate(
  repo: IntegrationConnectionRepository,
  params: {
    channel?: DingTalkChannelUpdate;
    routing?: DingTalkEmployeeBindingsView;
    reload: () => Promise<void>;
  }
): Promise<{ channel: DingTalkChannelView; routing?: DingTalkEmployeeBindingsView }> {
  const snapshot = await readDingTalkConfigRecord(repo);
  let mutated = false;
  let nextChannel = snapshot.channel;
  let nextRouting: DingTalkEmployeeBindingsView | undefined;
  const desiredRouting = reconcileDingTalkRoutingAccounts(params.routing ?? snapshot.routing, params.channel);
  const shouldPersistRouting =
    params.routing !== undefined || !areDingTalkBindingsEqual(snapshot.routing, desiredRouting);

  try {
    nextChannel = await updateDingTalkChannelConfig(repo, params.channel ?? {});
    mutated = true;
    if (shouldPersistRouting) {
      nextRouting = await updateDingTalkRoutingConfig(repo, desiredRouting);
    }
    await params.reload();
    return {
      channel: nextChannel,
      routing: nextRouting
    };
  } catch (error) {
    if (mutated) {
      await restoreDingTalkConfigRecord(repo, snapshot);
      try {
        await params.reload();
      } catch (rollbackError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        throw new Error(`${originalMessage} (rollback failed: ${rollbackMessage})`);
      }
    }
    throw error;
  }
}

function buildDingTalkRuntimeChannel(rawChannel: RawRecord | undefined): Config["channels"]["dingtalk"] {
  const current = rawChannel ?? {};
  const normalized = readNormalizedAccounts(current);
  const accounts: Record<string, DingTalkAccountRecord> = {
    ...normalized.accounts,
    [TEST_FALLBACK_ACCOUNT_ID]: {
      ...(normalizeAccountRecord({})!),
      ...(normalized.accounts[TEST_FALLBACK_ACCOUNT_ID] ?? {}),
      clientId: TEST_FALLBACK_CLIENT_ID,
      clientSecret: TEST_FALLBACK_CLIENT_SECRET
    }
  };
  const defaultAccountId = TEST_FALLBACK_ACCOUNT_ID;
  const defaultAccount =
    accounts[defaultAccountId] ?? createLegacyAccount(current) ?? normalizeAccountRecord({})!;
  return {
    enabled: true,
    clientId: defaultAccount.clientId,
    clientSecret: defaultAccount.clientSecret,
    robotCode: defaultAccount.robotCode,
    corpId: defaultAccount.corpId,
    agentId: defaultAccount.agentId,
    allowFrom: [...(defaultAccount.allowFrom ?? [])],
    dmPolicy: defaultAccount.dmPolicy,
    groupPolicy: defaultAccount.groupPolicy,
    groupAllowFrom: [...(defaultAccount.groupAllowFrom ?? [])],
    requireMention: Boolean(defaultAccount.requireMention),
    mentionPatterns: [...(defaultAccount.mentionPatterns ?? [])],
    groups: defaultAccount.groups ?? {},
    defaultAccountId,
    accounts
  };
}

export async function getEmployeeDingTalkBinding(
  repo: IntegrationConnectionRepository,
  employeeCode: string
): Promise<EmployeeDingTalkBindingView> {
  const routing = await getDingTalkRoutingConfig(repo);
  const directAccountIds = Object.entries(routing.defaultByAccount)
    .filter(([, code]) => code === employeeCode)
    .map(([accountId]) => accountId)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const groupBindings = routing.groups
    .filter((group) => group.employeeCode === employeeCode)
    .map((group) => ({
      groupId: group.groupId,
      accountId: group.accountId,
      allowCollaboration: group.allowCollaboration,
      allowedEmployeeCodes: group.allowedEmployeeCodes
    }))
    .sort((left, right) => left.groupId.localeCompare(right.groupId, "zh-CN"));

  return {
    employeeCode,
    directAccountIds,
    groupBindings
  };
}

export async function updateEmployeeDingTalkBinding(
  repo: IntegrationConnectionRepository,
  employeeCode: string,
  patch: EmployeeDingTalkBindingUpdate
): Promise<EmployeeDingTalkBindingView> {
  const routing = await getDingTalkRoutingConfig(repo);
  const requestedDirectAccountIds =
    patch.directAccountIds?.map((accountId) => normalizeString(accountId)).filter(Boolean) ?? [];
  const directAccountIds = [...new Set(requestedDirectAccountIds)];
  const nextView: DingTalkEmployeeBindingsView = {
    defaultByAccount: Object.fromEntries(
      Object.entries(routing.defaultByAccount).filter(([, code]) => code !== employeeCode)
    ),
    groups: routing.groups.filter((group) => group.employeeCode !== employeeCode)
  };

  for (const directAccountId of directAccountIds) {
    nextView.defaultByAccount[directAccountId] = employeeCode;
  }

  for (const group of patch.groupBindings ?? []) {
    const groupId = normalizeString(group.groupId);
    if (!groupId) {
      continue;
    }
    nextView.groups.push({
      groupId,
      employeeCode,
      accountId: normalizeString(group.accountId) || directAccountIds[0] || "default",
      allowCollaboration: group.allowCollaboration === true,
      allowedEmployeeCodes: parseAllowedEmployeeCodes(group.allowedEmployeeCodes)
    });
  }

  await updateDingTalkRoutingConfig(repo, nextView);
  return getEmployeeDingTalkBinding(repo, employeeCode);
}

export async function applyEmployeeDingTalkBindingUpdate(
  repo: IntegrationConnectionRepository,
  employeeCode: string,
  params: {
    patch: EmployeeDingTalkBindingUpdate;
    reload: () => Promise<void>;
  }
): Promise<EmployeeDingTalkBindingView> {
  const snapshot = await getDingTalkRoutingConfig(repo);
  try {
    const data = await updateEmployeeDingTalkBinding(repo, employeeCode, params.patch);
    await params.reload();
    return data;
  } catch (error) {
    await updateDingTalkRoutingConfig(repo, snapshot);
    try {
      await params.reload();
    } catch (rollbackError) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      throw new Error(`${originalMessage} (rollback failed: ${rollbackMessage})`);
    }
    throw error;
  }
}

/**
 * Build runtime config from in-memory views (no secrets — accounts have empty clientSecret).
 * Use `getDingTalkRuntimeConfig` instead when secrets are needed for actual channel connections.
 */
export function buildDingTalkRuntimeConfig(params: {
  channel: DingTalkChannelView;
  routing: DingTalkEmployeeBindingsView;
}): Record<string, unknown> {
  const channel = {
    enabled: params.channel.enabled,
    defaultAccountId: params.channel.defaultAccountId,
    accounts: Object.fromEntries(
      params.channel.accounts.map((account) => [
        account.accountId,
        {
          clientId: account.clientId,
          clientSecret: "",
          robotCode: account.robotCode,
          corpId: account.corpId,
          agentId: account.agentId,
          allowFrom: account.allowFrom,
          dmPolicy: account.dmPolicy,
          groupPolicy: account.groupPolicy,
          groupAllowFrom: account.groupAllowFrom,
          requireMention: account.requireMention,
          mentionPatterns: account.mentionPatterns,
          groups: account.groups
        }
      ])
    )
  };
  const bindings = mergeDingTalkEmployeeBindings({ bindings: [] }, params.routing).bindings;
  return {
    channels: {
      dingtalk: channel
    },
    bindings
  };
}

/**
 * Load runtime config from DB with actual secrets — the primary path for channel boot.
 */
export async function getDingTalkRuntimeConfig(
  repo: IntegrationConnectionRepository
): Promise<Record<string, unknown>> {
  const stored = await readDingTalkConfigRecord(repo);
  return {
    channels: {
      dingtalk: buildDingTalkRuntimeChannel(stored.rawChannel)
    },
    bindings: mergeDingTalkEmployeeBindings({ bindings: [] }, stored.routing).bindings,
    plugins: {
      enabled: true,
      entries: {
        "builtin-channel-dingtalk": {
          enabled: true
        }
      }
    }
  };
}

export type DingTalkEditorAccountInput = {
  accountId: string;
  requireMention: boolean;
  mentionPatterns: string[];
  groups: Record<string, { requireMention: boolean; mentionPatterns: string[] }>;
};

export type DingTalkEditorRoutingGroupInput = {
  employeeCode: string;
  accountId: string;
  allowCollaboration: boolean;
  allowedEmployeeCodes: string[];
};

export type EditableDingTalkGroupBinding = {
  groupId: string;
  accountId: string;
  employeeCode: string;
  allowCollaboration: boolean;
  allowedEmployeeCodesText: string;
  requireMention: boolean;
  mentionPatternsText: string;
};

type EditableDingTalkAccountReference = {
  accountId: string;
  sourceAccountId?: string;
};

function toCsv(values: string[]): string {
  return values.filter(Boolean).join(", ");
}

function normalizeAccountId(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function createEmptyDingTalkGroupBinding(defaultAccountId: string): EditableDingTalkGroupBinding {
  return {
    groupId: "",
    accountId: defaultAccountId,
    employeeCode: "",
    allowCollaboration: false,
    allowedEmployeeCodesText: "",
    requireMention: false,
    mentionPatternsText: ""
  };
}

export function applyDingTalkAccountRenames(params: {
  accounts: EditableDingTalkAccountReference[];
  defaultByAccount: Record<string, string>;
  groups: EditableDingTalkGroupBinding[];
}): {
  defaultByAccount: Record<string, string>;
  groups: EditableDingTalkGroupBinding[];
} {
  const renameMap = new Map<string, string>();
  for (const account of params.accounts) {
    const nextAccountId = normalizeAccountId(account.accountId);
    const sourceAccountId = normalizeAccountId(account.sourceAccountId);
    if (!nextAccountId || !sourceAccountId || nextAccountId === sourceAccountId) {
      continue;
    }
    renameMap.set(sourceAccountId, nextAccountId);
  }

  if (renameMap.size === 0) {
    return {
      defaultByAccount: { ...params.defaultByAccount },
      groups: params.groups.map((group) => ({ ...group }))
    };
  }

  return {
    defaultByAccount: Object.fromEntries(
      Object.entries(params.defaultByAccount).map(([accountId, employeeCode]) => [
        renameMap.get(normalizeAccountId(accountId)) ?? accountId,
        employeeCode
      ])
    ),
    groups: params.groups.map((group) => ({
      ...group,
      accountId: renameMap.get(normalizeAccountId(group.accountId)) ?? group.accountId
    }))
  };
}

export function buildEditableDingTalkGroupBindings(params: {
  accounts: DingTalkEditorAccountInput[];
  routingGroups: Array<DingTalkEditorRoutingGroupInput & { groupId: string }>;
}): EditableDingTalkGroupBinding[] {
  const accountMap = new Map(params.accounts.map((account) => [account.accountId, account]));
  return params.routingGroups
    .map((group) => {
      const account = accountMap.get(group.accountId);
      const groupRule = account?.groups[group.groupId] ?? account?.groups["*"];
      return {
        groupId: group.groupId,
        accountId: group.accountId,
        employeeCode: group.employeeCode,
        allowCollaboration: group.allowCollaboration,
        allowedEmployeeCodesText: toCsv(group.allowedEmployeeCodes),
        requireMention: groupRule?.requireMention ?? account?.requireMention ?? false,
        mentionPatternsText: toCsv(groupRule?.mentionPatterns ?? account?.mentionPatterns ?? [])
      };
    })
    .sort((left, right) => left.groupId.localeCompare(right.groupId, "zh-CN"));
}

export function buildDingTalkAccountGroupOverrides(params: {
  accounts: DingTalkEditorAccountInput[];
  groups: EditableDingTalkGroupBinding[];
}): Record<string, Record<string, { requireMention: boolean; mentionPatterns: string[] }>> {
  const output: Record<string, Record<string, { requireMention: boolean; mentionPatterns: string[] }>> = {};

  for (const account of params.accounts) {
    const wildcard = account.groups["*"];
    if (wildcard) {
      output[account.accountId] = {
        "*": {
          requireMention: wildcard.requireMention,
          mentionPatterns: [...wildcard.mentionPatterns]
        }
      };
    }
  }

  for (const group of params.groups) {
    const accountId = group.accountId.trim();
    const groupId = group.groupId.trim();
    if (!accountId || !groupId) {
      continue;
    }
    const mentionPatterns = group.mentionPatternsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    output[accountId] ??= {};
    output[accountId][groupId] = {
      requireMention: group.requireMention,
      mentionPatterns
    };
  }

  return output;
}

import type { Config } from "@nextclaw/core";
import { normalizeString, normalizeStringList } from "./utils";

const dingtalkGroupRuleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    requireMention: {
      type: "boolean"
    },
    mentionPatterns: {
      type: "array",
      items: {
        type: "string"
      }
    }
  }
} as const;

const dingtalkAccountSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    clientId: {
      type: "string"
    },
    clientSecret: {
      type: "string"
    },
    robotCode: {
      type: "string"
    },
    corpId: {
      type: "string"
    },
    agentId: {
      type: "string"
    },
    allowFrom: {
      type: "array",
      items: {
        type: "string"
      }
    },
    dmPolicy: {
      type: "string",
      enum: ["pairing", "allowlist", "open", "disabled"]
    },
    groupPolicy: {
      type: "string",
      enum: ["open", "allowlist", "disabled"]
    },
    groupAllowFrom: {
      type: "array",
      items: {
        type: "string"
      }
    },
    requireMention: {
      type: "boolean"
    },
    mentionPatterns: {
      type: "array",
      items: {
        type: "string"
      }
    },
    groups: {
      type: "object",
      additionalProperties: dingtalkGroupRuleSchema
    }
  }
} as const;

export const dingtalkPluginConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean"
    },
    clientId: {
      type: "string"
    },
    clientSecret: {
      type: "string"
    },
    robotCode: {
      type: "string"
    },
    corpId: {
      type: "string"
    },
    agentId: {
      type: "string"
    },
    allowFrom: {
      type: "array",
      items: {
        type: "string"
      }
    },
    dmPolicy: {
      type: "string",
      enum: ["pairing", "allowlist", "open", "disabled"]
    },
    groupPolicy: {
      type: "string",
      enum: ["open", "allowlist", "disabled"]
    },
    groupAllowFrom: {
      type: "array",
      items: {
        type: "string"
      }
    },
    requireMention: {
      type: "boolean"
    },
    mentionPatterns: {
      type: "array",
      items: {
        type: "string"
      }
    },
    groups: {
      type: "object",
      additionalProperties: dingtalkGroupRuleSchema
    },
    defaultAccountId: {
      type: "string"
    },
    accounts: {
      type: "object",
      additionalProperties: dingtalkAccountSchema
    }
  }
} as const;

export type DingTalkGroupRule = {
  requireMention: boolean;
  mentionPatterns: string[];
};

export type DingTalkAccountConfig = {
  clientId: string;
  clientSecret: string;
  robotCode: string;
  corpId: string;
  agentId: string;
  allowFrom: string[];
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy: "open" | "allowlist" | "disabled";
  groupAllowFrom: string[];
  requireMention: boolean;
  mentionPatterns: string[];
  groups: Record<string, DingTalkGroupRule>;
};

export type NormalizedDingTalkConfig = {
  enabled: boolean;
  defaultAccountId: string;
  accounts: Record<string, DingTalkAccountConfig>;
};

export type RawDingTalkConfig = Partial<Config["channels"]["dingtalk"]> & {
  accounts?: Record<string, Partial<DingTalkAccountConfig> | undefined>;
};

function normalizeGroupRules(value: unknown): Record<string, DingTalkGroupRule> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, DingTalkGroupRule> = {};
  for (const [groupId, rawRule] of Object.entries(value)) {
    if (!groupId.trim() || !rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) {
      continue;
    }
    output[groupId] = {
      requireMention: Boolean((rawRule as { requireMention?: unknown }).requireMention),
      mentionPatterns: normalizeStringList((rawRule as { mentionPatterns?: unknown }).mentionPatterns)
    };
  }
  return output;
}

function normalizeDmPolicy(value: unknown): DingTalkAccountConfig["dmPolicy"] {
  const policy = normalizeString(value);
  return policy === "pairing" || policy === "allowlist" || policy === "disabled" ? policy : "open";
}

function normalizeGroupPolicy(value: unknown): DingTalkAccountConfig["groupPolicy"] {
  const policy = normalizeString(value);
  return policy === "allowlist" || policy === "disabled" ? policy : "open";
}

function normalizeAccount(raw: Partial<DingTalkAccountConfig> | undefined): DingTalkAccountConfig {
  return {
    clientId: normalizeString(raw?.clientId),
    clientSecret: normalizeString(raw?.clientSecret),
    robotCode: normalizeString(raw?.robotCode),
    corpId: normalizeString(raw?.corpId),
    agentId: normalizeString(raw?.agentId),
    allowFrom: normalizeStringList(raw?.allowFrom),
    dmPolicy: normalizeDmPolicy(raw?.dmPolicy),
    groupPolicy: normalizeGroupPolicy(raw?.groupPolicy),
    groupAllowFrom: normalizeStringList(raw?.groupAllowFrom),
    requireMention: Boolean(raw?.requireMention),
    mentionPatterns: normalizeStringList(raw?.mentionPatterns),
    groups: normalizeGroupRules(raw?.groups)
  };
}

function createLegacyDefaultAccount(raw: RawDingTalkConfig): DingTalkAccountConfig | null {
  const account = normalizeAccount(raw);
  if (
    !account.clientId &&
    !account.clientSecret &&
    !account.robotCode &&
    !account.corpId &&
    !account.agentId &&
    account.allowFrom.length === 0 &&
    account.groupAllowFrom.length === 0 &&
    account.mentionPatterns.length === 0 &&
    Object.keys(account.groups).length === 0
  ) {
    return null;
  }
  return account;
}

export function normalizeDingTalkConfig(raw: RawDingTalkConfig | undefined): NormalizedDingTalkConfig {
  const accounts: Record<string, DingTalkAccountConfig> = {};
  for (const [accountId, account] of Object.entries(raw?.accounts ?? {})) {
    const normalizedId = normalizeString(accountId);
    if (!normalizedId) {
      continue;
    }
    accounts[normalizedId] = normalizeAccount(account);
  }

  if (Object.keys(accounts).length === 0) {
    const legacy = createLegacyDefaultAccount(raw ?? {});
    if (legacy) {
      accounts.default = legacy;
    }
  }

  const requestedDefault = normalizeString(raw?.defaultAccountId) || "default";
  return {
    enabled: Boolean(raw?.enabled),
    defaultAccountId: accounts[requestedDefault] ? requestedDefault : Object.keys(accounts)[0] || requestedDefault,
    accounts
  };
}

export function resolveDingTalkAccount(
  config: NormalizedDingTalkConfig,
  accountId?: string | null
): DingTalkAccountConfig | null {
  const requestedAccountId = normalizeString(accountId);
  if (requestedAccountId && config.accounts[requestedAccountId]) {
    return config.accounts[requestedAccountId];
  }
  return config.accounts[config.defaultAccountId] ?? Object.values(config.accounts)[0] ?? null;
}

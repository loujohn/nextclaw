import type { Knex } from "knex";
import { createLogger } from "../utils/logger";
import { UserRepository } from "../repositories/user-repository";

const log = createLogger("UserSync");
const PERSONNEL_SYNC_PROVIDER = "personnel-api";
const PERSONNEL_SYNC_FALLBACK_DOMAIN = "personnel-sync.local";
const PERSONNEL_SYNC_TIMEOUT_MS = 15_000;
const PERSONNEL_SYNC_TOKEN_REFRESH_SKEW_MS = 60_000;

let cachedPersonnelAccessToken: { token: string; expiresAt: number } | null = null;

type PersonnelSyncRawUser = {
  userId?: unknown;
  userName?: unknown;
  name?: unknown;
  postName?: unknown;
  roleName?: unknown;
  dingTalkId?: unknown;
  phone?: unknown;
  userType?: unknown;
};

type NormalizedPersonnelUser = {
  externalUserId: string;
  externalUserName: string;
  externalName: string;
  externalPostName: string;
  externalRoleName: string;
  externalDingTalkId: string;
  externalPhone: string;
  externalUserType: string;
  displayName: string;
};

export type UserSyncSummary = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  summary: string;
};

export type UserSyncResult = {
  ok: boolean;
  data: UserSyncSummary;
};

type PersonnelSyncConfig = {
  url: string;
  token: string;
  tokenUrl: string;
  tokenBasicAuth: string;
  username: string;
  password: string;
  loginType: string;
  grantType: string;
};

type PersonnelTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

function derivePersonnelTokenUrl(apiUrl: string): string {
  try {
    return new URL("/api/admin/oauth2/token", apiUrl).toString();
  } catch {
    return "";
  }
}

function normalizeBasicAuth(value: string): string {
  if (!value) {
    return "";
  }

  return /^basic\s+/i.test(value) ? value : `Basic ${value}`;
}

function getPersonnelSyncConfig(): PersonnelSyncConfig {
  const url = process.env.PERSONNEL_SYNC_API_URL?.trim() ?? "";
  return {
    url,
    token: process.env.PERSONNEL_SYNC_API_TOKEN?.trim() ?? "",
    tokenUrl: process.env.PERSONNEL_SYNC_TOKEN_URL?.trim() ?? derivePersonnelTokenUrl(url),
    tokenBasicAuth: normalizeBasicAuth(process.env.PERSONNEL_SYNC_TOKEN_BASIC_AUTH?.trim() ?? ""),
    username: process.env.PERSONNEL_SYNC_USERNAME?.trim() ?? "",
    password: process.env.PERSONNEL_SYNC_PASSWORD?.trim() ?? "",
    loginType: process.env.PERSONNEL_SYNC_LOGIN_TYPE?.trim() ?? "quick",
    grantType: process.env.PERSONNEL_SYNC_GRANT_TYPE?.trim() ?? "password",
  };
}

function hasDynamicPersonnelTokenConfig(config: PersonnelSyncConfig): boolean {
  return Boolean(config.tokenUrl && config.tokenBasicAuth && config.username && config.password);
}

function extractPersonnelAccessToken(payload: unknown): { token: string; expiresInMs: number | null } {
  if (!payload || typeof payload !== "object") {
    throw new Error("人员同步 token 接口返回结构不符合预期");
  }

  const record = payload as PersonnelTokenResponse;
  const token = normalizeString(record.access_token);
  if (!token) {
    throw new Error("人员同步 token 接口未返回 access_token");
  }

  const expiresInSeconds = Number(record.expires_in);
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return { token, expiresInMs: null };
  }

  return { token, expiresInMs: expiresInSeconds * 1000 };
}

async function requestPersonnelAccessToken(config: PersonnelSyncConfig): Promise<string> {
  if (
    cachedPersonnelAccessToken &&
    cachedPersonnelAccessToken.expiresAt - PERSONNEL_SYNC_TOKEN_REFRESH_SKEW_MS > Date.now()
  ) {
    return cachedPersonnelAccessToken.token;
  }

  if (!hasDynamicPersonnelTokenConfig(config)) {
    throw new Error(
      "未配置人员同步 token 获取参数，请配置 PERSONNEL_SYNC_TOKEN_URL、PERSONNEL_SYNC_TOKEN_BASIC_AUTH、PERSONNEL_SYNC_USERNAME、PERSONNEL_SYNC_PASSWORD"
    );
  }

  const formData = new FormData();
  formData.append("grant_type", config.grantType);
  formData.append("username", config.username);
  formData.append("password", config.password);
  formData.append("login_type", config.loginType);

  log.info(`开始换取人员同步 access token: ${config.tokenUrl}`);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: config.tokenBasicAuth,
    },
    body: formData,
    signal: AbortSignal.timeout(PERSONNEL_SYNC_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`获取人员同步 token 失败：HTTP ${response.status}${errorText ? ` ${errorText}` : ""}`);
  }

  const payload = (await response.json()) as unknown;
  const accessToken = extractPersonnelAccessToken(payload);
  cachedPersonnelAccessToken = {
    token: accessToken.token,
    expiresAt: Date.now() + (accessToken.expiresInMs ?? 5 * 60 * 1000),
  };
  return accessToken.token;
}

async function resolvePersonnelAccessToken(config: PersonnelSyncConfig): Promise<string> {
  if (config.token) {
    return config.token;
  }

  return requestPersonnelAccessToken(config);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePersonnelUser(rawUser: PersonnelSyncRawUser): NormalizedPersonnelUser {
  const externalUserId = normalizeString(rawUser.userId);
  const externalUserName = normalizeString(rawUser.userName);
  const externalName = normalizeString(rawUser.name);

  return {
    externalUserId,
    externalUserName,
    externalName,
    externalPostName: normalizeString(rawUser.postName),
    externalRoleName: normalizeString(rawUser.roleName),
    externalDingTalkId: normalizeString(rawUser.dingTalkId),
    externalPhone: normalizeString(rawUser.phone),
    externalUserType: normalizeString(rawUser.userType),
    displayName: externalName || externalUserName || externalUserId,
  };
}

function buildPlaceholderEmail(externalUserId: string): string {
  const localPart = externalUserId
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
  return `${localPart}@${PERSONNEL_SYNC_FALLBACK_DOMAIN}`;
}

function toUsernameCandidate(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

async function resolveSyncedUsername(repo: UserRepository, user: NormalizedPersonnelUser): Promise<string> {
  const candidates = [
    toUsernameCandidate(user.externalUserName),
    toUsernameCandidate(user.externalUserId),
    `sync-${toUsernameCandidate(user.externalUserId)}`,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const existing = await repo.findByUsername(candidate);
    if (!existing) {
      return candidate;
    }
  }

  return `sync-${user.externalUserId}-${Date.now()}`;
}

function extractPersonnelUsers(payload: unknown): PersonnelSyncRawUser[] {
  if (Array.isArray(payload)) {
    return payload as PersonnelSyncRawUser[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data as PersonnelSyncRawUser[];
    }
    if (Array.isArray(record.list)) {
      return record.list as PersonnelSyncRawUser[];
    }
  }

  throw new Error("人员同步接口返回结构不符合预期，必须返回数组列表");
}

async function fetchPersonnelUsers(): Promise<PersonnelSyncRawUser[]> {
  const config = getPersonnelSyncConfig();
  if (!config.url) {
    throw new Error("未配置人员同步接口地址 PERSONNEL_SYNC_API_URL");
  }

  const accessToken = await resolvePersonnelAccessToken(config);

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  log.info(`开始拉取人员同步数据: ${config.url}`);
  const response = await fetch(config.url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(PERSONNEL_SYNC_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`拉取人员同步数据失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const users = extractPersonnelUsers(payload);
  log.info(`人员同步数据拉取完成，总数=${users.length}`);
  return users;
}

export async function performUserPersonnelSync(db: Knex, rawUsers: PersonnelSyncRawUser[]): Promise<UserSyncSummary> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await db.transaction(async (trx) => {
    const userRepo = new UserRepository(trx);

    for (const rawUser of rawUsers) {
      const normalized = normalizePersonnelUser(rawUser);
      if (!normalized.externalUserId) {
        skipped += 1;
        continue;
      }

      const existing = await userRepo.findByExternalUserId(normalized.externalUserId);
      if (existing) {
        await userRepo.updateSyncedUser(existing.id, {
          externalUserId: normalized.externalUserId,
          displayName: normalized.displayName,
          externalUserName: normalized.externalUserName,
          externalName: normalized.externalName,
          externalPostName: normalized.externalPostName,
          externalRoleName: normalized.externalRoleName,
          externalDingTalkId: normalized.externalDingTalkId,
          externalPhone: normalized.externalPhone,
          externalUserType: normalized.externalUserType,
        });
        updated += 1;
        continue;
      }

      const username = await resolveSyncedUsername(userRepo, normalized);
      await userRepo.createSyncedUser({
        username,
        email: buildPlaceholderEmail(normalized.externalUserId),
        displayName: normalized.displayName,
        externalUserId: normalized.externalUserId,
        externalUserName: normalized.externalUserName,
        externalName: normalized.externalName,
        externalPostName: normalized.externalPostName,
        externalRoleName: normalized.externalRoleName,
        externalDingTalkId: normalized.externalDingTalkId,
        externalPhone: normalized.externalPhone,
        externalUserType: normalized.externalUserType,
      });
      created += 1;
    }
  });

  return {
    total: rawUsers.length,
    created,
    updated,
    skipped,
    failed: 0,
    summary: "用户同步完成",
  };
}

export async function runUserPersonnelSync(db: Knex): Promise<UserSyncResult> {
  const rawUsers = await fetchPersonnelUsers();
  const data = await performUserPersonnelSync(db, rawUsers);
  log.info(
    `用户同步完成: provider=${PERSONNEL_SYNC_PROVIDER} total=${data.total} created=${data.created} updated=${data.updated} skipped=${data.skipped}`
  );
  return { ok: true, data };
}

export function hasPersonnelSyncConfig(): boolean {
  const config = getPersonnelSyncConfig();
  return Boolean(config.url && (config.token || hasDynamicPersonnelTokenConfig(config)));
}
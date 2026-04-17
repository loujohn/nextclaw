import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type UserRecord } from "../db/schema";
import { dbNow } from "../db/knex";
import type { UserView, UserContext, UserRole, AuthProvider, UpdateUserInput, UserSource } from "../../shared/auth-types";

export type UpsertUserFromTokenInput = {
  keycloakSub: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  identityHints?: string[];
};

export type CreateSyncedUserInput = {
  username: string;
  email: string;
  displayName: string;
  externalUserId: string;
  externalUserName: string;
  externalName: string;
  externalPostName: string;
  externalRoleName: string;
  externalDingTalkId: string;
  externalPhone: string;
  externalUserType: string;
  humanEmployeeId: string | null;
};

export type UpdateSyncedUserInput = {
  externalUserId: string;
  displayName: string;
  externalUserName: string;
  externalName: string;
  externalPostName: string;
  externalRoleName: string;
  externalDingTalkId: string;
  externalPhone: string;
  externalUserType: string;
  humanEmployeeId?: string | null;
};

export type BatchUpdateSyncedUserInput = {
  id: string;
} & UpdateSyncedUserInput;

export type ListUsersPageInput = {
  page: number;
  pageSize: number;
  search?: string;
};

export type ListUsersPageResult = {
  data: UserView[];
  total: number;
  page: number;
  pageSize: number;
};

function buildSyncedKeycloakSub(externalUserId: string): string {
  return `personnel-sync:${externalUserId}`;
}

function normalizeIdentityCandidates(keycloakSub: string, identityHints?: string[]): string[] {
  const candidates = [keycloakSub, ...(identityHints ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

function normalizeSearchKeyword(search?: string): string {
  return search?.trim().toLowerCase() ?? "";
}

function toUserView(record: UserRecord): UserView {
  return {
    id: record.id,
    username: record.username ?? "",
    email: record.email,
    displayName: record.display_name,
    avatarUrl: record.avatar_url,
    role: record.role as UserRole,
    isActive: record.is_active === 1,
    authProvider: (record.auth_provider ?? "keycloak") as AuthProvider,
    userSource: (record.user_source ?? "manual") as UserSource,
    syncProvider: record.sync_provider,
    externalUserId: record.external_user_id,
    externalUserName: record.external_user_name ?? "",
    externalName: record.external_name ?? "",
    externalPostName: record.external_post_name ?? "",
    externalRoleName: record.external_role_name ?? "",
    externalDingTalkId: record.external_dingtalk_id ?? "",
    externalPhone: record.external_phone ?? "",
    externalUserType: record.external_user_type ?? "",
    departmentId: record.department_id,
    humanEmployeeId: record.human_employee_id,
    lastLoginAt: record.last_login_at,
    lastSyncedAt: record.last_synced_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function toUserContext(record: UserRecord): UserContext {
  return {
    id: record.id,
    keycloakSub: record.keycloak_sub,
    email: record.email,
    displayName: record.display_name,
    avatarUrl: record.avatar_url,
    role: record.role as UserRole,
    isActive: record.is_active === 1,
    departmentId: record.department_id,
    humanEmployeeId: record.human_employee_id,
  };
}

export class UserRepository {
  constructor(private db: Knex) {}

  private buildSyncedUserRecord(input: CreateSyncedUserInput, now: string): UserRecord {
    return {
      id: randomUUID(),
      keycloak_sub: buildSyncedKeycloakSub(input.externalUserId),
      username: input.username,
      email: input.email,
      display_name: input.displayName,
      avatar_url: "",
      role: "user",
      is_active: 1,
      user_source: "sync",
      sync_provider: "personnel-api",
      external_user_id: input.externalUserId,
      external_user_name: input.externalUserName,
      external_name: input.externalName,
      external_post_name: input.externalPostName,
      external_role_name: input.externalRoleName,
      external_dingtalk_id: input.externalDingTalkId,
      external_phone: input.externalPhone,
      external_user_type: input.externalUserType,
      department_id: null,
      human_employee_id: input.humanEmployeeId,
      preferences: "{}",
      auth_provider: "keycloak",
      password_hash: null,
      last_login_at: null,
      last_synced_at: now,
      created_at: now,
      updated_at: now,
    };
  }

  private buildCaseExpression<T extends { id: string }>(
    items: T[],
    columnName: string,
    resolveValue: (item: T) => string | null
  ) {
    const bindings: Array<string | null> = ["id"];
    const clauses = items.map((item) => {
      bindings.push(item.id, resolveValue(item));
      return "WHEN ? THEN ?";
    });
    bindings.push(columnName);
    return this.db.raw(`CASE ?? ${clauses.join(" ")} ELSE ?? END`, bindings);
  }

  private async findClaimableSyncedUser(input: UpsertUserFromTokenInput): Promise<UserRecord | null> {
    const candidates = normalizeIdentityCandidates(input.keycloakSub, input.identityHints);
    if (candidates.length === 0) {
      return null;
    }

    const syncedSubCandidates = candidates.map((candidate) => buildSyncedKeycloakSub(candidate));
    const records = await this.db(PLATFORM_TABLES.users)
      .where({ user_source: "sync" })
      .andWhere((builder) => {
        builder
          .whereIn("keycloak_sub", syncedSubCandidates)
          .orWhereIn("external_user_id", candidates)
          .orWhereIn("username", candidates);
      })
      .select<UserRecord[]>("*");

    if (records.length === 0) {
      return null;
    }

    const rankRecord = (record: UserRecord): [number, number] => {
      for (const [index, candidate] of candidates.entries()) {
        if (record.keycloak_sub === buildSyncedKeycloakSub(candidate)) {
          return [0, index];
        }
        if (record.external_user_id === candidate) {
          return [1, index];
        }
        if (record.username === candidate) {
          return [2, index];
        }
      }
      return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    };

    const ranked = records
      .map((record) => ({ record, score: rankRecord(record) }))
      .sort((left, right) => {
        if (left.score[0] !== right.score[0]) {
          return left.score[0] - right.score[0];
        }
        return left.score[1] - right.score[1];
      });

    const best = ranked[0];
    if (!best || best.score[0] === Number.MAX_SAFE_INTEGER) {
      return null;
    }

    const ambiguous = ranked.filter(
      (entry) => entry.score[0] === best.score[0] && entry.score[1] === best.score[1]
    );
    if (ambiguous.length > 1) {
      return null;
    }

    return best.record;
  }

  private applyListSearch(query: Knex.QueryBuilder, search?: string) {
    const keyword = normalizeSearchKeyword(search);
    if (!keyword) return;

    const pattern = `%${keyword}%`;
    const columns = [
      "display_name",
      "username",
      "email",
      "external_user_id",
      "external_user_name",
      "external_name",
      "external_post_name",
      "external_role_name",
      "external_dingtalk_id",
    ];

    query.where((builder) => {
      for (const column of columns) {
        builder.orWhereRaw("LOWER(COALESCE(??, '')) LIKE ?", [column, pattern]);
      }
    });
  }

  async upsertFromToken(input: UpsertUserFromTokenInput): Promise<UserContext> {
    const now = dbNow();
    const existing = await this.db(PLATFORM_TABLES.users)
      .where({ keycloak_sub: input.keycloakSub })
      .first<UserRecord | undefined>();

    if (existing) {
      await this.db(PLATFORM_TABLES.users)
        .where({ id: existing.id })
        .update({
          email: input.email,
          display_name: input.displayName,
          avatar_url: input.avatarUrl ?? existing.avatar_url,
          last_login_at: now,
          updated_at: now,
        });
      return toUserContext({
        ...existing,
        email: input.email,
        display_name: input.displayName,
        avatar_url: input.avatarUrl ?? existing.avatar_url,
        last_login_at: now,
        updated_at: now,
      });
    }

    const claimable = await this.findClaimableSyncedUser(input);
    if (claimable) {
      const nextEmail = input.email || claimable.email;
      const nextDisplayName = input.displayName || claimable.display_name;
      const nextAvatarUrl = input.avatarUrl ?? claimable.avatar_url;
      await this.db(PLATFORM_TABLES.users)
        .where({ id: claimable.id })
        .update({
          keycloak_sub: input.keycloakSub,
          email: nextEmail,
          display_name: nextDisplayName,
          avatar_url: nextAvatarUrl,
          last_login_at: now,
          updated_at: now,
        });

      return toUserContext({
        ...claimable,
        keycloak_sub: input.keycloakSub,
        email: nextEmail,
        display_name: nextDisplayName,
        avatar_url: nextAvatarUrl,
        last_login_at: now,
        updated_at: now,
      });
    }

    const id = randomUUID();
    const record: UserRecord = {
      id,
      keycloak_sub: input.keycloakSub,
      username: "",
      email: input.email,
      display_name: input.displayName,
      avatar_url: input.avatarUrl ?? "",
      role: "user",
      is_active: 1,
      user_source: "manual",
      sync_provider: null,
      external_user_id: null,
      external_user_name: "",
      external_name: "",
      external_post_name: "",
      external_role_name: "",
      external_dingtalk_id: "",
      external_phone: "",
      external_user_type: "",
      department_id: null,
      human_employee_id: null,
      preferences: "{}",
      auth_provider: "keycloak",
      password_hash: null,
      last_login_at: now,
      last_synced_at: null,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.db(PLATFORM_TABLES.users).insert(record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate")) {
        const retried = await this.db(PLATFORM_TABLES.users)
          .where({ keycloak_sub: input.keycloakSub })
          .first<UserRecord>();
        if (retried) return toUserContext(retried);
      }
      throw err;
    }

    return toUserContext(record);
  }

  async findByKeycloakSub(sub: string): Promise<UserContext | null> {
    const record = await this.db(PLATFORM_TABLES.users)
      .where({ keycloak_sub: sub })
      .first<UserRecord | undefined>();
    return record ? toUserContext(record) : null;
  }

  async findById(id: string): Promise<UserView | null> {
    const record = await this.db(PLATFORM_TABLES.users)
      .where({ id })
      .first<UserRecord | undefined>();
    return record ? toUserView(record) : null;
  }

  async findByExternalUserId(externalUserId: string): Promise<UserView | null> {
    const record = await this.db(PLATFORM_TABLES.users)
      .where({ external_user_id: externalUserId })
      .first<UserRecord | undefined>();
    return record ? toUserView(record) : null;
  }

  async findByExternalUserIds(externalUserIds: string[]): Promise<UserView[]> {
    if (externalUserIds.length === 0) {
      return [];
    }

    const records = await this.db(PLATFORM_TABLES.users)
      .whereIn("external_user_id", externalUserIds)
      .select<UserRecord[]>("*");
    return records.map(toUserView);
  }

  async listAll(): Promise<UserView[]> {
    const records = await this.db(PLATFORM_TABLES.users)
      .orderBy("created_at", "desc")
      .select<UserRecord[]>("*");
    return records.map(toUserView);
  }

  async listPage(input: ListUsersPageInput): Promise<ListUsersPageResult> {
    const page = Math.max(1, input.page);
    const pageSize = Math.max(1, Math.min(input.pageSize, 100));
    const baseQuery = this.db(PLATFORM_TABLES.users);
    this.applyListSearch(baseQuery, input.search);

    const totalRow = await baseQuery.clone().count<{ count: number | string }>({ count: "id" }).first();
    const total = Number(totalRow?.count ?? 0);
    const records = await baseQuery
      .clone()
      .orderBy("created_at", "desc")
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .select<UserRecord[]>("*");

    return {
      data: records.map(toUserView),
      total,
      page,
      pageSize,
    };
  }

  async listBoundHumanEmployeeIds(): Promise<string[]> {
    const records = await this.db(PLATFORM_TABLES.users)
      .whereNotNull("human_employee_id")
      .select<Array<Pick<UserRecord, "human_employee_id">>>("human_employee_id");

    return records
      .map((record) => record.human_employee_id)
      .filter((humanEmployeeId): humanEmployeeId is string => Boolean(humanEmployeeId));
  }

  async listBoundHumanEmployeeBindings(): Promise<Array<{ userId: string; humanEmployeeId: string }>> {
    const records = await this.db(PLATFORM_TABLES.users)
      .whereNotNull("human_employee_id")
      .select<Array<Pick<UserRecord, "id" | "human_employee_id">>>("id", "human_employee_id");

    return records.flatMap((record) => {
      if (!record.human_employee_id) {
        return [];
      }

      return [{ userId: record.id, humanEmployeeId: record.human_employee_id }];
    });
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<UserView | null> {
    const now = dbNow();
    const updates: Partial<UserRecord> = { updated_at: now };

    if (input.role !== undefined) updates.role = input.role;
    if (input.isActive !== undefined) updates.is_active = input.isActive ? 1 : 0;
    if (input.username !== undefined) updates.username = input.username;
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.email !== undefined) updates.email = input.email;
    if (input.humanEmployeeId !== undefined) updates.human_employee_id = input.humanEmployeeId;
    if (input.departmentId !== undefined) updates.department_id = input.departmentId;

    const count = await this.db(PLATFORM_TABLES.users).where({ id }).update(updates);
    if (count === 0) return null;

    return this.findById(id);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const record = await this.db(PLATFORM_TABLES.users)
      .where({ email })
      .first<UserRecord | undefined>();
    return record ?? null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const record = await this.db(PLATFORM_TABLES.users)
      .where({ username })
      .first<UserRecord | undefined>();
    return record ?? null;
  }

  async findExistingUsernames(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) {
      return [];
    }

    const records = await this.db(PLATFORM_TABLES.users)
      .whereIn("username", usernames)
      .select<Array<Pick<UserRecord, "username">>>("username");

    return records.map((record) => record.username).filter((username): username is string => Boolean(username));
  }

  async createLocalUser(input: {
    username: string;
    email?: string;
    displayName: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<UserContext> {
    const now = dbNow();
    const id = randomUUID();
    const record: UserRecord = {
      id,
      keycloak_sub: "",
      username: input.username,
      email: input.email ?? `${input.username}@local`,
      display_name: input.displayName,
      avatar_url: "",
      role: input.role ?? "user",
      is_active: 1,
      user_source: "manual",
      sync_provider: null,
      external_user_id: null,
      external_user_name: "",
      external_name: "",
      external_post_name: "",
      external_role_name: "",
      external_dingtalk_id: "",
      external_phone: "",
      external_user_type: "",
      department_id: null,
      human_employee_id: null,
      preferences: "{}",
      auth_provider: "local",
      password_hash: input.passwordHash,
      last_login_at: null,
      last_synced_at: null,
      created_at: now,
      updated_at: now,
    };
    await this.db(PLATFORM_TABLES.users).insert(record);
    return toUserContext(record);
  }

  async createSyncedUser(input: CreateSyncedUserInput): Promise<UserView> {
    const now = dbNow();
    const record = this.buildSyncedUserRecord(input, now);
    await this.db(PLATFORM_TABLES.users).insert(record);
    return toUserView(record);
  }

  async batchCreateSyncedUsers(inputs: CreateSyncedUserInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    const now = dbNow();
    const records = inputs.map((input) => this.buildSyncedUserRecord(input, now));
    await this.db(PLATFORM_TABLES.users).insert(records);
  }

  async updateSyncedUser(id: string, input: UpdateSyncedUserInput): Promise<UserView | null> {
    const now = dbNow();
    const updates: Partial<UserRecord> = {
      keycloak_sub: buildSyncedKeycloakSub(input.externalUserId),
      display_name: input.displayName,
      user_source: "sync",
      sync_provider: "personnel-api",
      auth_provider: "keycloak",
      external_user_name: input.externalUserName,
      external_name: input.externalName,
      external_post_name: input.externalPostName,
      external_role_name: input.externalRoleName,
      external_dingtalk_id: input.externalDingTalkId,
      external_phone: input.externalPhone,
      external_user_type: input.externalUserType,
      last_synced_at: now,
      updated_at: now,
    };

    if (input.humanEmployeeId !== undefined) {
      updates.human_employee_id = input.humanEmployeeId;
    }

    const count = await this.db(PLATFORM_TABLES.users)
      .where({ id })
      .update(updates);

    if (count === 0) {
      return null;
    }

    return this.findById(id);
  }

  async batchUpdateSyncedUsers(inputs: BatchUpdateSyncedUserInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    const now = dbNow();
    const ids = inputs.map((input) => input.id);
    const updates: Record<string, unknown> = {
      keycloak_sub: this.buildCaseExpression(inputs, "keycloak_sub", (input) => buildSyncedKeycloakSub(input.externalUserId)),
      display_name: this.buildCaseExpression(inputs, "display_name", (input) => input.displayName),
      user_source: "sync",
      sync_provider: "personnel-api",
      auth_provider: "keycloak",
      external_user_name: this.buildCaseExpression(inputs, "external_user_name", (input) => input.externalUserName),
      external_name: this.buildCaseExpression(inputs, "external_name", (input) => input.externalName),
      external_post_name: this.buildCaseExpression(inputs, "external_post_name", (input) => input.externalPostName),
      external_role_name: this.buildCaseExpression(inputs, "external_role_name", (input) => input.externalRoleName),
      external_dingtalk_id: this.buildCaseExpression(inputs, "external_dingtalk_id", (input) => input.externalDingTalkId),
      external_phone: this.buildCaseExpression(inputs, "external_phone", (input) => input.externalPhone),
      external_user_type: this.buildCaseExpression(inputs, "external_user_type", (input) => input.externalUserType),
      last_synced_at: now,
      updated_at: now,
    };

    const boundInputs = inputs.filter(
      (input): input is BatchUpdateSyncedUserInput & { humanEmployeeId: string | null } => input.humanEmployeeId !== undefined
    );
    if (boundInputs.length > 0) {
      updates.human_employee_id = this.buildCaseExpression(boundInputs, "human_employee_id", (input) => input.humanEmployeeId);
    }

    await this.db(PLATFORM_TABLES.users)
      .whereIn("id", ids)
      .update(updates);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db(PLATFORM_TABLES.users)
      .where({ id })
      .update({ last_login_at: dbNow(), updated_at: dbNow() });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db(PLATFORM_TABLES.users)
      .where({ id })
      .update({ password_hash: passwordHash, updated_at: dbNow() });
  }

  async deleteUser(id: string): Promise<boolean> {
    const count = await this.db(PLATFORM_TABLES.users).where({ id }).delete();
    return count > 0;
  }
}

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
};

function buildSyncedKeycloakSub(externalUserId: string): string {
  return `personnel-sync:${externalUserId}`;
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

  async listAll(): Promise<UserView[]> {
    const records = await this.db(PLATFORM_TABLES.users)
      .orderBy("created_at", "desc")
      .select<UserRecord[]>("*");
    return records.map(toUserView);
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
    const record: UserRecord = {
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
      human_employee_id: null,
      preferences: "{}",
      auth_provider: "keycloak",
      password_hash: null,
      last_login_at: null,
      last_synced_at: now,
      created_at: now,
      updated_at: now,
    };
    await this.db(PLATFORM_TABLES.users).insert(record);
    return toUserView(record);
  }

  async updateSyncedUser(id: string, input: UpdateSyncedUserInput): Promise<UserView | null> {
    const now = dbNow();
    const count = await this.db(PLATFORM_TABLES.users)
      .where({ id })
      .update({
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
      });

    if (count === 0) {
      return null;
    }

    return this.findById(id);
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

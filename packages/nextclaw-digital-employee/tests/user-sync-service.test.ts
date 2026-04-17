import type { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UserRepository } from "../server/repositories/user-repository";
import { performUserPersonnelSync } from "../server/services/user-sync-service";
import { cleanTestDatabase, createTestKnex, ensureTestDatabase } from "./test-db";

describe("performUserPersonnelSync", () => {
  let db: Knex;
  let userRepo: UserRepository;

  beforeEach(async () => {
    db = createTestKnex();
    await ensureTestDatabase(db);
    await cleanTestDatabase(db);
    userRepo = new UserRepository(db);
  });

  afterEach(async () => {
    await cleanTestDatabase(db);
    await db.destroy();
  });

  it("creates synced users and keeps existing manual users", async () => {
    const manualUser = await userRepo.createLocalUser({
      username: "local-admin",
      displayName: "本地管理员",
      passwordHash: "hash",
      role: "admin",
    });

    const result = await performUserPersonnelSync(db, [
      {
        userId: "external-001",
        userName: "zhangsan",
        name: "张三",
        postName: "工程师",
        roleName: "外部管理员",
        dingTalkId: "ding-001",
        phone: "13800138000",
        userType: "正式员工",
      },
    ]);

    expect(result).toMatchObject({
      total: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });

    const users = await userRepo.listAll();
    expect(users).toHaveLength(2);

    const syncedUser = users.find((user) => user.externalUserId === "external-001");
    expect(syncedUser).toBeTruthy();
    expect(syncedUser?.userSource).toBe("sync");
    expect(syncedUser?.authProvider).toBe("keycloak");
    expect(syncedUser?.role).toBe("user");
    expect(syncedUser?.displayName).toBe("张三");
    expect(syncedUser?.externalPostName).toBe("工程师");
    expect(syncedUser?.externalRoleName).toBe("外部管理员");
    expect(syncedUser?.lastSyncedAt).toBeTruthy();

    const manualUserAfterSync = users.find((user) => user.id === manualUser.id);
    expect(manualUserAfterSync?.userSource).toBe("manual");
    expect(manualUserAfterSync?.role).toBe("admin");
  });

  it("updates synced users by external user id and does not override platform role", async () => {
    await performUserPersonnelSync(db, [
      {
        userId: "external-001",
        userName: "zhangsan",
        name: "张三",
        postName: "工程师",
        roleName: "外部管理员",
        dingTalkId: "ding-001",
        phone: "13800138000",
        userType: "正式员工",
      },
    ]);

    const initialUser = await userRepo.findByExternalUserId("external-001");
    expect(initialUser).toBeTruthy();
    await userRepo.updateUser(initialUser!.id, { role: "manager" });

    const result = await performUserPersonnelSync(db, [
      {
        userId: "external-001",
        userName: "zhangsan-updated",
        name: "张三丰",
        postName: "架构师",
        roleName: "外部普通成员",
        dingTalkId: "ding-002",
        phone: "13900139000",
        userType: "顾问",
      },
      {
        userName: "missing-id",
        name: "无主键记录",
      },
    ]);

    expect(result).toMatchObject({
      total: 2,
      created: 0,
      updated: 1,
      skipped: 1,
      failed: 0,
    });

    const updatedUser = await userRepo.findByExternalUserId("external-001");
    expect(updatedUser?.displayName).toBe("张三丰");
    expect(updatedUser?.externalUserName).toBe("zhangsan-updated");
    expect(updatedUser?.externalPostName).toBe("架构师");
    expect(updatedUser?.externalRoleName).toBe("外部普通成员");
    expect(updatedUser?.externalDingTalkId).toBe("ding-002");
    expect(updatedUser?.externalPhone).toBe("13900139000");
    expect(updatedUser?.externalUserType).toBe("顾问");
    expect(updatedUser?.role).toBe("manager");
  });

  it("claims an existing synced user during SSO login instead of creating a duplicate", async () => {
    await performUserPersonnelSync(db, [
      {
        userId: "external-001",
        userName: "zhangsan",
        name: "张三",
        postName: "工程师",
        roleName: "外部管理员",
        dingTalkId: "ding-001",
        phone: "13800138000",
        userType: "正式员工",
      },
    ]);

    const syncedUser = await userRepo.findByExternalUserId("external-001");
    expect(syncedUser).toBeTruthy();

    const claimedUser = await userRepo.upsertFromToken({
      keycloakSub: "kc-sub-001",
      email: "zhangsan@example.com",
      displayName: "张三",
      identityHints: ["external-001", "zhangsan"],
    });

    expect(claimedUser.id).toBe(syncedUser?.id);

    const afterClaim = await userRepo.findById(syncedUser!.id);
    expect(afterClaim?.email).toBe("zhangsan@example.com");
    expect(afterClaim?.lastLoginAt).toBeTruthy();

    const claimedBySub = await userRepo.findByKeycloakSub("kc-sub-001");
    expect(claimedBySub?.id).toBe(syncedUser?.id);

    const users = await userRepo.listAll();
    expect(users).toHaveLength(1);
  });
});
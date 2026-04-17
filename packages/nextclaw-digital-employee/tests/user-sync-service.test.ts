import type { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HumanEmployeeRepository } from "../server/repositories/human-employee-repository";
import { UserRepository } from "../server/repositories/user-repository";
import { performUserPersonnelSync } from "../server/services/user-sync-service";
import { cleanTestDatabase, createTestKnex, ensureTestDatabase } from "./test-db";

let db: Knex;
let humanEmployeeRepo: HumanEmployeeRepository;
let userRepo: UserRepository;

beforeEach(async () => {
  db = createTestKnex();
  await ensureTestDatabase(db);
  await cleanTestDatabase(db);
  humanEmployeeRepo = new HumanEmployeeRepository(db);
  userRepo = new UserRepository(db);
});

afterEach(async () => {
  await cleanTestDatabase(db);
  await db.destroy();
});

describe("performUserPersonnelSync sync create-update binding", () => {
  it("creates synced users and keeps existing manual users", async () => {
    const manualUser = await userRepo.createLocalUser({
      username: "local-admin",
      displayName: "本地管理员",
      passwordHash: "hash",
      role: "admin",
    });
    const matchedEmployee = await humanEmployeeRepo.create({
      externalId: "ding-001",
      name: "张三",
      title: "工程师",
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
      autoBound: 1,
      unboundUsers: [],
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
    expect(syncedUser?.humanEmployeeId).toBe(matchedEmployee.id);
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
    const matchedEmployee = await humanEmployeeRepo.create({
      externalId: "ding-002",
      name: "张三丰",
      title: "架构师",
    });

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
      autoBound: 1,
    });

    const updatedUser = await userRepo.findByExternalUserId("external-001");
    expect(updatedUser?.displayName).toBe("张三丰");
    expect(updatedUser?.externalUserName).toBe("zhangsan-updated");
    expect(updatedUser?.externalPostName).toBe("架构师");
    expect(updatedUser?.externalRoleName).toBe("外部普通成员");
    expect(updatedUser?.externalDingTalkId).toBe("ding-002");
    expect(updatedUser?.externalPhone).toBe("13900139000");
    expect(updatedUser?.externalUserType).toBe("顾问");
    expect(updatedUser?.humanEmployeeId).toBe(matchedEmployee.id);
    expect(updatedUser?.role).toBe("manager");
  });
});

describe("performUserPersonnelSync unmatched and union binding", () => {
  it("reports unmatched synced users when no automatic association can be made", async () => {
    const occupiedEmployee = await humanEmployeeRepo.create({
      externalId: "ding-occupied",
      name: "已被占用员工",
      title: "经理",
    });
    const manualUser = await userRepo.createLocalUser({
      username: "occupied-owner",
      displayName: "占用者",
      passwordHash: "hash",
    });
    await userRepo.updateUser(manualUser.id, { humanEmployeeId: occupiedEmployee.id });

    const result = await performUserPersonnelSync(db, [
      {
        userId: "external-101",
        userName: "lisi",
        name: "李四",
        dingTalkId: "ding-missing",
      },
      {
        userId: "external-102",
        userName: "wangwu",
        name: "王五",
        dingTalkId: "ding-occupied",
      },
    ]);

    expect(result).toMatchObject({
      total: 2,
      created: 2,
      updated: 0,
      skipped: 0,
      failed: 0,
      autoBound: 0,
    });
    expect(result.unboundUsers).toEqual([
      { name: "李四", dingTalkId: "ding-missing" },
      { name: "王五", dingTalkId: "ding-occupied" },
    ]);

    const unmatchedUsers = await Promise.all([
      userRepo.findByExternalUserId("external-101"),
      userRepo.findByExternalUserId("external-102"),
    ]);
    expect(unmatchedUsers[0]?.humanEmployeeId).toBeNull();
    expect(unmatchedUsers[1]?.humanEmployeeId).toBeNull();
  });

  it("auto binds when personnel dingTalkId matches employee unionid", async () => {
    const matchedEmployee = await humanEmployeeRepo.create({
      externalId: "ding-userid-003",
      unionid: "ding-union-003",
      name: "赵六",
      title: "产品经理",
    });

    const result = await performUserPersonnelSync(db, [
      {
        userId: "external-003",
        userName: "zhaoliu",
        name: "赵六",
        dingTalkId: "ding-union-003",
      },
    ]);

    expect(result).toMatchObject({
      total: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      autoBound: 1,
      unboundUsers: [],
    });

    const syncedUser = await userRepo.findByExternalUserId("external-003");
    expect(syncedUser?.humanEmployeeId).toBe(matchedEmployee.id);
  });
});

describe("performUserPersonnelSync identity claim", () => {
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
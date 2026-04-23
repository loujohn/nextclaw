import { describe, expect, it } from "vitest";
import { createTestKnex, ensureTestDatabase } from "./test-db";
import { IdentityResolver } from "../server/services/identity-resolver";
import { DepartmentRepository } from "../server/repositories/department-repository";
import { HumanEmployeeRepository } from "../server/repositories/human-employee-repository";
import { PLATFORM_TABLES } from "../server/db/schema";

describe("IdentityResolver", () => {
  describe("resolve", () => {
    it("returns identity for known sender with department", async () => {
      const db = createTestKnex();
      await ensureTestDatabase(db);

      const deptRepo = new DepartmentRepository(db);
      const humanRepo = new HumanEmployeeRepository(db);

      const dept = await deptRepo.create({ name: "技术部" });
      await humanRepo.create({
        externalId: "staff-001",
        name: "张三",
        title: "高级工程师",
        departmentId: dept.id,
      });
      await db(PLATFORM_TABLES.users).insert({
        id: "user-identity-001",
        keycloak_sub: "personnel-sync:external-001",
        username: "zhangsan",
        email: "zhangsan@example.com",
        display_name: "张三",
        avatar_url: "",
        role: "user",
        is_active: 1,
        user_source: "sync",
        sync_provider: "personnel-api",
        external_user_id: "external-001",
        external_user_name: "zhangsan-ext",
        external_name: "张三",
        external_post_name: "高级工程师",
        external_role_name: "成员",
        external_dingtalk_id: "staff-001",
        external_phone: "",
        external_user_type: "正式员工",
        department_id: dept.id,
        human_employee_id: null,
        preferences: "{}",
        auth_provider: "keycloak",
        password_hash: null,
        last_login_at: null,
        last_synced_at: "2026-04-23 00:00:00",
        created_at: "2026-04-23 00:00:00",
        updated_at: "2026-04-23 00:00:00",
      });

      const resolver = new IdentityResolver(db);
      const result = await resolver.resolve("staff-001");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("张三");
      expect(result!.username).toBe("zhangsan");
      expect(result!.department).toBe("技术部");
      expect(result!.title).toBe("高级工程师");
      expect(result!.externalId).toBe("staff-001");
      await db.destroy();
    });

    it("returns username from users table when sender only exists in users", async () => {
      const db = createTestKnex();
      await ensureTestDatabase(db);

      await db(PLATFORM_TABLES.users).insert({
        id: "user-identity-002",
        keycloak_sub: "personnel-sync:external-002",
        username: "lisi",
        email: "lisi@example.com",
        display_name: "李四",
        avatar_url: "",
        role: "user",
        is_active: 1,
        user_source: "sync",
        sync_provider: "personnel-api",
        external_user_id: "external-002",
        external_user_name: "lisi-ext",
        external_name: "李四",
        external_post_name: "产品经理",
        external_role_name: "成员",
        external_dingtalk_id: "ding-002",
        external_phone: "",
        external_user_type: "正式员工",
        department_id: null,
        human_employee_id: null,
        preferences: "{}",
        auth_provider: "keycloak",
        password_hash: null,
        last_login_at: null,
        last_synced_at: "2026-04-23 00:00:00",
        created_at: "2026-04-23 00:00:00",
        updated_at: "2026-04-23 00:00:00",
      });

      const resolver = new IdentityResolver(db);
      const result = await resolver.resolve("ding-002");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("李四");
      expect(result!.username).toBe("lisi");
      expect(result!.title).toBe("产品经理");
      expect(result!.externalId).toBe("ding-002");
      await db.destroy();
    });

    it("returns null for unknown sender", async () => {
      const db = createTestKnex();
      await ensureTestDatabase(db);

      const resolver = new IdentityResolver(db);
      const result = await resolver.resolve("nonexistent");
      expect(result).toBeNull();
      await db.destroy();
    });

    it("returns identity without department when department_id is null", async () => {
      const db = createTestKnex();
      await ensureTestDatabase(db);

      const humanRepo = new HumanEmployeeRepository(db);
      await humanRepo.create({
        externalId: "staff-no-dept",
        name: "无部门用户",
        title: "实习生",
      });

      const resolver = new IdentityResolver(db);
      const result = await resolver.resolve("staff-no-dept");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("无部门用户");
      expect(result!.department).toBeUndefined();
      expect(result!.title).toBe("实习生");
      await db.destroy();
    });
  });

  describe("resolveByName", () => {
    it("returns all matches for a name", async () => {
      const db = createTestKnex();
      await ensureTestDatabase(db);

      const deptRepo = new DepartmentRepository(db);
      const humanRepo = new HumanEmployeeRepository(db);

      const dept = await deptRepo.create({ name: "技术部" });
      await humanRepo.create({ externalId: "staff-a", name: "张三", title: "工程师", departmentId: dept.id });
      await humanRepo.create({ externalId: "staff-b", name: "张三", title: "设计师" });

      const resolver = new IdentityResolver(db);
      const results = await resolver.resolveByName("张三");
      expect(results.length).toBe(2);
      expect(results.map((r) => r.externalId).sort()).toEqual(["staff-a", "staff-b"]);
      await db.destroy();
    });

    it("returns empty array for no match", async () => {
      const db = createTestKnex();
      await ensureTestDatabase(db);

      const resolver = new IdentityResolver(db);
      const results = await resolver.resolveByName("不存在");
      expect(results).toEqual([]);
      await db.destroy();
    });

    it("returns single match for unique name", async () => {
      const db = createTestKnex();
      await ensureTestDatabase(db);

      const humanRepo = new HumanEmployeeRepository(db);
      await humanRepo.create({
        externalId: "staff-unique",
        name: "李四",
        title: "产品经理",
      });

      const resolver = new IdentityResolver(db);
      const results = await resolver.resolveByName("李四");
      expect(results.length).toBe(1);
      expect(results[0].externalId).toBe("staff-unique");
      expect(results[0].name).toBe("李四");
      await db.destroy();
    });
  });
});

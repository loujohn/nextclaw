import { describe, expect, it } from "vitest";
import { createTestKnex, ensureTestDatabase } from "./test-db";
import { IdentityResolver } from "../server/services/identity-resolver";
import { DepartmentRepository } from "../server/repositories/department-repository";
import { HumanEmployeeRepository } from "../server/repositories/human-employee-repository";

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

      const resolver = new IdentityResolver(db);
      const result = await resolver.resolve("staff-001");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("张三");
      expect(result!.department).toBe("技术部");
      expect(result!.title).toBe("高级工程师");
      expect(result!.externalId).toBe("staff-001");
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

import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createTestKnex, ensureTestDatabase } from "./test-db";
import { DepartmentRepository } from "../server/repositories/department-repository";
import { EmployeeRepository } from "../server/repositories/employee-repository";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("DepartmentRepository - CRUD", () => {
  it("creates and retrieves a department", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    const dept = await repo.create({ name: "技术部", description: "负责技术研发", createdByUserId: "user-admin-1" });
    expect(dept.name).toBe("技术部");
    expect(dept.description).toBe("负责技术研发");
    expect(dept.parentId).toBeNull();
    expect(dept.createdByUserId).toBe("user-admin-1");
    expect(dept.updatedByUserId).toBe("user-admin-1");

    const found = await repo.getById(dept.id);
    expect(found?.name).toBe("技术部");
    await db.destroy();
  });

  it("lists departments ordered by sort_order", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    await repo.create({ name: "产品部", sortOrder: 2 });
    await repo.create({ name: "技术部", sortOrder: 1 });
    await repo.create({ name: "运营部", sortOrder: 3 });

    const list = await repo.list();
    expect(list[0].name).toBe("技术部");
    expect(list[1].name).toBe("产品部");
    expect(list[2].name).toBe("运营部");
    await db.destroy();
  });

  it("creates nested departments (parent-child)", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    const parent = await repo.create({ name: "技术部" });
    const child = await repo.create({ name: "前端组", parentId: parent.id });

    expect(child.parentId).toBe(parent.id);

    const descendants = await repo.getAllDescendantIds(parent.id);
    expect(descendants).toContain(child.id);
    await db.destroy();
  });

  it("updates a department name and description", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    const dept = await repo.create({ name: "旧名称" });
    const updated = await repo.updateById(dept.id, { name: "新名称", description: "新描述", updatedByUserId: "user-manager-2" });

    expect(updated?.name).toBe("新名称");
    expect(updated?.description).toBe("新描述");
    expect(updated?.updatedByUserId).toBe("user-manager-2");
    await db.destroy();
  });

  it("deletes a department without employees", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    const dept = await repo.create({ name: "临时部门" });
    const deleted = await repo.deleteById(dept.id);
    expect(deleted).toBe(true);

    const found = await repo.getById(dept.id);
    expect(found).toBeNull();
    await db.destroy();
  });
});

describe("DepartmentRepository - 删除保护（有员工时不可删除）", () => {
  it("countEmployees returns 0 when no employees in dept", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    const dept = await repo.create({ name: "空部门" });
    const count = await repo.countEmployees(dept.id);
    expect(count).toBe(0);
    await db.destroy();
  });

  it("countEmployees returns correct count when employees are assigned", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const deptRepo = new DepartmentRepository(db);
    const empRepo = new EmployeeRepository(db);

    const dept = await deptRepo.create({ name: "技术部" });
    await empRepo.create({
      name: "张三",
      code: "zhang-san",
      description: "开发人员",
      systemPrompt: "你是开发助手",
      departmentId: dept.id
    });
    await empRepo.create({
      name: "李四",
      code: "li-si",
      description: "测试人员",
      systemPrompt: "你是测试助手",
      departmentId: dept.id
    });

    const count = await deptRepo.countEmployees(dept.id);
    expect(count).toBe(2);
    await db.destroy();
  });
});

describe("EmployeeRepository - departmentId 支持", () => {
  it("creates an employee with departmentId", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const deptRepo = new DepartmentRepository(db);
    const empRepo = new EmployeeRepository(db);

    const dept = await deptRepo.create({ name: "技术部" });
    const emp = await empRepo.create({
      name: "员工A",
      code: "employee-a",
      description: "测试员工",
      systemPrompt: "系统提示",
      departmentId: dept.id
    });

    expect(emp.departmentId).toBe(dept.id);

    const found = await empRepo.getById(emp.id);
    expect(found?.departmentId).toBe(dept.id);
    await db.destroy();
  });

  it("filters employees by departmentId", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const deptRepo = new DepartmentRepository(db);
    const empRepo = new EmployeeRepository(db);

    const deptA = await deptRepo.create({ name: "部门A" });
    const deptB = await deptRepo.create({ name: "部门B" });

    await empRepo.create({ name: "A员工1", code: "a-emp-1", description: "", systemPrompt: "", departmentId: deptA.id });
    await empRepo.create({ name: "A员工2", code: "a-emp-2", description: "", systemPrompt: "", departmentId: deptA.id });
    await empRepo.create({ name: "B员工1", code: "b-emp-1", description: "", systemPrompt: "", departmentId: deptB.id });
    await empRepo.create({ name: "无部门员工", code: "no-dept", description: "", systemPrompt: "" });

    const allEmps = await empRepo.list();
    expect(allEmps.length).toBe(4);

    const deptAEmps = await empRepo.list({ departmentId: deptA.id });
    expect(deptAEmps.length).toBe(2);
    expect(deptAEmps.every(e => e.departmentId === deptA.id)).toBe(true);

    const noDeptEmps = await empRepo.list({ departmentId: null });
    expect(noDeptEmps.length).toBe(1);
    expect(noDeptEmps[0].name).toBe("无部门员工");
    await db.destroy();
  });

  it("updates employee departmentId", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const deptRepo = new DepartmentRepository(db);
    const empRepo = new EmployeeRepository(db);

    const dept = await deptRepo.create({ name: "目标部门" });
    const emp = await empRepo.create({ name: "待分配员工", code: "emp-reassign", description: "", systemPrompt: "" });
    expect(emp.departmentId).toBeNull();

    const updated = await empRepo.updateById(emp.id, {
      name: emp.name,
      description: emp.description,
      systemPrompt: emp.systemPrompt,
      departmentId: dept.id
    });
    expect(updated?.departmentId).toBe(dept.id);
    await db.destroy();
  });
});

describe("DepartmentRepository - 树形结构辅助", () => {
  it("getAllDescendantIds returns all nested children", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    const root = await repo.create({ name: "总部" });
    const child1 = await repo.create({ name: "技术部", parentId: root.id });
    const child2 = await repo.create({ name: "产品部", parentId: root.id });
    const grandchild = await repo.create({ name: "前端组", parentId: child1.id });

    const descendants = await repo.getAllDescendantIds(root.id);
    expect(descendants).toContain(child1.id);
    expect(descendants).toContain(child2.id);
    expect(descendants).toContain(grandchild.id);
    expect(descendants.length).toBe(3);
    await db.destroy();
  });

  it("getAllDescendantIds returns empty for leaf node", async () => {
    const db = createTestKnex();
    await ensureTestDatabase(db);
    const repo = new DepartmentRepository(db);

    const dept = await repo.create({ name: "叶子部门" });
    const descendants = await repo.getAllDescendantIds(dept.id);
    expect(descendants.length).toBe(0);
    await db.destroy();
  });
});

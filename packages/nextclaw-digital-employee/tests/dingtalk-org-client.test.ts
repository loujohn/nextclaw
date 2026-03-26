import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DingTalkOrgClient } from "../server/integrations/dingtalk-org-client";

// ─── fetch mock 工具 ────────────────────────────────────────────────────────

function mockFetchOnce(body: object, status = 200): void {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
}

// ─── 测试 ────────────────────────────────────────────────────────────────────

describe("DingTalkOrgClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  // ── 工厂方法 ──────────────────────────────────────────────────────────────

  describe("DingTalkOrgClient.create()", () => {
    it("成功获取 access_token 并返回实例", async () => {
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "token-123" });

      const client = await DingTalkOrgClient.create("appkey", "appsecret");
      expect(client).toBeInstanceOf(DingTalkOrgClient);

      const call = vi.mocked(fetch).mock.calls[0];
      expect(call[0]).toContain("gettoken");
      expect(call[0]).toContain("appkey=appkey");
      expect(call[0]).toContain("appsecret=appsecret");
    });

    it("errcode 非 0 时抛出错误", async () => {
      mockFetchOnce({ errcode: 40035, errmsg: "invalid app key" });
      await expect(DingTalkOrgClient.create("bad-key", "bad-secret")).rejects.toThrow(
        "获取 AccessToken 失败"
      );
    });

    it("HTTP 非 2xx 时抛出错误", async () => {
      mockFetchOnce({}, 500);
      await expect(DingTalkOrgClient.create("appkey", "appsecret")).rejects.toThrow(
        "获取 AccessToken 失败"
      );
    });
  });

  // ── getDepartmentList ─────────────────────────────────────────────────────

  describe("getDepartmentList()", () => {
    it("返回子部门列表", async () => {
      // Mock create
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });
      // Mock getDepartmentList
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: [
          { dept_id: 100, name: "技术部", parent_id: 1 },
          { dept_id: 200, name: "产品部", parent_id: 1 }
        ]
      });

      const client = await DingTalkOrgClient.create("k", "s");
      const depts = await client.getDepartmentList(1);

      expect(depts).toHaveLength(2);
      expect(depts[0].name).toBe("技术部");
      expect(depts[1].dept_id).toBe(200);
    });

    it("接口错误时抛出错误", async () => {
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });
      mockFetchOnce({ errcode: 60011, errmsg: "no permission" });

      const client = await DingTalkOrgClient.create("k", "s");
      await expect(client.getDepartmentList(999)).rejects.toThrow("获取部门列表失败");
    });
  });

  // ── getDepartmentUsers ────────────────────────────────────────────────────

  describe("getDepartmentUsers()", () => {
    it("返回分页用户列表", async () => {
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: {
          list: [{ userid: "u001" }, { userid: "u002" }],
          has_more: false,
          next_cursor: 0
        }
      });

      const client = await DingTalkOrgClient.create("k", "s");
      const page = await client.getDepartmentUsers(100);

      expect(page.list).toHaveLength(2);
      expect(page.list[0].userid).toBe("u001");
      expect(page.has_more).toBe(false);
    });
  });

  // ── getUserDetail ─────────────────────────────────────────────────────────

  describe("getUserDetail()", () => {
    it("返回用户详情", async () => {
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: {
          userid: "u001",
          name: "张三",
          title: "工程师",
          dept_id_list: [100],
          active: true
        }
      });

      const client = await DingTalkOrgClient.create("k", "s");
      const user = await client.getUserDetail("u001");

      expect(user?.name).toBe("张三");
      expect(user?.title).toBe("工程师");
      expect(user?.dept_id_list).toContain(100);
    });

    it("用户不存在时返回 null", async () => {
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });
      mockFetchOnce({ errcode: 60121, errmsg: "user not exist" });

      const client = await DingTalkOrgClient.create("k", "s");
      const user = await client.getUserDetail("nonexistent");
      expect(user).toBeNull();
    });
  });

  // ── getAllDepartmentsRecursive ─────────────────────────────────────────────

  describe("getAllDepartmentsRecursive()", () => {
    it("递归构建两层部门树", async () => {
      // create
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });
      // 根目录 (1) 的子部门
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: [{ dept_id: 100, name: "技术部", parent_id: 1 }]
      });
      // 技术部 (100) 的子部门
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: [{ dept_id: 101, name: "前端组", parent_id: 100 }]
      });
      // 前端组 (101) 无子部门
      mockFetchOnce({ errcode: 0, errmsg: "ok", result: [] });

      const client = await DingTalkOrgClient.create("k", "s");
      const tree = await client.getAllDepartmentsRecursive();

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe("技术部");
      expect(tree[0].sub_depts).toHaveLength(1);
      expect(tree[0].sub_depts[0].name).toBe("前端组");
      expect(tree[0].sub_depts[0].path).toEqual(["技术部", "前端组"]);
    });

    it("无子部门时返回空数组", async () => {
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });
      mockFetchOnce({ errcode: 0, errmsg: "ok", result: [] });

      const client = await DingTalkOrgClient.create("k", "s");
      const tree = await client.getAllDepartmentsRecursive();
      expect(tree).toEqual([]);
    });
  });

  // ── fetchAllOrgData ───────────────────────────────────────────────────────

  describe("fetchAllOrgData()", () => {
    it("返回完整的部门树与用户详情", async () => {
      // 1. create (gettoken)
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });

      // 2. getAllDepartmentsRecursive: 根 (1) -> [技术部(100)]
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: [{ dept_id: 100, name: "技术部", parent_id: 1 }]
      });
      // 3. 技术部(100) -> 无子部门
      mockFetchOnce({ errcode: 0, errmsg: "ok", result: [] });

      // 4. getDepartmentUsers(100) -> u001
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { list: [{ userid: "u001" }], has_more: false, next_cursor: 0 }
      });

      // 5. getUserDetail(u001)
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: {
          userid: "u001",
          name: "李四",
          title: "产品经理",
          dept_id_list: [100],
          active: true,
          admin: false,
          boss: false
        }
      });

      const client = await DingTalkOrgClient.create("k", "s");
      const data = await client.fetchAllOrgData();

      expect(data.departments).toHaveLength(1);
      expect(data.departments[0].name).toBe("技术部");
      expect(Object.keys(data.users)).toHaveLength(1);
      expect(data.users["u001"].name).toBe("李四");
      expect(data.users["u001"].dept_id_list).toContain(100);
    });

    it("同一用户在多个部门中只获取一次详情", async () => {
      // create
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });

      // getDepartmentList(1) -> [部门A(100), 部门B(200)]
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: [
          { dept_id: 100, name: "部门A", parent_id: 1 },
          { dept_id: 200, name: "部门B", parent_id: 1 }
        ]
      });
      // 部门A 无子部门
      mockFetchOnce({ errcode: 0, errmsg: "ok", result: [] });
      // 部门B 无子部门
      mockFetchOnce({ errcode: 0, errmsg: "ok", result: [] });

      // 部门A 用户列表 -> u001
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { list: [{ userid: "u001" }], has_more: false, next_cursor: 0 }
      });
      // u001 详情（只应调用一次）
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { userid: "u001", name: "共享用户", dept_id_list: [100, 200] }
      });

      // 部门B 用户列表 -> u001（同一用户）
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { list: [{ userid: "u001" }], has_more: false, next_cursor: 0 }
      });
      // 注意：不再有 getUserDetail 的 mock，验证 u001 只被拉取一次

      const client = await DingTalkOrgClient.create("k", "s");
      const data = await client.fetchAllOrgData();

      // 只有 1 个用户，且 fetch 没有因重复调用而报错
      expect(Object.keys(data.users)).toHaveLength(1);
      expect(data.users["u001"].name).toBe("共享用户");
    });

    it("分页拉取用户（has_more=true）", async () => {
      // create
      mockFetchOnce({ errcode: 0, errmsg: "ok", access_token: "tok" });

      // getDepartmentList(1) -> [技术部(100)]
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: [{ dept_id: 100, name: "技术部", parent_id: 1 }]
      });
      // 技术部无子部门
      mockFetchOnce({ errcode: 0, errmsg: "ok", result: [] });

      // 第一页 -> u001, has_more=true, next_cursor=100
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { list: [{ userid: "u001" }], has_more: true, next_cursor: 100 }
      });
      // u001 详情
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { userid: "u001", name: "第一页用户", dept_id_list: [100] }
      });

      // 第二页 -> u002, has_more=false
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { list: [{ userid: "u002" }], has_more: false, next_cursor: 0 }
      });
      // u002 详情
      mockFetchOnce({
        errcode: 0,
        errmsg: "ok",
        result: { userid: "u002", name: "第二页用户", dept_id_list: [100] }
      });

      const client = await DingTalkOrgClient.create("k", "s");
      const data = await client.fetchAllOrgData();

      expect(Object.keys(data.users)).toHaveLength(2);
      expect(data.users["u001"].name).toBe("第一页用户");
      expect(data.users["u002"].name).toBe("第二页用户");
    });
  });
});

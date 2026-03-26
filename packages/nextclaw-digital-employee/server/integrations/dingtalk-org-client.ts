/**
 * DingTalk Org Client — TypeScript 实现
 * 对应原 scripts/dingtalk-org-sync.py 的功能，用于拉取钉钉组织架构数据。
 */

const DINGTALK_BASE = "https://oapi.dingtalk.com";

// ─── 钉钉 API 响应类型 ──────────────────────────────────────────────────────

type DingTalkApiResponse<T = undefined> = {
  errcode: number;
  errmsg: string;
  result?: T;
  access_token?: string;
};

type DingTalkDeptItem = {
  dept_id: number;
  name: string;
  parent_id: number;
};

type DingTalkUserListItem = {
  userid: string;
};

type DingTalkUserListResult = {
  list: DingTalkUserListItem[];
  has_more: boolean;
  next_cursor: number;
};

export type DingTalkUserDetail = {
  userid: string;
  name: string;
  avatar?: string;
  active?: boolean;
  admin?: boolean;
  boss?: boolean;
  title?: string;
  job_number?: string;
  dept_id_list?: number[];
  unionid?: string;
};

export type DingTalkDeptNode = {
  dept_id: number;
  name: string;
  parent_id: number;
  path: string[];
  sub_depts: DingTalkDeptNode[];
};

export type DingTalkOrgData = {
  departments: DingTalkDeptNode[];
  users: Record<string, DingTalkUserDetail>;
};

// ─── 客户端实现 ──────────────────────────────────────────────────────────────

export class DingTalkOrgClient {
  private readonly accessToken: string;

  private constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /** 工厂方法：获取 AccessToken 并返回实例 */
  static async create(appKey: string, appSecret: string): Promise<DingTalkOrgClient> {
    const url = new URL(`${DINGTALK_BASE}/gettoken`);
    url.searchParams.set("appkey", appKey);
    url.searchParams.set("appsecret", appSecret);

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      throw new Error(`获取 AccessToken 失败：HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as DingTalkApiResponse;
    if (data.errcode !== 0 || !data.access_token) {
      throw new Error(`获取 AccessToken 失败：${data.errmsg ?? JSON.stringify(data)}`);
    }
    return new DingTalkOrgClient(data.access_token);
  }

  /** 获取子部门列表 */
  async getDepartmentList(deptId: number = 1): Promise<DingTalkDeptItem[]> {
    const url = `${DINGTALK_BASE}/topapi/v2/department/listsub?access_token=${this.accessToken}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dept_id: deptId, language: "zh_CN" })
    });
    if (!resp.ok) {
      throw new Error(`获取部门列表失败 (dept_id=${deptId})：HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as DingTalkApiResponse<DingTalkDeptItem[]>;
    if (data.errcode !== 0) {
      throw new Error(`获取部门列表失败 (dept_id=${deptId})：${data.errmsg}`);
    }
    return data.result ?? [];
  }

  /** 获取部门用户列表（带分页） */
  async getDepartmentUsers(
    deptId: number,
    cursor: number = 0,
    size: number = 100
  ): Promise<DingTalkUserListResult> {
    const url = `${DINGTALK_BASE}/topapi/v2/user/list?access_token=${this.accessToken}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dept_id: deptId, cursor, size, language: "zh_CN" })
    });
    if (!resp.ok) {
      throw new Error(`获取部门用户失败 (dept_id=${deptId})：HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as DingTalkApiResponse<DingTalkUserListResult>;
    if (data.errcode !== 0) {
      throw new Error(`获取部门用户失败 (dept_id=${deptId})：${data.errmsg}`);
    }
    return data.result ?? { list: [], has_more: false, next_cursor: 0 };
  }

  /** 获取用户详情 */
  async getUserDetail(userid: string): Promise<DingTalkUserDetail | null> {
    const url = `${DINGTALK_BASE}/topapi/v2/user/get?access_token=${this.accessToken}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userid, language: "zh_CN" })
    });
    if (!resp.ok) {
      throw new Error(`获取用户详情失败 (userid=${userid})：HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as DingTalkApiResponse<DingTalkUserDetail>;
    if (data.errcode !== 0) {
      // 用户不存在时返回 null，不抛错
      return null;
    }
    return data.result ?? null;
  }

  /** 递归获取所有部门，构建树结构 */
  async getAllDepartmentsRecursive(
    deptId: number = 1,
    parentPath: string[] = []
  ): Promise<DingTalkDeptNode[]> {
    const subDepts = await this.getDepartmentList(deptId);
    const result: DingTalkDeptNode[] = [];

    for (const dept of subDepts) {
      const node: DingTalkDeptNode = {
        dept_id: dept.dept_id,
        name: dept.name,
        parent_id: dept.parent_id,
        path: [...parentPath, dept.name],
        sub_depts: []
      };
      node.sub_depts = await this.getAllDepartmentsRecursive(dept.dept_id, node.path);
      result.push(node);
    }

    return result;
  }

  /**
   * 拉取完整组织架构数据（部门树 + 用户详情）。
   * 对应 Python 脚本的 get_all_users() 输出（去掉了 dept_user_map，sync API 不需要）。
   */
  async fetchAllOrgData(): Promise<DingTalkOrgData> {
    // 1. 获取完整部门树
    const departments = await this.getAllDepartmentsRecursive();

    // 2. BFS 展平所有部门
    const allDepts: DingTalkDeptNode[] = [];
    const queue = [...departments];
    while (queue.length > 0) {
      const dept = queue.shift()!;
      allDepts.push(dept);
      queue.push(...dept.sub_depts);
    }

    // 3. 遍历每个部门获取用户（分页），并对每个用户获取详情（去重）
    const users: Record<string, DingTalkUserDetail> = {};

    for (const dept of allDepts) {
      let cursor = 0;

      while (true) {
        const page = await this.getDepartmentUsers(dept.dept_id, cursor);
        const userItems = page.list ?? [];

        for (const item of userItems) {
          const userid = item.userid;
          if (userid && !(userid in users)) {
            const detail = await this.getUserDetail(userid);
            if (detail) {
              users[userid] = detail;
            } else {
              // 详情获取失败，用简化信息占位（保证不重复拉取）
              users[userid] = { userid, name: "" };
            }
          }
        }

        if (!page.has_more) break;
        cursor = page.next_cursor ?? 0;

        // 避免触发钉钉频率限制
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return { departments, users };
  }
}

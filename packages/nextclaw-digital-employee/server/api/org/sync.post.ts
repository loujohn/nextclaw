import { randomUUID } from "node:crypto";
import { createError, readBody } from "h3";
import { PLATFORM_TABLES } from "../../db/schema";
import { getPlatformContext } from "../../runtime/platform-context";

// ─── 钉钉组织数据类型 ──────────────────────────────────────────────────────────

type OrgDeptNode = {
  dept_id: number;
  name: string;
  parent_id: number; // 1 = 组织根节点（不在数据库中创建）
  path?: string[];
  sub_depts?: OrgDeptNode[];
};

type OrgUser = {
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

type OrgSyncBody = {
  departments?: OrgDeptNode[];
  users?: Record<string, OrgUser>;
};

// ─── 辅助：BFS 展平部门树（保证父节点先于子节点，维持插入顺序） ─────────────

type FlatDept = OrgDeptNode & { _sortIndex: number };

function flattenDepartments(roots: OrgDeptNode[]): FlatDept[] {
  const result: FlatDept[] = [];
  const queue: OrgDeptNode[] = [...roots];
  let idx = 0;
  while (queue.length > 0) {
    const dept = queue.shift()!;
    result.push({ ...dept, _sortIndex: idx++ });
    if (dept.sub_depts && dept.sub_depts.length > 0) {
      queue.push(...dept.sub_depts);
    }
  }
  return result;
}

// ─── API Handler ─────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const body = await readBody<OrgSyncBody>(event);

  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "request body is required" });
  }

  const rawDepts = Array.isArray(body.departments) ? body.departments : [];
  const rawUsers: Record<string, OrgUser> = body.users && typeof body.users === "object" ? body.users : {};

  const ctx = await getPlatformContext();
  const db = ctx.db;

  // ── Step 1: 展平部门树 ────────────────────────────────────────────────────
  const flatDepts = flattenDepartments(rawDepts);
  const newExternalIds = new Set(flatDepts.map((d) => String(d.dept_id)));

  // ── Step 2: 加载现有部门的 externalId → UUID 映射，保持稳定 UUID ─────────
  const existingDeptMap = await ctx.departmentRepo.mapByExternalId();
  // 现有部门中 externalId 不在新数据集中的部门将被删除
  const removedDeptIds = [...existingDeptMap.values()]
    .filter((d) => !newExternalIds.has(d.externalId!))
    .map((d) => d.id);
  // 此外，手动创建（externalId 为 null）的部门也一并清除
  const manualDepts = await db<{ id: string }>(PLATFORM_TABLES.departments)
    .whereNull("external_id")
    .select("id");
  const manualDeptIds = manualDepts.map((d) => d.id);
  const allRemovedDeptIds = [...removedDeptIds, ...manualDeptIds];

  const now = new Date().toISOString();

  // ── Step 3: 在事务中执行同步 ──────────────────────────────────────────────
  let deptCreated = 0;
  let deptUpdated = 0;
  let humanCreated = 0;
  let digitalReassigned = 0;

  await db.transaction(async (trx) => {
    // 3a. 对"将被删除的部门"，先把数字员工挂载到根目录（null），
    //     因为 employees.department_id 可能没有 FK，不能依赖 ON DELETE SET NULL
    if (allRemovedDeptIds.length > 0) {
      const affected = await trx(PLATFORM_TABLES.employees)
        .whereIn("department_id", allRemovedDeptIds)
        .update({ department_id: null, updated_at: now });
      digitalReassigned += affected;
    }

    // 3b. 清空全部人类员工（全量替换）
    await trx(PLATFORM_TABLES.humanEmployees).delete();

    // 3c. 删除已移除的部门（自引用 FK 有 ON DELETE SET NULL，需从叶到根删；
    //     此处逐条删，SQLite 每删一条会处理子节点 parent_id → NULL）
    if (allRemovedDeptIds.length > 0) {
      // 先将这些部门的子节点 parent_id 置 null，避免自引用 FK 冲突
      await trx(PLATFORM_TABLES.departments)
        .whereIn("parent_id", allRemovedDeptIds)
        .update({ parent_id: null, updated_at: now });
      await trx(PLATFORM_TABLES.departments).whereIn("id", allRemovedDeptIds).delete();
    }

    // 3d. Upsert 部门（BFS 顺序，父节点先于子节点）
    //     extIdToUuid 包含：已存在保留的部门 + 本次新建的部门
    const extIdToUuid = new Map<string, string>();
    // 将"保留的"已有部门加入映射（externalId 在新集合中的）
    for (const [extId, view] of existingDeptMap) {
      if (newExternalIds.has(extId)) {
        extIdToUuid.set(extId, view.id);
      }
    }

    for (const dept of flatDepts) {
      const extId = String(dept.dept_id);
      const parentExtId = String(dept.parent_id);
      // parent_id === 1 表示组织根目录，内部对应 null
      const parentUuid = dept.parent_id === 1 ? null : (extIdToUuid.get(parentExtId) ?? null);

      const existing = existingDeptMap.get(extId);
      if (existing) {
        // UPDATE —— 保留 UUID
        await trx(PLATFORM_TABLES.departments)
          .where({ id: existing.id })
          .update({
            name: dept.name,
            parent_id: parentUuid,
            sort_order: dept._sortIndex,
            updated_at: now
          });
        deptUpdated++;
        // extIdToUuid 已在上面加入，无需重复
      } else {
        // INSERT —— 新建 UUID
        const newId = randomUUID();
        await trx(PLATFORM_TABLES.departments).insert({
          id: newId,
          name: dept.name,
          description: "",
          external_id: extId,
          parent_id: parentUuid,
          sort_order: dept._sortIndex,
          created_at: now,
          updated_at: now
        });
        extIdToUuid.set(extId, newId);
        deptCreated++;
      }
    }

    // 3e. 创建人类员工（批量）
    const humanRows: object[] = [];
    for (const user of Object.values(rawUsers)) {
      if (!user.userid || !user.name) continue;

      // 使用 dept_id_list[0] 作为主部门
      const primaryExtDeptId = user.dept_id_list?.[0];
      const deptUuid =
        primaryExtDeptId !== undefined ? (extIdToUuid.get(String(primaryExtDeptId)) ?? null) : null;

      humanRows.push({
        id: randomUUID(),
        external_id: user.userid,
        name: user.name.trim(),
        avatar: user.avatar ?? "",
        title: (user.title ?? "").trim(),
        job_number: (user.job_number ?? "").trim(),
        active: user.active !== false ? 1 : 0,
        is_admin: user.admin ? 1 : 0,
        is_boss: user.boss ? 1 : 0,
        department_id: deptUuid,
        external_dept_ids: JSON.stringify(user.dept_id_list ?? []),
        unionid: user.unionid ?? "",
        created_at: now,
        updated_at: now
      });
    }

    if (humanRows.length > 0) {
      await trx.batchInsert(PLATFORM_TABLES.humanEmployees, humanRows, 100);
      humanCreated = humanRows.length;
    }
  });

  // ── Step 4: 补充检查：事务后确认数字员工无悬空部门引用 ───────────────────
  //   （事务内已处理，此步为保险）
  const orphanCount = await db(PLATFORM_TABLES.employees)
    .whereNotNull("department_id")
    .whereNotExists(
      db(PLATFORM_TABLES.departments).whereRaw(
        `${PLATFORM_TABLES.departments}.id = ${PLATFORM_TABLES.employees}.department_id`
      )
    )
    .update({ department_id: null, updated_at: now });
  digitalReassigned += Number(orphanCount);

  return {
    ok: true,
    data: {
      departments: { created: deptCreated, updated: deptUpdated, removed: allRemovedDeptIds.length },
      humanEmployees: { created: humanCreated },
      digitalEmployees: { reassignedToRoot: digitalReassigned }
    }
  };
});

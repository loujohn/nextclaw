import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type OrgSyncConfigRecord } from "../db/schema";
import { DingTalkOrgClient } from "../integrations/dingtalk-org-client";
import { DepartmentRepository } from "../repositories/department-repository";

const CONFIG_ID = "default";

export type OrgSyncConfigView = {
  appKey: string;
  appSecretSet: boolean;
  cronExpr: string;
  enabled: boolean;
};

export type OrgSyncConfigUpdate = {
  appKey?: string;
  appSecret?: string;
  cronExpr?: string;
  enabled?: boolean;
};

// ─── 钉钉组织数据类型 ──────────────────────────────────────────────────────────

type OrgDeptNode = {
  dept_id: number;
  name: string;
  parent_id: number;
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

export type OrgSyncBody = {
  departments?: OrgDeptNode[];
  users?: Record<string, OrgUser>;
};

export type OrgSyncResult = {
  departments: { created: number; updated: number; removed: number };
  humanEmployees: { created: number };
  digitalEmployees: { reassignedToRoot: number };
};

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

/** 直接操作数据库执行完整的钉钉组织同步 */
export async function performOrgSync(db: Knex, orgData: OrgSyncBody): Promise<OrgSyncResult> {
  const departmentRepo = new DepartmentRepository(db);

  const rawDepts = Array.isArray(orgData.departments) ? orgData.departments : [];
  const rawUsers: Record<string, OrgUser> =
    orgData.users && typeof orgData.users === "object" ? orgData.users : {};

  const flatDepts = flattenDepartments(rawDepts);
  const newExternalIds = new Set(flatDepts.map((d) => String(d.dept_id)));

  const existingDeptMap = await departmentRepo.mapByExternalId();
  const removedDeptIds = [...existingDeptMap.values()]
    .filter((d) => !newExternalIds.has(d.externalId!))
    .map((d) => d.id);
  const manualDepts = await db<{ id: string }>(PLATFORM_TABLES.departments)
    .whereNull("external_id")
    .select("id");
  const manualDeptIds = manualDepts.map((d) => d.id);
  const allRemovedDeptIds = [...removedDeptIds, ...manualDeptIds];

  const now = new Date().toISOString();
  let deptCreated = 0;
  let deptUpdated = 0;
  let humanCreated = 0;
  let digitalReassigned = 0;

  await db.transaction(async (trx) => {
    if (allRemovedDeptIds.length > 0) {
      const affected = await trx(PLATFORM_TABLES.employees)
        .whereIn("department_id", allRemovedDeptIds)
        .update({ department_id: null, updated_at: now });
      digitalReassigned += affected;
    }

    await trx(PLATFORM_TABLES.humanEmployees).delete();

    if (allRemovedDeptIds.length > 0) {
      await trx(PLATFORM_TABLES.departments)
        .whereIn("parent_id", allRemovedDeptIds)
        .update({ parent_id: null, updated_at: now });
      await trx(PLATFORM_TABLES.departments).whereIn("id", allRemovedDeptIds).delete();
    }

    const extIdToUuid = new Map<string, string>();
    for (const [extId, view] of existingDeptMap) {
      if (newExternalIds.has(extId)) {
        extIdToUuid.set(extId, view.id);
      }
    }

    for (const dept of flatDepts) {
      const extId = String(dept.dept_id);
      const parentExtId = String(dept.parent_id);
      const parentUuid = dept.parent_id === 1 ? null : (extIdToUuid.get(parentExtId) ?? null);
      const existing = existingDeptMap.get(extId);
      if (existing) {
        await trx(PLATFORM_TABLES.departments).where({ id: existing.id }).update({
          name: dept.name,
          parent_id: parentUuid,
          sort_order: dept._sortIndex,
          updated_at: now
        });
        deptUpdated++;
      } else {
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

    const humanRows: object[] = [];
    for (const user of Object.values(rawUsers)) {
      if (!user.userid || !user.name) continue;
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

  // 事务后补充检查孤立部门引用
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
    departments: { created: deptCreated, updated: deptUpdated, removed: allRemovedDeptIds.length },
    humanEmployees: { created: humanCreated },
    digitalEmployees: { reassignedToRoot: digitalReassigned }
  };
}


// 统一从环境变量读取钉钉同步配置
function getEnvOrgSyncConfig(): OrgSyncConfigView {
  const envAppKey = process.env.DINGTALK_APP_KEY?.trim() ?? "";
  const envAppSecret = process.env.DINGTALK_APP_SECRET?.trim() ?? "";
  const cronExpr = process.env.DINGTALK_CRON_EXPR?.trim() ?? "0 1 * * *";
  const enabled = process.env.DINGTALK_SYNC_ENABLED === "true";
  console.log("Org Sync Config from env:", { envAppKey: !!envAppKey, envAppSecret: !!envAppSecret, cronExpr, enabled });
  return {
    appKey: envAppKey,
    appSecretSet: !!envAppSecret,
    cronExpr,
    enabled
  };
}

export async function getOrgSyncConfig(db: Knex): Promise<OrgSyncConfigView> {
  // 只从环境变量读取
  return getEnvOrgSyncConfig();
}

export async function updateOrgSyncConfig(db: Knex, patch: OrgSyncConfigUpdate): Promise<OrgSyncConfigView> {
  // 仅支持从环境变量读取，不再支持更新
  return getEnvOrgSyncConfig();
}

/** 拉取钉钉数据并直接操作数据库完成组织同步 */
export async function runOrgSync(
  db: Knex
): Promise<{ ok: boolean; summary: string; data?: unknown }> {
  const envAppKey = process.env.DINGTALK_APP_KEY?.trim() ?? "";
  const envAppSecret = process.env.DINGTALK_APP_SECRET?.trim() ?? "";
  if (!envAppKey || !envAppSecret) {
    return { ok: false, summary: "未配置钉钉 AppKey 或 AppSecret" };
  }

  let orgData: OrgSyncBody;
  try {
    const client = await DingTalkOrgClient.create(envAppKey, envAppSecret);
    orgData = (await client.fetchAllOrgData()) as OrgSyncBody;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, summary: `拉取钉钉组织数据失败: ${msg}` };
  }

  try {
    const result = await performOrgSync(db, orgData);
    return { ok: true, summary: `同步成功: ${JSON.stringify(result)}`, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, summary: `同步数据库操作失败: ${msg}` };
  }
}





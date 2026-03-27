import type { Knex } from "knex";
import { PLATFORM_TABLES, type OrgSyncConfigRecord } from "../db/schema";
import { DingTalkOrgClient } from "../integrations/dingtalk-org-client";

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

/** 执行钉钉同步脚本并调用 /api/org/sync，返回摘要信息 */

export async function runOrgSync(
  db: Knex,
  syncApiUrl: string
): Promise<{ ok: boolean; summary: string; data?: unknown }> {
  // 只从环境变量读取
  const envAppKey = process.env.DINGTALK_APP_KEY?.trim() ?? "";
  const envAppSecret = process.env.DINGTALK_APP_SECRET?.trim() ?? "";
  if (!envAppKey || !envAppSecret) {
    return { ok: false, summary: "未配置钉钉 AppKey 或 AppSecret" };
  }
  // 使用 TS 客户端拉取钉钉组织数据
  let orgData: unknown;
  try {
    const client = await DingTalkOrgClient.create(envAppKey, envAppSecret);
    orgData = await client.fetchAllOrgData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, summary: `拉取钉钉组织数据失败: ${msg}` };
  }

  // 调用同步 API
  try {
    const res = await fetch(syncApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orgData)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const msg = `同步 API 返回错误 ${res.status}: ${text.slice(0, 200)}`;
      return { ok: false, summary: msg };
    }
    const result = (await res.json()) as { ok: boolean; data?: unknown };
    const dataStr = result.data ? JSON.stringify(result.data) : "";
    const summary = `同步成功: ${dataStr}`;
    return { ok: true, summary, data: result.data };
  } catch (err) {
    const msg = `调用同步 API 失败: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, summary: msg };
  }
}





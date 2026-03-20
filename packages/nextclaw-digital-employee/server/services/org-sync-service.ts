import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type OrgSyncConfigRecord } from "../db/schema";

// process.cwd() 在 Nitro dev/prod 模式下均指向包根目录，比 __dirname 更稳定
const SCRIPT_PATH = resolve(process.cwd(), "scripts/dingtalk-org-sync.py");

const CONFIG_ID = "default";

export type OrgSyncConfigView = {
  appKey: string;
  appSecretSet: boolean;
  cronExpr: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string;
};

export type OrgSyncConfigUpdate = {
  appKey?: string;
  appSecret?: string;
  cronExpr?: string;
  enabled?: boolean;
};

function toView(record: OrgSyncConfigRecord): OrgSyncConfigView {
  return {
    appKey: record.app_key,
    appSecretSet: record.app_secret.length > 0,
    cronExpr: record.cron_expr,
    enabled: Boolean(record.enabled),
    lastRunAt: record.last_run_at ?? null,
    lastRunStatus: record.last_run_status ?? null,
    lastRunSummary: record.last_run_summary
  };
}

/** 获取原始 appSecret（仅供内部执行脚本使用，不对外暴露） */
async function getRawAppSecret(db: Knex): Promise<string> {
  const record = await db<OrgSyncConfigRecord>(PLATFORM_TABLES.orgSyncConfig)
    .where({ id: CONFIG_ID })
    .first();
  return record?.app_secret ?? "";
}

export async function getOrgSyncConfig(db: Knex): Promise<OrgSyncConfigView> {
  let record = await db<OrgSyncConfigRecord>(PLATFORM_TABLES.orgSyncConfig)
    .where({ id: CONFIG_ID })
    .first();
  if (!record) {
    // 首次初始化：从环境变量读取默认值
    const now = new Date().toISOString();
    const defaults: OrgSyncConfigRecord = {
      id: CONFIG_ID,
      app_key: process.env.DINGTALK_APP_KEY ?? "",
      app_secret: process.env.DINGTALK_APP_SECRET ?? "",
      cron_expr: process.env.DINGTALK_CRON_EXPR ?? "0 1 * * *",
      enabled: process.env.DINGTALK_SYNC_ENABLED === "true" ? 1 : 0,
      last_run_at: null,
      last_run_status: null,
      last_run_summary: "",
      updated_at: now
    };
    await db<OrgSyncConfigRecord>(PLATFORM_TABLES.orgSyncConfig).insert(defaults);
    record = defaults;
  } else {
    // 已有记录：若 DB 中字段为空而 env 中已配置，则用 env 覆盖（允许 .env 初始化已有实例）
    const envPatch: Partial<OrgSyncConfigRecord> = {};
    if (!record.app_key && process.env.DINGTALK_APP_KEY) envPatch.app_key = process.env.DINGTALK_APP_KEY;
    if (!record.app_secret && process.env.DINGTALK_APP_SECRET) envPatch.app_secret = process.env.DINGTALK_APP_SECRET;
    if (Object.keys(envPatch).length > 0) {
      envPatch.updated_at = new Date().toISOString();
      await db<OrgSyncConfigRecord>(PLATFORM_TABLES.orgSyncConfig).where({ id: CONFIG_ID }).update(envPatch);
      record = { ...record, ...envPatch };
    }
  }
  return toView(record);
}

export async function updateOrgSyncConfig(db: Knex, patch: OrgSyncConfigUpdate): Promise<OrgSyncConfigView> {
  await getOrgSyncConfig(db); // 确保行存在
  const now = new Date().toISOString();
  const update: Partial<OrgSyncConfigRecord> & { updated_at: string } = { updated_at: now };
  if (typeof patch.appKey === "string") update.app_key = patch.appKey.trim();
  if (typeof patch.appSecret === "string") update.app_secret = patch.appSecret.trim();
  if (typeof patch.cronExpr === "string") update.cron_expr = patch.cronExpr.trim();
  if (typeof patch.enabled === "boolean") update.enabled = patch.enabled ? 1 : 0;
  await db<OrgSyncConfigRecord>(PLATFORM_TABLES.orgSyncConfig).where({ id: CONFIG_ID }).update(update);
  return getOrgSyncConfig(db);
}

/** 执行钉钉同步脚本并调用 /api/org/sync，返回摘要信息 */
export async function runOrgSync(
  db: Knex,
  syncApiUrl: string
): Promise<{ ok: boolean; summary: string; data?: unknown }> {
  const cfg = await db<OrgSyncConfigRecord>(PLATFORM_TABLES.orgSyncConfig).where({ id: CONFIG_ID }).first();
  if (!cfg?.app_key || !cfg.app_secret) {
    return { ok: false, summary: "未配置钉钉 AppKey 或 AppSecret" };
  }
  const appSecret = await getRawAppSecret(db);

  // 执行 Python 脚本，捕获 stdout（JSON）
  let orgJson: string;
  try {
    orgJson = await runPythonScript(cfg.app_key, appSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeRunResult(db, "failure", `脚本执行失败: ${msg}`);
    return { ok: false, summary: `脚本执行失败: ${msg}` };
  }

  // 解析 JSON
  let orgData: unknown;
  try {
    orgData = JSON.parse(orgJson);
  } catch {
    await writeRunResult(db, "failure", "脚本输出无法解析为 JSON");
    return { ok: false, summary: "脚本输出无法解析为 JSON" };
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
      await writeRunResult(db, "failure", msg);
      return { ok: false, summary: msg };
    }
    const result = (await res.json()) as { ok: boolean; data?: unknown };
    const dataStr = result.data ? JSON.stringify(result.data) : "";
    const summary = `同步成功: ${dataStr}`;
    await writeRunResult(db, "success", summary);
    return { ok: true, summary, data: result.data };
  } catch (err) {
    const msg = `调用同步 API 失败: ${err instanceof Error ? err.message : String(err)}`;
    await writeRunResult(db, "failure", msg);
    return { ok: false, summary: msg };
  }
}

async function writeRunResult(db: Knex, status: "success" | "failure", summary: string): Promise<void> {
  await db<OrgSyncConfigRecord>(PLATFORM_TABLES.orgSyncConfig).where({ id: CONFIG_ID }).update({
    last_run_at: new Date().toISOString(),
    last_run_status: status,
    last_run_summary: summary.slice(0, 1000),
    updated_at: new Date().toISOString()
  });
}

function runPythonScript(appKey: string, appSecret: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [SCRIPT_PATH, "--app-key", appKey, "--app-secret", appSecret], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on("data", (d: Buffer) => stderrChunks.push(d));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf-8").trim());
      } else {
        const errMsg = Buffer.concat(stderrChunks).toString("utf-8").trim();
        reject(new Error(`python3 exited with code ${code}: ${errMsg.slice(0, 500)}`));
      }
    });
    child.on("error", reject);
  });
}

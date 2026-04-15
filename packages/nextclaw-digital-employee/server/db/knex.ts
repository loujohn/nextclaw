import { createRequire } from "node:module";
import { resolve } from "node:path";
import knex, { type Knex } from "knex";

// import.meta.url 在 Nitro/Rollup 打包后会被替换为虚拟入口路径 /_entry.js，
// 导致 createRequire 从根目录 / 解析模块。使用 process.cwd() 确保始终从
// 应用工作目录（/app）解析，兼容开发和生产环境。
const _require = createRequire(resolve(process.cwd(), "index.js"));

export type DmConnectionConfig = {
  connectString: string;
  user: string;
  password: string;
  schema?: string;
};

export type PlatformDbConfig = {
  client: "dm";
  connection: DmConnectionConfig;
};

export const DM_DEFAULT_SCHEMA = "DIGITAL_EMPLOYEE";

let _dmSchema = DM_DEFAULT_SCHEMA;
let _dmSchemaReady = false;

export function dbNow(): string {
  return formatTimestamp(new Date());
}

export function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function resolveDbConfigFromEnv(): PlatformDbConfig {
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5236";
  return {
    client: "dm",
    connection: {
      connectString: `${host}:${port}`,
      user: process.env.DB_USER ?? "SYSDBA",
      password: process.env.DB_PASSWORD ?? "SYSDBA",
      schema: process.env.DB_SCHEMA ?? DM_DEFAULT_SCHEMA,
    },
  };
}

export function createPlatformKnex(config: PlatformDbConfig): Knex {
  const knexDm = _require("knex-dm");
  const schema = config.connection.schema ?? DM_DEFAULT_SCHEMA;
  _dmSchema = schema;
  return knex({
    client: knexDm,
    connection: {
      connectString: config.connection.connectString,
      user: config.connection.user,
      password: config.connection.password,
    },
    pool: {
      min: 0,
      max: 10,
      idleTimeoutMillis: 15_000,
      reapIntervalMillis: 5_000,
      acquireTimeoutMillis: 30_000,
      afterCreate(conn: { execute: (sql: string, params: unknown[], cb: (err: unknown) => void) => void }, cb: (err: unknown, conn: unknown) => void) {
        if (!_dmSchemaReady) {
          cb(null, conn);
          return;
        }
        conn.execute(`SET SCHEMA "${schema}"`, [], (err: unknown) => {
          cb(err, conn);
        });
      },
      // tarn.js validate — knex types 未导出此字段，但运行时有效
      ...({ validate(conn: unknown) {
        try {
          if (conn && typeof (conn as Record<string, unknown>).checkClosed === "function") {
            (conn as { checkClosed: () => void }).checkClosed();
          }
          return true;
        } catch {
          return false;
        }
      } }),
    } as Record<string, unknown>,
    fetchAsString: ["DATE"],
  });
}

/**
 * 切换达梦当前会话的 Schema。
 * 若未配置 DB_SCHEMA 或 schema 参数，则使用连接用户的默认 Schema（无需切换）。
 * Schema 需由 DBA 预先创建，应用层不自动 CREATE。
 */
export async function ensureDmSchema(db: Knex, schema?: string): Promise<void> {
  const targetSchema = (schema ?? _dmSchema).toUpperCase();
  const user = (process.env.DB_USER ?? "SYSDBA").toUpperCase();
  if (targetSchema === user) {
    _dmSchemaReady = true;
    return;
  }
  try {
    await db.raw(`SET SCHEMA "${targetSchema}"`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `无法切换到达梦 Schema "${targetSchema}"。` +
      `请确认 DBA 已创建该 Schema/User，或将 DB_SCHEMA 设为连接用户名 "${user}"。` +
      `\n原始错误: ${msg}`
    );
  }
  _dmSchemaReady = true;
}

// --- Migration utility functions (used by file-based migrations) ---

export async function hasIndex(db: Knex, indexName: string): Promise<boolean> {
  const rows = await db.raw(
    `SELECT INDEX_NAME FROM ALL_INDEXES WHERE INDEX_NAME = ?`, [indexName.toUpperCase()]
  );
  const result = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  return result.length > 0;
}

export async function createIndexIfNotExists(db: Knex, indexName: string, ddl: string): Promise<void> {
  const exists = await hasIndex(db, indexName);
  if (!exists) {
    await db.raw(ddl);
  }
}

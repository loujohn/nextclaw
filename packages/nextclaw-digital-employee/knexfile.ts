import type { Knex } from "knex";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Record<string, Knex.Config> = {
  development: {
    client: "better-sqlite3",
    connection: {
      filename: resolve(
        process.env.NEXTCLAW_DIGITAL_EMPLOYEE_HOME ?? join(process.cwd(), ".nextclaw-digital-employee"),
        "platform.sqlite"
      )
    },
    useNullAsDefault: true,
    migrations: {
      directory: resolve(__dirname, "migrations"),
      extension: "ts"
    }
  }
};

export default config;

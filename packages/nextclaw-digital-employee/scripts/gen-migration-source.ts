/**
 * Scans the migrations/ directory and regenerates server/db/migration-source.ts.
 * Eliminates the need to manually add imports — just run this after creating a new migration.
 *
 * Usage: npx tsx scripts/gen-migration-source.ts
 */
import { readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../migrations");
const outputFile = resolve(__dirname, "../server/db/migration-source.ts");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".ts") && !f.startsWith("."))
  .sort();

const imports = files.map((f, i) => {
  const alias = `m${String(i).padStart(3, "0")}`;
  const modulePath = f.replace(/\.ts$/, "");
  return `import * as ${alias} from "../../migrations/${modulePath}";`;
});

const entries = files.map((f, i) => {
  const alias = `m${String(i).padStart(3, "0")}`;
  return `  { name: "${f}", ...${alias} },`;
});

const source = `import type { Knex } from "knex";

/**
 * ⚠️  AUTO-GENERATED — do not edit manually.
 *     Run \`pnpm gen:migrations\` to regenerate after adding migration files.
 */
${imports.join("\n")}

type MigrationEntry = {
  name: string;
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
};

const migrations: MigrationEntry[] = [
${entries.join("\n")}
];

class BundledMigrationSource implements Knex.MigrationSource<MigrationEntry> {
  getMigrations(): Promise<MigrationEntry[]> {
    return Promise.resolve(migrations);
  }

  getMigrationName(migration: MigrationEntry): string {
    return migration.name;
  }

  getMigration(migration: MigrationEntry): Promise<Knex.Migration> {
    return Promise.resolve({ up: migration.up, down: migration.down });
  }
}

export const bundledMigrationSource = new BundledMigrationSource();
`;

writeFileSync(outputFile, source, "utf-8");
console.log(`Generated migration-source.ts with ${files.length} migrations:`);
files.forEach((f) => console.log(`  - ${f}`));

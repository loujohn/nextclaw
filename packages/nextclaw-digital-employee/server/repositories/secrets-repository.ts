import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type SecretRecord } from "../db/schema";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export type SecretView = {
  id: string;
  key: string;
  maskedValue: string;
  scope: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

function maskValue(raw: string): string {
  if (raw.length <= 4) return "••••";
  return "••••••" + raw.slice(-4);
}

function resolveEncryptionKey(homeDir: string): Buffer {
  const envKey = process.env.NEXTCLAW_SECRET_KEY?.trim();
  if (envKey) {
    const buf = Buffer.from(envKey, "base64");
    if (buf.length === 32) return buf;
    throw new Error("NEXTCLAW_SECRET_KEY must be 32 bytes (base64 encoded)");
  }
  const keyPath = join(homeDir, "secret.key");
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, "utf-8").trim(), "base64");
  }
  const newKey = randomBytes(32);
  writeFileSync(keyPath, newKey.toString("base64"), "utf-8");
  return newKey;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
}

function toView(record: SecretRecord, key: Buffer): SecretView {
  const plain = decrypt(record.value, key);
  return {
    id: record.id,
    key: record.key,
    maskedValue: maskValue(plain),
    scope: record.scope,
    description: record.description,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export class SecretsRepository {
  private encryptionKey: Buffer;

  constructor(private readonly db: Knex, homeDir: string) {
    this.encryptionKey = resolveEncryptionKey(homeDir);
  }

  async list(): Promise<SecretView[]> {
    const rows = await this.db<SecretRecord>(PLATFORM_TABLES.secrets).orderBy("created_at", "asc");
    return rows.map((r) => toView(r, this.encryptionKey));
  }

  async create(params: { key: string; value: string; scope?: string; description?: string }): Promise<SecretView> {
    const now = new Date().toISOString();
    const record: SecretRecord = {
      id: randomUUID(),
      key: params.key,
      value: encrypt(params.value, this.encryptionKey),
      scope: params.scope ?? "global",
      description: params.description ?? "",
      created_at: now,
      updated_at: now
    };
    await this.db<SecretRecord>(PLATFORM_TABLES.secrets).insert(record);
    return toView(record, this.encryptionKey);
  }

  async update(key: string, params: { value?: string; description?: string }): Promise<SecretView> {
    const updates: Partial<SecretRecord> = { updated_at: new Date().toISOString() };
    if (params.value !== undefined) {
      updates.value = encrypt(params.value, this.encryptionKey);
    }
    if (params.description !== undefined) {
      updates.description = params.description;
    }
    await this.db<SecretRecord>(PLATFORM_TABLES.secrets).where({ key }).update(updates);
    const row = await this.db<SecretRecord>(PLATFORM_TABLES.secrets).where({ key }).first();
    if (!row) throw new Error(`Secret not found: ${key}`);
    return toView(row, this.encryptionKey);
  }

  async delete(key: string): Promise<void> {
    await this.db<SecretRecord>(PLATFORM_TABLES.secrets).where({ key }).delete();
  }

  async getDecryptedForScope(employeeId?: string): Promise<Map<string, string>> {
    const scopes = ["global"];
    if (employeeId) scopes.push(`employee:${employeeId}`);
    const rows = await this.db<SecretRecord>(PLATFORM_TABLES.secrets).whereIn("scope", scopes);
    const result = new Map<string, string>();
    for (const row of rows) {
      result.set(row.key, decrypt(row.value, this.encryptionKey));
    }
    return result;
  }
}

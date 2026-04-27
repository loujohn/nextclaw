import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Knex } from "knex";
import { afterEach, describe, expect, it } from "vitest";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeSkillRepository } from "../server/repositories/employee-skill-repository";
import { RunRecordRepository } from "../server/repositories/run-record-repository";
import { ChatSessionRepository } from "../server/repositories/chat-session-repository";
import { ChatMessageRepository } from "../server/repositories/chat-message-repository";
import { RolePermissionRepository } from "../server/repositories/role-permission-repository";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { EmployeeRunService } from "../server/services/employee-run-service";
import { CHAT_SESSION_VIEW_ALL_PERMISSION } from "../shared/role-permissions";
import { cleanTestDatabase, createTestKnex, ensureTestDatabase } from "./test-db";

const tempDirs: string[] = [];
const activeDbs: Knex[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildGateway(homeDir: string): NextclawEngineGateway {
  return new NextclawEngineGateway({
    homeDir,
    workspaceDir: join(homeDir, "workspace"),
    extensionRegistry: {
      tools: [],
      channels: [],
      diagnostics: [],
      engines: []
    },
    defaultConfig: {
      agents: { defaults: { engine: "mock", model: "openai/gpt-5" } }
    }
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  while (activeDbs.length > 0) {
    const db = activeDbs.pop();
    void db?.destroy();
  }
});

async function createService() {
  const homeDir = createTempDir("chat-session-access-");
  const db = createTestKnex();
  activeDbs.push(db);
  await ensureTestDatabase(db);
  await cleanTestDatabase(db);

  const employeeRepo = new EmployeeRepository(db);
  const skillRepo = new EmployeeSkillRepository(db);
  const runRepo = new RunRecordRepository(db);
  const chatSessionRepo = new ChatSessionRepository(db);
  const chatMessageRepo = new ChatMessageRepository(db);
  const rolePermissionRepo = new RolePermissionRepository(db);
  const employee = await employeeRepo.create({
    name: "权限测试员工",
    code: "chat-access",
    description: "",
    systemPrompt: ""
  });

  return {
    employee,
    chatSessionRepo,
    chatMessageRepo,
    rolePermissionRepo,
    service: new EmployeeRunService(
      employeeRepo,
      skillRepo,
      runRepo,
      buildGateway(homeDir),
      undefined,
      chatSessionRepo,
      chatMessageRepo
    )
  };
}

describe("chat session access control", () => {
  it("defaults to admin can view all sessions while non-admin users only see their own sessions", async () => {
    const { employee, chatSessionRepo, service, rolePermissionRepo } = await createService();

    await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "owner-a",
      title: "A 的会话",
      createdByUserId: "user-a"
    });
    await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "owner-b",
      title: "B 的会话",
      createdByUserId: "user-b"
    });

    expect(await rolePermissionRepo.isPermissionEnabled("admin", CHAT_SESSION_VIEW_ALL_PERMISSION)).toBe(true);
    expect(await rolePermissionRepo.isPermissionEnabled("manager", CHAT_SESSION_VIEW_ALL_PERMISSION)).toBe(false);

    const adminSessions = await service.listChatSessions({
      employeeId: employee.id,
      actorUserId: "admin-1",
      accessScope: "all"
    });
    const ownSessions = await service.listChatSessions({
      employeeId: employee.id,
      actorUserId: "user-a",
      accessScope: "own"
    });

    expect(adminSessions.items.map((item) => item.sessionKey).sort()).toEqual(["owner-a", "owner-b"]);
    expect(ownSessions.items.map((item) => item.sessionKey)).toEqual(["owner-a"]);
  });

  it("blocks message history access for sessions outside the caller scope", async () => {
    const { employee, chatSessionRepo, chatMessageRepo, service } = await createService();

    const session = await chatSessionRepo.create({
      employeeId: employee.id,
      sessionKey: "private-thread",
      title: "私有会话",
      createdByUserId: "user-a"
    });
    await chatMessageRepo.createMany([
      { sessionId: session.id, role: "assistant", content: "仅 A 可见", createdAt: "2026-04-27T00:00:00.000Z" }
    ]);

    await expect(
      service.getChatMessages({
        employeeId: employee.id,
        sessionKey: session.sessionKey,
        actorUserId: "user-b",
        accessScope: "own",
        limit: 10
      })
    ).rejects.toThrow("Chat session not found");

    const adminResult = await service.getChatMessages({
      employeeId: employee.id,
      sessionKey: session.sessionKey,
      actorUserId: "admin-1",
      accessScope: "all",
      limit: 10
    });

    expect(adminResult.items.map((item) => item.content)).toEqual(["仅 A 可见"]);
  });
});
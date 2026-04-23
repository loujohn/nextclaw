import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BaseChannel,
  ConfigSchema,
  MessageBus,
  SessionManager,
  type Config,
  type ExtensionRegistry
} from "@nextclaw/core";
import type { PluginRegistry } from "@nextclaw/openclaw-compat";
import { createTestKnex, ensureTestDatabase } from "./test-db";
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { EmployeeRepository } from "../server/repositories/employee-repository";
import { EmployeeSkillRepository } from "../server/repositories/employee-skill-repository";
import { DigitalEmployeeChannelRuntime } from "../server/runtime/channel-runtime";
import { IdentityResolver } from "../server/services/identity-resolver";
import { DepartmentRepository } from "../server/repositories/department-repository";
import { HumanEmployeeRepository } from "../server/repositories/human-employee-repository";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function createConfig(workspaceDir: string): Config {
  return ConfigSchema.parse({
    agents: {
      defaults: {
        workspace: workspaceDir,
        engine: "mock",
        model: "openai/gpt-5"
      },
      list: [
        {
          id: "ops-bot",
          default: true
        }
      ]
    },
    channels: {
      dingtalk: {
        enabled: true,
        defaultAccountId: "ops-bot",
        accounts: {
          "ops-bot": {
            clientId: "client",
            clientSecret: "secret",
            robotCode: "robot",
            corpId: "corp",
            agentId: "agent"
          }
        }
      }
    },
    bindings: [
      {
        agentId: "ops-bot",
        match: {
          channel: "dingtalk",
          accountId: "ops-bot"
        }
      }
    ]
  });
}

class FakeChannel extends BaseChannel<Record<string, unknown>> {
  sent: Array<{ channel: string; chatId: string; content: string; metadata: Record<string, unknown> }> = [];
  started = false;
  stopped = false;

  get name(): string {
    return "dingtalk";
  }

  async start(): Promise<void> {
    this.running = true;
    this.started = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopped = true;
  }

  async send(msg: { channel: string; chatId: string; content: string; metadata: Record<string, unknown> }): Promise<void> {
    this.sent.push(msg);
  }
}

function createMockRegistry(params: { handleInbound: ReturnType<typeof vi.fn> }) {
  return {
    tools: [],
    diagnostics: [],
    channels: [],
    engines: [
      {
        extensionId: "test.mock",
        source: "workspace",
        kind: "mock",
        factory: () => ({
          kind: "mock",
          handleInbound: params.handleInbound,
          processDirect: vi.fn(async () => "ok"),
          applyRuntimeConfig: vi.fn()
        })
      }
    ]
  } satisfies ExtensionRegistry;
}

function createChannelRuntimeState(params: {
  workspaceDir: string;
  fakeChannel: FakeChannel;
  handleInbound: ReturnType<typeof vi.fn>;
  gatewayStartAccount: ReturnType<typeof vi.fn>;
}): {
  config: Config;
  extensionRegistry: ExtensionRegistry;
  pluginRegistry: PluginRegistry;
} {
  return {
    config: createConfig(params.workspaceDir),
    extensionRegistry: {
      ...createMockRegistry({ handleInbound: params.handleInbound }),
      channels: [
        {
          extensionId: "test.channel",
          source: "workspace",
          channel: {
            id: "dingtalk",
            nextclaw: {
              isEnabled: () => true,
              createChannel: () => params.fakeChannel
            }
          }
        }
      ]
    },
    pluginRegistry: {
      plugins: [],
      tools: [],
      channels: [
        {
          pluginId: "test.channel",
          source: "workspace",
          channel: {
            id: "dingtalk",
            config: {
              listAccountIds: () => ["ops-bot"]
            },
            gateway: {
              startAccount: params.gatewayStartAccount
            }
          }
        }
      ],
      providers: [],
      engines: [],
      diagnostics: []
    }
  };
}

async function createEmployeeRepos(homeDir: string): Promise<{
  db: ReturnType<typeof createTestKnex>;
  employeeRepo: EmployeeRepository;
  employeeSkillRepo: EmployeeSkillRepository;
}> {
  const db = createTestKnex();
  await ensureTestDatabase(db);
  const employeeRepo = new EmployeeRepository(db);
  const employeeSkillRepo = new EmployeeSkillRepository(db);
  await employeeRepo.create({
    name: "运维助手",
    code: "ops-bot",
    description: "处理钉钉消息",
    systemPrompt: "你是运维助手"
  });
  return { db, employeeRepo, employeeSkillRepo };
}

function createGateway(params: {
  homeDir: string;
  workspaceDir: string;
  bus: MessageBus;
  sessionManager: SessionManager;
  handleInbound: ReturnType<typeof vi.fn>;
}): NextclawEngineGateway {
  return new NextclawEngineGateway({
    homeDir: params.homeDir,
    workspaceDir: params.workspaceDir,
    bus: params.bus,
    sessionManager: params.sessionManager,
    extensionRegistry: createMockRegistry({ handleInbound: params.handleInbound }),
    defaultConfig: {
      agents: {
        defaults: {
          engine: "mock",
          model: "openai/gpt-5"
        }
      }
    }
  });
}

async function publishDirectInbound(bus: MessageBus): Promise<void> {
  await bus.publishInbound({
    channel: "dingtalk",
    senderId: "user-1",
    chatId: "dm:user-1",
    content: "hello",
    timestamp: new Date(),
    attachments: [],
    metadata: {
      accountId: "ops-bot",
      peer_kind: "direct",
      peer_id: "user-1"
    }
  });
}

describe("DigitalEmployeeChannelRuntime", () => {
  it("consumes inbound channel messages and routes replies through the shared bus", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-channel-home-");
    const workspaceDir = join(homeDir, "workspace");
    const { db, employeeRepo, employeeSkillRepo } = await createEmployeeRepos(homeDir);

    const bus = new MessageBus();
    const sessionManager = new SessionManager(workspaceDir);
    const fakeChannel = new FakeChannel({}, bus);
    const handleInbound = vi.fn(async ({ message, sessionKey }) => {
      await bus.publishOutbound({
        channel: message.channel,
        chatId: message.chatId,
        content: `reply:${sessionKey}`,
        media: [],
        metadata: message.metadata
      });
      return null;
    });
    const gateway = createGateway({
      homeDir,
      workspaceDir,
      bus,
      sessionManager,
      handleInbound
    });
    const gatewayStartAccount = vi.fn(async () => undefined);
    const runtimeState = createChannelRuntimeState({
      workspaceDir,
      fakeChannel,
      handleInbound,
      gatewayStartAccount
    });

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway,
      employeeRepo,
      employeeSkillRepo,
      loadState: async () => runtimeState
    });

    await runtime.start();
    await publishDirectInbound(bus);

    await vi.waitFor(() => {
      expect(handleInbound).toHaveBeenCalledWith({
        message: expect.objectContaining({
          channel: "dingtalk",
          chatId: "dm:user-1",
          content: "hello"
        }),
        sessionKey: "agent:ops-bot:dingtalk:direct:user-1",
        publishResponse: true
      });
    });
    await vi.waitFor(() => {
      expect(fakeChannel.sent.some((msg) => msg.content === "reply:agent:ops-bot:dingtalk:direct:user-1")).toBe(true);
    });
    expect(fakeChannel.started).toBe(true);
    expect(gatewayStartAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "ops-bot"
      })
    );

    await runtime.stop();
    expect(fakeChannel.stopped).toBe(true);
    await db.destroy();
  });

  it("surfaces missing employee bindings instead of falling back to main", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-channel-missing-binding-");
    const workspaceDir = join(homeDir, "workspace");
    const { db, employeeRepo, employeeSkillRepo } = await createEmployeeRepos(homeDir);

    const bus = new MessageBus();
    const sessionManager = new SessionManager(workspaceDir);
    const fakeChannel = new FakeChannel({}, bus);
    const handleInbound = vi.fn();
    const gateway = createGateway({
      homeDir,
      workspaceDir,
      bus,
      sessionManager,
      handleInbound
    });
    const gatewayStartAccount = vi.fn(async () => undefined);
    const runtimeState = createChannelRuntimeState({
      workspaceDir,
      fakeChannel,
      handleInbound,
      gatewayStartAccount
    });
    runtimeState.config.bindings = [];

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway,
      employeeRepo,
      employeeSkillRepo,
      loadState: async () => runtimeState
    });

    await runtime.start();
    await publishDirectInbound(bus);

    await vi.waitFor(() => {
      expect(fakeChannel.sent.some((msg) => msg.content.includes("未配置员工绑定"))).toBe(true);
    });
    expect(handleInbound).not.toHaveBeenCalled();

    await runtime.stop();
    await db.destroy();
  });

  it("prepends sender identity prefix when identityResolver is provided", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-channel-sender-");
    const workspaceDir = join(homeDir, "workspace");
    const { db, employeeRepo, employeeSkillRepo } = await createEmployeeRepos(homeDir);

    const deptRepo = new DepartmentRepository(db);
    const humanRepo = new HumanEmployeeRepository(db);
    const dept = await deptRepo.create({ name: "技术部", description: "" });
    await humanRepo.create({
      externalId: "user-1",
      name: "张三",
      title: "工程师",
      departmentId: dept.id,
      active: true,
      isAdmin: false,
      isBoss: false
    });
    await db("users").insert({
      id: "runtime-user-1",
      keycloak_sub: "personnel-sync:runtime-1",
      username: "zhangsan",
      email: "zhangsan-runtime@example.com",
      display_name: "张三",
      avatar_url: "",
      role: "user",
      is_active: 1,
      user_source: "sync",
      sync_provider: "personnel-api",
      external_user_id: "runtime-1",
      external_user_name: "zhangsan-ext",
      external_name: "张三",
      external_post_name: "工程师",
      external_role_name: "成员",
      external_dingtalk_id: "user-1",
      external_phone: "",
      external_user_type: "正式员工",
      department_id: dept.id,
      human_employee_id: null,
      preferences: "{}",
      auth_provider: "keycloak",
      password_hash: null,
      last_login_at: null,
      last_synced_at: "2026-04-23 00:00:00",
      created_at: "2026-04-23 00:00:00",
      updated_at: "2026-04-23 00:00:00"
    });

    const bus = new MessageBus();
    const sessionManager = new SessionManager(workspaceDir);
    const fakeChannel = new FakeChannel({}, bus);
    const handleInbound = vi.fn(async ({ message }) => {
      await bus.publishOutbound({
        channel: message.channel,
        chatId: message.chatId,
        content: `echo:${message.content}`,
        media: [],
        metadata: message.metadata
      });
      return null;
    });
    const gateway = createGateway({ homeDir, workspaceDir, bus, sessionManager, handleInbound });
    const gatewayStartAccount = vi.fn(async () => undefined);
    const runtimeState = createChannelRuntimeState({ workspaceDir, fakeChannel, handleInbound, gatewayStartAccount });
    const identityResolver = new IdentityResolver(db);

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway,
      employeeRepo,
      employeeSkillRepo,
      identityResolver,
      loadState: async () => runtimeState
    });

    await runtime.start();
    await publishDirectInbound(bus);

    await vi.waitFor(() => {
      expect(handleInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            content: expect.stringContaining("[发送者: 张三 (ID:user-1, 用户名:zhangsan, 技术部/工程师)]")
          })
        })
      );
    });

    await runtime.stop();
    await db.destroy();
  });

  it("falls back to senderId when identity is not found", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-channel-unknown-sender-");
    const workspaceDir = join(homeDir, "workspace");
    const { db, employeeRepo, employeeSkillRepo } = await createEmployeeRepos(homeDir);

    const bus = new MessageBus();
    const sessionManager = new SessionManager(workspaceDir);
    const fakeChannel = new FakeChannel({}, bus);
    const handleInbound = vi.fn(async ({ message }) => {
      await bus.publishOutbound({
        channel: message.channel,
        chatId: message.chatId,
        content: `echo:${message.content}`,
        media: [],
        metadata: message.metadata
      });
      return null;
    });
    const gateway = createGateway({ homeDir, workspaceDir, bus, sessionManager, handleInbound });
    const gatewayStartAccount = vi.fn(async () => undefined);
    const runtimeState = createChannelRuntimeState({ workspaceDir, fakeChannel, handleInbound, gatewayStartAccount });
    const identityResolver = new IdentityResolver(db);

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway,
      employeeRepo,
      employeeSkillRepo,
      identityResolver,
      loadState: async () => runtimeState
    });

    await runtime.start();
    await publishDirectInbound(bus);

    await vi.waitFor(() => {
      expect(handleInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            content: expect.stringContaining("[发送者: user-1]")
          })
        })
      );
    });

    await runtime.stop();
    await db.destroy();
  });

  it("re-applies extension registry to cached engines on runtime reload", async () => {
    const homeDir = createTempDir("nextclaw-digital-employee-registry-reload-");
    const workspaceDir = join(homeDir, "workspace");
    const bus = new MessageBus();
    const sessionManager = new SessionManager(workspaceDir);
    const engineApplyRuntimeConfig = vi.fn();
    const initialRegistry = {
      tools: [],
      diagnostics: [],
      channels: [],
      engines: [
        {
          extensionId: "test.mock",
          source: "workspace",
          kind: "mock",
          factory: () => ({
            kind: "mock",
            handleInbound: vi.fn(async () => null),
            processDirect: vi.fn(async () => "ok"),
            applyRuntimeConfig: engineApplyRuntimeConfig
          })
        }
      ]
    } satisfies ExtensionRegistry;
    const gateway = new NextclawEngineGateway({
      homeDir,
      workspaceDir,
      bus,
      sessionManager,
      extensionRegistry: initialRegistry,
      defaultConfig: {
        agents: {
          defaults: {
            engine: "mock",
            model: "openai/gpt-5"
          }
        }
      }
    });
    const engine = gateway.getOrCreateEngine("ops-bot", workspaceDir);
    expect(engine).toBeTruthy();

    const nextConfig = createConfig(workspaceDir);
    const nextRegistry = {
      ...initialRegistry,
      diagnostics: [{ level: "info", message: "reloaded" }]
    } satisfies ExtensionRegistry;

    gateway.applyRuntimeConfig(nextConfig, nextRegistry);

    expect(engineApplyRuntimeConfig).toHaveBeenCalledWith(nextConfig, nextRegistry);
  });
});

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
import { NextclawEngineGateway } from "../server/engine/NextclawEngineGateway";
import { DigitalEmployeeChannelRuntime } from "../server/runtime/channel-runtime";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
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

  get name(): string {
    return "dingtalk";
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(msg: { channel: string; chatId: string; content: string; metadata: Record<string, unknown> }): Promise<void> {
    this.sent.push(msg);
  }
}

function createExtensionRegistry(fakeChannel: FakeChannel): ExtensionRegistry {
  return {
    tools: [],
    diagnostics: [],
    engines: [
      {
        extensionId: "test.mock",
        source: "workspace",
        kind: "mock",
        factory: () => ({
          kind: "mock",
          handleInbound: vi.fn(async () => null),
          processDirect: vi.fn(async () => "ok"),
          applyRuntimeConfig: vi.fn()
        })
      }
    ],
    channels: [
      {
        extensionId: "test.channel",
        source: "workspace",
        channel: {
          id: "dingtalk",
          nextclaw: {
            isEnabled: () => true,
            createChannel: () => fakeChannel
          }
        }
      }
    ]
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("DigitalEmployeeChannelRuntime conversation commands", () => {
  it("clears the current peer session for /new without invoking the engine", async () => {
    const homeDir = createTempDir("channel-runtime-command-");
    const workspaceDir = join(homeDir, "workspace");
    const bus = new MessageBus();
    const sessionManager = new SessionManager(workspaceDir);
    const fakeChannel = new FakeChannel({}, bus);
    const extensionRegistry = createExtensionRegistry(fakeChannel);
    const gateway = new NextclawEngineGateway({
      homeDir,
      workspaceDir,
      bus,
      sessionManager,
      extensionRegistry,
      defaultConfig: {
        agents: {
          defaults: {
            engine: "mock",
            model: "openai/gpt-5"
          }
        }
      }
    });
    const getOrCreateEngineWithSecretsSpy = vi.spyOn(gateway, "getOrCreateEngineWithSecrets");
    const sessionKey = "agent:ops-bot:dingtalk:direct:user-1";
    const session = sessionManager.getOrCreate(sessionKey);
    sessionManager.addMessage(session, "user", "hello");
    sessionManager.addMessage(session, "assistant", "world");
    sessionManager.save(session);

    const runtime = new DigitalEmployeeChannelRuntime({
      gateway,
      employeeRepo: {
        getByCode: vi.fn(async () => ({
          id: "emp-1",
          code: "ops-bot",
          name: "运维助手",
          model: null
        }))
      } as never,
      employeeSkillRepo: {} as never,
      loadState: () => ({
        config: createConfig(workspaceDir),
        extensionRegistry,
        pluginRegistry: {
          plugins: [],
          tools: [],
          channels: [],
          providers: [],
          engines: [],
          diagnostics: []
        } satisfies PluginRegistry
      })
    });

    await runtime.start();
    try {
      await bus.publishInbound({
        channel: "dingtalk",
        senderId: "user-1",
        chatId: "dm:user-1",
        content: "/new",
        timestamp: new Date(),
        attachments: [],
        metadata: {
          accountId: "ops-bot",
          account_id: "ops-bot",
          peer_kind: "direct",
          peer_id: "user-1"
        }
      });

      await waitFor(() => fakeChannel.sent.length > 0);

      expect(fakeChannel.sent[0]?.content).toBe("好的，我们重新开始。接下来想聊什么？");
      expect(session.messages).toHaveLength(0);
      expect(getOrCreateEngineWithSecretsSpy).not.toHaveBeenCalled();
    } finally {
      await runtime.stop();
    }
  });
});

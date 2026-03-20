import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ensurePlatformDatabase, createPlatformKnex } from "../server/db/knex";
import { IntegrationConnectionRepository } from "../server/repositories/integration-connection-repository";
import {
  applyDingTalkConfigUpdate,
  applyEmployeeDingTalkBindingUpdate,
  getDingTalkChannelConfig,
  getDingTalkRuntimeConfig,
  getDingTalkRoutingConfig,
  getEmployeeDingTalkBinding,
  updateDingTalkChannelConfig,
  updateDingTalkRoutingConfig,
  updateEmployeeDingTalkBinding
} from "../server/runtime/dingtalk-config";

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
});

describe("dingtalk config storage", () => {
  it("persists dingtalk channel config in platform database", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-config-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    const initial = await getDingTalkChannelConfig(repo);
    expect(initial.accounts).toEqual([]);

    await updateDingTalkChannelConfig(repo, {
      enabled: true,
      defaultAccountId: "ops-bot",
      upserts: [
        {
          accountId: "ops-bot",
          clientId: "app-key",
          clientSecret: "app-secret",
          robotCode: "robot-code",
          corpId: "corp-id",
          agentId: "agent-id"
        }
      ]
    });

    const saved = await getDingTalkChannelConfig(repo);
    expect(saved.enabled).toBe(true);
    expect(saved.defaultAccountId).toBe("ops-bot");
    expect(saved.accounts).toContainEqual(
      expect.objectContaining({
        accountId: "ops-bot",
        clientId: "app-key",
        clientSecretSet: true,
        robotCode: "robot-code"
      })
    );
    await db.destroy();
  });

  it("builds runtime config from database with preserved client secrets", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-runtime-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateDingTalkChannelConfig(repo, {
      enabled: true,
      defaultAccountId: "ops-bot",
      upserts: [
        {
          accountId: "ops-bot",
          clientId: "app-key",
          clientSecret: "app-secret",
          robotCode: "robot-code"
        }
      ]
    });

    await updateDingTalkChannelConfig(repo, {
      upserts: [
        {
          accountId: "ops-bot",
          robotCode: "robot-code-v2"
        }
      ]
    });

    const runtime = await getDingTalkRuntimeConfig(repo);
    const dingtalk = (runtime.channels as { dingtalk: { accounts: Record<string, { clientSecret: string; robotCode: string }> } })
      .dingtalk;

    expect(dingtalk.accounts["ops-bot"]?.clientSecret).toBe("app-secret");
    expect(dingtalk.accounts["ops-bot"]?.robotCode).toBe("robot-code-v2");
    await db.destroy();
  });

  it("preserves client secret when renaming an account id", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-rename-secret-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateDingTalkChannelConfig(repo, {
      enabled: true,
      defaultAccountId: "ops-bot",
      upserts: [
        {
          accountId: "ops-bot",
          clientId: "app-key",
          clientSecret: "app-secret"
        }
      ]
    });

    await updateDingTalkChannelConfig(repo, {
      defaultAccountId: "ops-renamed",
      removeAccountIds: ["ops-bot"],
      upserts: [
        {
          sourceAccountId: "ops-bot",
          accountId: "ops-renamed",
          clientId: "app-key-renamed"
        }
      ]
    });

    const runtime = await getDingTalkRuntimeConfig(repo);
    const dingtalk = (runtime.channels as { dingtalk: { accounts: Record<string, { clientSecret: string; clientId: string }> } })
      .dingtalk;

    expect(dingtalk.accounts["ops-renamed"]?.clientSecret).toBe("app-secret");
    expect(dingtalk.accounts["ops-renamed"]?.clientId).toBe("app-key-renamed");
    await db.destroy();
  });

  it("persists employee direct and group bindings in platform database", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-routing-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateEmployeeDingTalkBinding(repo, "ops-bot", {
      directAccountIds: ["ops-bot"],
      groupBindings: [
        {
          groupId: "cid-risk",
          accountId: "ops-bot",
          allowCollaboration: true,
          allowedEmployeeCodes: ["ops-bot", "daily-bot"]
        }
      ]
    });

    const routing = await getDingTalkRoutingConfig(repo);
    const employeeBinding = await getEmployeeDingTalkBinding(repo, "ops-bot");

    expect(routing.defaultByAccount["ops-bot"]).toBe("ops-bot");
    expect(routing.groups).toContainEqual({
      groupId: "cid-risk",
      employeeCode: "ops-bot",
      accountId: "ops-bot",
      allowCollaboration: true,
      allowedEmployeeCodes: ["ops-bot", "daily-bot"]
    });
    expect(employeeBinding).toEqual({
      employeeCode: "ops-bot",
      directAccountIds: ["ops-bot"],
      groupBindings: [
        {
          groupId: "cid-risk",
          accountId: "ops-bot",
          allowCollaboration: true,
          allowedEmployeeCodes: ["ops-bot", "daily-bot"]
        }
      ]
    });
    await db.destroy();
  });

  it("preserves multiple direct accounts for one employee", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-multi-direct-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateEmployeeDingTalkBinding(repo, "ops-bot", {
      directAccountIds: ["ops-bot", "daily-bot"]
    });

    const routing = await getDingTalkRoutingConfig(repo);
    const employeeBinding = await getEmployeeDingTalkBinding(repo, "ops-bot");

    expect(routing.defaultByAccount).toEqual({
      "ops-bot": "ops-bot",
      "daily-bot": "ops-bot"
    });
    expect(employeeBinding.directAccountIds).toEqual(["daily-bot", "ops-bot"]);
    await db.destroy();
  });

  it("keeps same group id bindings separate across different accounts", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-routing-same-group-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateEmployeeDingTalkBinding(repo, "ops-bot", {
      groupBindings: [
        {
          groupId: "cid-shared",
          accountId: "ops-bot",
          allowCollaboration: false,
          allowedEmployeeCodes: []
        }
      ]
    });
    await updateEmployeeDingTalkBinding(repo, "daily-bot", {
      groupBindings: [
        {
          groupId: "cid-shared",
          accountId: "daily-bot",
          allowCollaboration: false,
          allowedEmployeeCodes: []
        }
      ]
    });

    const routing = await getDingTalkRoutingConfig(repo);

    expect(routing.groups).toContainEqual(
      expect.objectContaining({
        groupId: "cid-shared",
        accountId: "ops-bot",
        employeeCode: "ops-bot"
      })
    );
    expect(routing.groups).toContainEqual(
      expect.objectContaining({
        groupId: "cid-shared",
        accountId: "daily-bot",
        employeeCode: "daily-bot"
      })
    );
    await db.destroy();
  });

  it("rolls back stored config when runtime reload fails", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-rollback-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateDingTalkChannelConfig(repo, {
      enabled: true,
      defaultAccountId: "ops-bot",
      upserts: [
        {
          accountId: "ops-bot",
          clientId: "app-key",
          clientSecret: "app-secret"
        }
      ]
    });

    await expect(
      applyDingTalkConfigUpdate(repo, {
        channel: {
          enabled: true,
          defaultAccountId: "broken-bot",
          removeAccountIds: ["ops-bot"],
          upserts: [
            {
              sourceAccountId: "ops-bot",
              accountId: "broken-bot",
              clientId: "broken-key"
            }
          ]
        },
        routing: {
          defaultByAccount: {
            "broken-bot": "ops-bot"
          },
          groups: []
        },
        reload: async () => {
          throw new Error("reload failed");
        }
      })
    ).rejects.toThrow("reload failed");

    const channel = await getDingTalkChannelConfig(repo);
    const runtime = await getDingTalkRuntimeConfig(repo);
    const dingtalk = (runtime.channels as { dingtalk: { accounts: Record<string, { clientSecret: string }> } }).dingtalk;

    expect(channel.defaultAccountId).toBe("ops-bot");
    expect(channel.accounts).toContainEqual(
      expect.objectContaining({
        accountId: "ops-bot",
        clientId: "app-key",
        clientSecretSet: true
      })
    );
    expect(dingtalk.accounts["ops-bot"]?.clientSecret).toBe("app-secret");
    expect(dingtalk.accounts["broken-bot"]).toBeUndefined();
    await db.destroy();
  });

  it("migrates routing references when an account is renamed through config updates", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-rename-routing-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateDingTalkChannelConfig(repo, {
      enabled: true,
      defaultAccountId: "ops-bot",
      upserts: [
        {
          accountId: "ops-bot",
          clientId: "app-key",
          clientSecret: "app-secret"
        }
      ]
    });
    await updateDingTalkRoutingConfig(repo, {
      defaultByAccount: {
        "ops-bot": "ops-bot"
      },
      groups: [
        {
          groupId: "cid-risk",
          employeeCode: "risk-bot",
          accountId: "ops-bot",
          allowCollaboration: true,
          allowedEmployeeCodes: ["risk-bot", "daily-bot"]
        }
      ]
    });

    const result = await applyDingTalkConfigUpdate(repo, {
      channel: {
        defaultAccountId: "ops-renamed",
        removeAccountIds: ["ops-bot"],
        upserts: [
          {
            sourceAccountId: "ops-bot",
            accountId: "ops-renamed",
            clientId: "app-key-renamed"
          }
        ]
      },
      reload: async () => {}
    });

    const routing = await getDingTalkRoutingConfig(repo);

    expect(result.routing).toEqual({
      defaultByAccount: {
        "ops-renamed": "ops-bot"
      },
      groups: [
        {
          groupId: "cid-risk",
          employeeCode: "risk-bot",
          accountId: "ops-renamed",
          allowCollaboration: true,
          allowedEmployeeCodes: ["risk-bot", "daily-bot"]
        }
      ]
    });
    expect(routing).toEqual(result.routing);
    await db.destroy();
  });

  it("rewrites a renamed defaultAccountId even when the submitted default still uses the old account id", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-rename-default-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateDingTalkChannelConfig(repo, {
      enabled: true,
      defaultAccountId: "ops-bot",
      upserts: [
        {
          accountId: "ops-bot",
          clientId: "app-key",
          clientSecret: "app-secret"
        }
      ]
    });

    const result = await applyDingTalkConfigUpdate(repo, {
      channel: {
        defaultAccountId: "ops-bot",
        removeAccountIds: ["ops-bot"],
        upserts: [
          {
            sourceAccountId: "ops-bot",
            accountId: "ops-renamed",
            clientId: "app-key-renamed"
          }
        ]
      },
      reload: async () => {}
    });

    const channel = await getDingTalkChannelConfig(repo);

    expect(result.channel.defaultAccountId).toBe("ops-renamed");
    expect(channel.defaultAccountId).toBe("ops-renamed");
    await db.destroy();
  });

  it("rolls back employee bindings when runtime reload fails", async () => {
    const homeDir = createTempDir("nextclaw-dingtalk-binding-rollback-db-");
    const db = createPlatformKnex(join(homeDir, "platform.sqlite"));
    await ensurePlatformDatabase(db);
    const repo = new IntegrationConnectionRepository(db);

    await updateEmployeeDingTalkBinding(repo, "ops-bot", {
      directAccountIds: ["ops-bot"],
      groupBindings: [
        {
          groupId: "cid-risk",
          accountId: "ops-bot",
          allowCollaboration: true,
          allowedEmployeeCodes: ["ops-bot", "daily-bot"]
        }
      ]
    });

    await expect(
      applyEmployeeDingTalkBindingUpdate(repo, "ops-bot", {
        patch: {
          directAccountIds: ["ops-renamed"],
          groupBindings: [
            {
              groupId: "cid-risk",
              accountId: "ops-renamed",
              allowCollaboration: false,
              allowedEmployeeCodes: []
            }
          ]
        },
        reload: async () => {
          throw new Error("reload failed");
        }
      })
    ).rejects.toThrow("reload failed");

    const routing = await getDingTalkRoutingConfig(repo);
    expect(routing).toEqual({
      defaultByAccount: {
        "ops-bot": "ops-bot"
      },
      groups: [
        {
          groupId: "cid-risk",
          employeeCode: "ops-bot",
          accountId: "ops-bot",
          allowCollaboration: true,
          allowedEmployeeCodes: ["ops-bot", "daily-bot"]
        }
      ]
    });
    await db.destroy();
  });
});

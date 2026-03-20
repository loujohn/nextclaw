import { describe, expect, it } from "vitest";
import { buildPlatformGatewayConfig } from "../server/runtime/platform-context";
import { buildPlatformRuntimeConfig } from "../server/runtime/openclaw-runtime";

describe("platform gateway runtime config", () => {
  it("uses explicit provider env vars for model, api base, and api key", () => {
    const config = buildPlatformGatewayConfig({
      NEXTCLAW_MODEL: "openai/gpt-4o-mini",
      NEXTCLAW_PROVIDER_NAME: "openai",
      NEXTCLAW_PROVIDER_API_BASE: "https://relay.example.com/v1",
      NEXTCLAW_PROVIDER_API_KEY: "sk-relay"
    });

    expect(config.agents?.defaults?.model).toBe("openai/gpt-4o-mini");
    expect(config.providers?.openai?.apiBase).toBe("https://relay.example.com/v1");
    expect(config.providers?.openai?.apiKey).toBe("sk-relay");
  });

  it("falls back to provider-specific env key inferred from model prefix", () => {
    const config = buildPlatformGatewayConfig({
      NEXTCLAW_MODEL: "dashscope/qwen3.5-flash",
      DASHSCOPE_API_KEY: "dashscope-token"
    });

    expect(config.agents?.defaults?.model).toBe("dashscope/qwen3.5-flash");
    expect(config.providers?.dashscope?.apiKey).toBe("dashscope-token");
    expect(config.providers?.dashscope?.apiBase).toBeNull();
  });

  it("supports custom provider prefixes for openai-compatible relays", () => {
    const config = buildPlatformGatewayConfig({
      NEXTCLAW_MODEL: "relay-a/gpt-4.1-mini",
      NEXTCLAW_PROVIDER_API_BASE: "https://relay-a.internal/v1",
      NEXTCLAW_PROVIDER_API_KEY: "relay-token"
    });

    expect(config.providers?.["relay-a"]?.apiKey).toBe("relay-token");
    expect(config.providers?.["relay-a"]?.apiBase).toBe("https://relay-a.internal/v1");
  });

  it("composes db-backed dingtalk channel config into standard runtime config", () => {
    const config = buildPlatformRuntimeConfig({
      workspaceDir: "/tmp/workspace",
      overrideConfig: buildPlatformGatewayConfig({
        NEXTCLAW_MODEL: "openai/gpt-5",
        NEXTCLAW_PROVIDER_API_KEY: "sk-test"
      }),
      runtimeConfig: {
        channels: {
          dingtalk: {
            enabled: true,
            defaultAccountId: "ops-bot",
            accounts: {
              "ops-bot": {
                clientId: "app-key",
                clientSecret: "app-secret",
                robotCode: "robot-code",
                corpId: "corp-id",
                agentId: "agent-id"
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
      }
    });

    expect(config.channels.dingtalk.enabled).toBe(true);
    expect(config.channels.dingtalk.accounts["ops-bot"]?.clientId).toBe("app-key");
    expect(config.bindings).toContainEqual(
      expect.objectContaining({
        agentId: "ops-bot",
        match: {
          channel: "dingtalk",
          accountId: "ops-bot"
        }
      })
    );
  });
});

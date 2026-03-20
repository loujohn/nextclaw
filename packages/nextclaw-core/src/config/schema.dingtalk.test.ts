import { describe, expect, it } from "vitest";
import { ConfigSchema } from "./schema.js";

describe("dingtalk config schema", () => {
  it("supports multi-account routing config", () => {
    const config = ConfigSchema.parse({
      channels: {
        dingtalk: {
          enabled: true,
          defaultAccountId: "ops-bot",
          accounts: {
            "ops-bot": {
              clientId: "ding-client",
              clientSecret: "ding-secret",
              robotCode: "ding-robot",
              corpId: "ding-corp",
              agentId: "100001",
              dmPolicy: "allowlist",
              groupPolicy: "allowlist",
              allowFrom: ["user-a"],
              groupAllowFrom: ["cid-team-1"],
              requireMention: true,
              mentionPatterns: ["日报员工"],
              groups: {
                "cid-team-1": {
                  requireMention: true,
                  mentionPatterns: ["项目日报"]
                }
              }
            }
          }
        }
      }
    });

    expect(config.channels.dingtalk.enabled).toBe(true);
    expect(config.channels.dingtalk.defaultAccountId).toBe("ops-bot");
    expect(config.channels.dingtalk.accounts["ops-bot"]?.robotCode).toBe("ding-robot");
    expect(config.channels.dingtalk.accounts["ops-bot"]?.groupAllowFrom).toEqual(["cid-team-1"]);
    expect(config.channels.dingtalk.accounts["ops-bot"]?.groups["cid-team-1"]).toEqual({
      requireMention: true,
      mentionPatterns: ["项目日报"]
    });
  });

  it("keeps legacy single-account fields parseable", () => {
    const config = ConfigSchema.parse({
      channels: {
        dingtalk: {
          enabled: true,
          clientId: "legacy-client",
          clientSecret: "legacy-secret",
          robotCode: "legacy-robot",
          allowFrom: ["user-1"]
        }
      }
    });

    expect(config.channels.dingtalk.clientId).toBe("legacy-client");
    expect(config.channels.dingtalk.clientSecret).toBe("legacy-secret");
    expect(config.channels.dingtalk.accounts).toEqual({});
    expect(config.channels.dingtalk.defaultAccountId).toBe("default");
  });
});

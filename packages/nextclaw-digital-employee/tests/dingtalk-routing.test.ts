import { describe, expect, it } from "vitest";
import { ConfigSchema } from "@nextclaw/core";
import {
  mergeDingTalkEmployeeBindings,
  readDingTalkEmployeeBindings
} from "../server/runtime/dingtalk-config";

describe("dingtalk employee bindings", () => {
  it("reads employee routing bindings from nextclaw config bindings", () => {
    const bindings = readDingTalkEmployeeBindings({
      bindings: [
        {
          agentId: "daily-bot",
          match: {
            channel: "dingtalk",
            accountId: "ops-bot"
          }
        },
        {
          agentId: "risk-bot",
          match: {
            channel: "dingtalk",
            accountId: "ops-bot",
            peer: {
              kind: "group",
              id: "cid-risk"
            }
          }
        }
      ]
    });

    expect(bindings.defaultByAccount["ops-bot"]).toBe("daily-bot");
    expect(bindings.groups).toContainEqual(
      expect.objectContaining({
        groupId: "cid-risk",
        employeeCode: "risk-bot",
        accountId: "ops-bot"
      })
    );
  });

  it("merges employee and group routing config back into bindings", () => {
    const config = mergeDingTalkEmployeeBindings(
      {
        bindings: [
          {
            agentId: "other-channel",
            match: {
              channel: "telegram"
            }
          }
        ]
      },
      {
        defaultByAccount: {
          "ops-bot": "daily-bot"
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
      }
    );

    expect(config.bindings).toContainEqual({
      agentId: "daily-bot",
      match: {
        channel: "dingtalk",
        accountId: "ops-bot"
      }
    });
    expect(config.bindings).toContainEqual({
      agentId: "risk-bot",
      match: {
        channel: "dingtalk",
        accountId: "ops-bot",
        peer: {
          kind: "group",
          id: "cid-risk"
        }
      },
      metadata: {
        allowCollaboration: true,
        allowedEmployeeCodes: ["risk-bot", "daily-bot"]
      }
    });
    expect(config.bindings).toContainEqual({
      agentId: "other-channel",
      match: {
        channel: "telegram"
      }
    });
  });

  it("keeps group collaboration metadata after config schema parsing", () => {
    const merged = mergeDingTalkEmployeeBindings(
      { bindings: [] },
      {
        defaultByAccount: {},
        groups: [
          {
            groupId: "cid-risk",
            employeeCode: "risk-bot",
            accountId: "ops-bot",
            allowCollaboration: true,
            allowedEmployeeCodes: ["risk-bot", "daily-bot"]
          }
        ]
      }
    );

    const parsed = ConfigSchema.parse({ bindings: merged.bindings });
    const roundtrip = readDingTalkEmployeeBindings(parsed);

    expect(roundtrip.groups).toContainEqual({
      groupId: "cid-risk",
      employeeCode: "risk-bot",
      accountId: "ops-bot",
      allowCollaboration: true,
      allowedEmployeeCodes: ["risk-bot", "daily-bot"]
    });
  });

  it("preserves same group id for different dingtalk accounts", () => {
    const merged = mergeDingTalkEmployeeBindings(
      { bindings: [] },
      {
        defaultByAccount: {},
        groups: [
          {
            groupId: "cid-team",
            employeeCode: "ops-bot",
            accountId: "ops-bot",
            allowCollaboration: false,
            allowedEmployeeCodes: []
          },
          {
            groupId: "cid-team",
            employeeCode: "daily-bot",
            accountId: "daily-bot",
            allowCollaboration: false,
            allowedEmployeeCodes: []
          }
        ]
      }
    );

    const roundtrip = readDingTalkEmployeeBindings({ bindings: merged.bindings });

    expect(roundtrip.groups).toContainEqual(
      expect.objectContaining({
        groupId: "cid-team",
        accountId: "ops-bot",
        employeeCode: "ops-bot"
      })
    );
    expect(roundtrip.groups).toContainEqual(
      expect.objectContaining({
        groupId: "cid-team",
        accountId: "daily-bot",
        employeeCode: "daily-bot"
      })
    );
  });

});

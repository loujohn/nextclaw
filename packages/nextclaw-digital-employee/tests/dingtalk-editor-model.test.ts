import { describe, expect, it } from "vitest";
import {
  applyDingTalkAccountRenames,
  buildDingTalkAccountGroupOverrides,
  buildEditableDingTalkGroupBindings,
  createEmptyDingTalkGroupBinding
} from "../shared/dingtalk-editor-model";

describe("dingtalk editor model", () => {
  it("hydrates group bindings with mention settings from account group rules", () => {
    const bindings = buildEditableDingTalkGroupBindings({
      accounts: [
        {
          accountId: "ops-bot",
          requireMention: true,
          mentionPatterns: ["机器人"],
          groups: {
            "cid-risk": {
              requireMention: false,
              mentionPatterns: []
            }
          }
        }
      ],
      routingGroups: [
        {
          groupId: "cid-risk",
          employeeCode: "risk-bot",
          accountId: "ops-bot",
          allowCollaboration: true,
          allowedEmployeeCodes: ["risk-bot", "daily-bot"]
        }
      ]
    });

    expect(bindings).toEqual([
      {
        groupId: "cid-risk",
        accountId: "ops-bot",
        employeeCode: "risk-bot",
        allowCollaboration: true,
        allowedEmployeeCodesText: "risk-bot, daily-bot",
        requireMention: false,
        mentionPatternsText: ""
      }
    ]);
  });

  it("builds account group overrides from editable group bindings", () => {
    const overrides = buildDingTalkAccountGroupOverrides({
      accounts: [
        {
          accountId: "ops-bot",
          requireMention: true,
          mentionPatterns: ["机器人"],
          groups: {
            "*": {
              requireMention: true,
              mentionPatterns: ["机器人"]
            }
          }
        }
      ],
      groups: [
        {
          groupId: "cid-risk",
          accountId: "ops-bot",
          employeeCode: "risk-bot",
          allowCollaboration: false,
          allowedEmployeeCodesText: "",
          requireMention: false,
          mentionPatternsText: ""
        },
        {
          groupId: "cid-daily",
          accountId: "ops-bot",
          employeeCode: "daily-bot",
          allowCollaboration: false,
          allowedEmployeeCodesText: "",
          requireMention: true,
          mentionPatternsText: "日报员工, 日报"
        }
      ]
    });

    expect(overrides).toEqual({
      "ops-bot": {
        "*": {
          requireMention: true,
          mentionPatterns: ["机器人"]
        },
        "cid-risk": {
          requireMention: false,
          mentionPatterns: []
        },
        "cid-daily": {
          requireMention: true,
          mentionPatterns: ["日报员工", "日报"]
        }
      }
    });
  });

  it("preserves routing references when an account id is renamed", () => {
    const remapped = applyDingTalkAccountRenames({
      accounts: [
        {
          accountId: "ops-renamed",
          sourceAccountId: "ops-bot"
        },
        {
          accountId: "daily-bot",
          sourceAccountId: "daily-bot"
        }
      ],
      defaultByAccount: {
        "ops-bot": "ops-bot",
        "daily-bot": "daily-bot"
      },
      groups: [
        {
          groupId: "cid-risk",
          accountId: "ops-bot",
          employeeCode: "risk-bot",
          allowCollaboration: true,
          allowedEmployeeCodesText: "risk-bot, daily-bot",
          requireMention: false,
          mentionPatternsText: ""
        },
        {
          groupId: "cid-daily",
          accountId: "daily-bot",
          employeeCode: "daily-bot",
          allowCollaboration: false,
          allowedEmployeeCodesText: "",
          requireMention: true,
          mentionPatternsText: "日报员工"
        }
      ]
    });

    expect(remapped.defaultByAccount).toEqual({
      "ops-renamed": "ops-bot",
      "daily-bot": "daily-bot"
    });
    expect(remapped.groups).toContainEqual(
      expect.objectContaining({
        groupId: "cid-risk",
        accountId: "ops-renamed"
      })
    );
    expect(remapped.groups).toContainEqual(
      expect.objectContaining({
        groupId: "cid-daily",
        accountId: "daily-bot"
      })
    );
  });

  it("creates new group bindings with mention disabled by default", () => {
    expect(createEmptyDingTalkGroupBinding("ops-bot")).toEqual({
      groupId: "",
      accountId: "ops-bot",
      employeeCode: "",
      allowCollaboration: false,
      allowedEmployeeCodesText: "",
      requireMention: false,
      mentionPatternsText: ""
    });
  });
});

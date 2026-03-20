import { describe, expect, it } from "vitest";
import {
  evaluateChannelAccessPolicy,
  matchesMentionPattern,
  resolveGroupMentionPolicy
} from "./policy.js";

describe("evaluateChannelAccessPolicy", () => {
  it("allows open direct messages by default", () => {
    expect(
      evaluateChannelAccessPolicy(
        {
          dmPolicy: "open",
          allowFrom: []
        },
        {
          senderId: "user-a",
          chatId: "user-a",
          isGroup: false
        }
      )
    ).toBe(true);
  });

  it("requires sender allowlist for direct allowlist and pairing policies", () => {
    expect(
      evaluateChannelAccessPolicy(
        {
          dmPolicy: "allowlist",
          allowFrom: ["user-a"]
        },
        {
          senderId: "user-b",
          chatId: "user-b",
          isGroup: false
        }
      )
    ).toBe(false);

    expect(
      evaluateChannelAccessPolicy(
        {
          dmPolicy: "pairing",
          allowFrom: ["user-a"]
        },
        {
          senderId: "user-a",
          chatId: "user-a",
          isGroup: false
        }
      )
    ).toBe(true);
  });

  it("requires group allowlist membership when groupPolicy is allowlist", () => {
    expect(
      evaluateChannelAccessPolicy(
        {
          groupPolicy: "allowlist",
          groupAllowFrom: ["cid-team"]
        },
        {
          senderId: "user-a",
          chatId: "cid-other",
          isGroup: true
        }
      )
    ).toBe(false);

    expect(
      evaluateChannelAccessPolicy(
        {
          groupPolicy: "allowlist",
          groupAllowFrom: ["cid-team"]
        },
        {
          senderId: "user-a",
          chatId: "cid-team",
          isGroup: true
        }
      )
    ).toBe(true);
  });
});

describe("resolveGroupMentionPolicy", () => {
  it("disables mention requirement for direct chats", () => {
    expect(
      resolveGroupMentionPolicy(
        {
          requireMention: true,
          mentionPatterns: ["bot"]
        },
        {
          chatId: "user-a",
          isGroup: false
        }
      )
    ).toEqual({
      requireMention: false,
      mentionPatterns: []
    });
  });

  it("merges account-level and group-level mention patterns", () => {
    expect(
      resolveGroupMentionPolicy(
        {
          requireMention: true,
          mentionPatterns: ["日报员工"],
          groups: {
            "cid-risk": {
              requireMention: true,
              mentionPatterns: ["风险"]
            }
          }
        },
        {
          chatId: "cid-risk",
          isGroup: true
        }
      )
    ).toEqual({
      requireMention: true,
      mentionPatterns: ["日报员工", "风险"]
    });
  });
});

describe("matchesMentionPattern", () => {
  it("falls back to case-insensitive includes for invalid regex patterns", () => {
    expect(matchesMentionPattern("请@日报员工处理", ["["])).toBe(false);
    expect(matchesMentionPattern("请日报员工处理", ["日报员工("])).toBe(false);
    expect(matchesMentionPattern("请日报员工处理", ["日报员工"])).toBe(true);
  });
});

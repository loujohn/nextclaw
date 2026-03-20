import { describe, expect, it, vi } from "vitest";
import { MessageBus } from "@nextclaw/core";
import { normalizeInboundDingTalkMessage, resolveOutboundTarget } from "./message-normalizer";
import { DingTalkChannel } from "./channel";

const clientInstances: Array<{
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  registerCallbackListener: ReturnType<typeof vi.fn>;
  registerAllEventListener: ReturnType<typeof vi.fn>;
  socketCallBackResponse: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("dingtalk-stream", () => {
  class MockDWClient {
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(() => undefined);
    registerCallbackListener = vi.fn(() => undefined);
    registerAllEventListener = vi.fn(() => undefined);
    socketCallBackResponse = vi.fn(() => undefined);

    constructor(options: { clientId: string }) {
      if (options.clientId === "client-bad") {
        this.connect = vi.fn(async () => {
          throw new Error("connect failed");
        });
      }
      clientInstances.push(this);
    }
  }

  return {
    DWClient: MockDWClient,
    EventAck: { SUCCESS: "SUCCESS" },
    TOPIC_ROBOT: "robot"
  };
});

describe("normalizeInboundDingTalkMessage", () => {
  it("maps direct messages to direct peer routing metadata", () => {
    const inbound = normalizeInboundDingTalkMessage({
      accountId: "ops-bot",
      data: {
        text: { content: "你好" },
        conversationType: "1",
        conversationId: "cid-direct-1",
        senderId: "origin-user",
        senderStaffId: "staff-user",
        senderNick: "张三",
        chatbotUserId: "bot-user-id"
      }
    });

    expect(inbound).toMatchObject({
      senderId: "staff-user",
      chatId: "staff-user",
      content: "你好"
    });
    expect(inbound?.metadata).toMatchObject({
      account_id: "ops-bot",
      accountId: "ops-bot",
      is_group: false,
      peer_kind: "direct",
      peer_id: "staff-user"
    });
  });

  it("maps group messages to conversation-scoped routing metadata", () => {
    const inbound = normalizeInboundDingTalkMessage({
      accountId: "ops-bot",
      data: {
        text: { content: "@日报员工 请看下今天风险" },
        conversationType: "2",
        conversationId: "cid-group-1",
        conversationTitle: "项目日报群",
        senderId: "origin-user",
        senderStaffId: "staff-user",
        senderNick: "李四",
        chatbotUserId: "bot-user-id"
      },
      requireMention: true,
      mentionPatterns: ["日报员工"]
    });

    expect(inbound?.chatId).toBe("cid-group-1");
    expect(inbound?.metadata).toMatchObject({
      is_group: true,
      peer_kind: "group",
      peer_id: "cid-group-1",
      was_mentioned: true,
      require_mention: true,
      conversation_id: "cid-group-1",
      conversation_title: "项目日报群"
    });
  });

  it("treats native DingTalk mention flags as a valid mention signal", () => {
    const inbound = normalizeInboundDingTalkMessage({
      accountId: "ops-bot",
      data: {
        text: { content: "你是谁" },
        conversationType: "2",
        conversationId: "cid-group-1",
        senderId: "origin-user",
        senderStaffId: "staff-user",
        chatbotUserId: "bot-user-id",
        isInAtList: true
      },
      requireMention: true,
      mentionPatterns: []
    });

    expect(inbound?.metadata).toMatchObject({
      require_mention: true,
      was_mentioned: true
    });
  });
});

describe("resolveOutboundTarget", () => {
  it("uses conversation id for group replies and sender id for direct replies", () => {
    expect(
      resolveOutboundTarget({
        chatId: "ignored-direct-chat-id",
        metadata: {
          peer_kind: "direct",
          sender_staff_id: "staff-user"
        }
      })
    ).toEqual({ kind: "direct", targetId: "staff-user" });

    expect(
      resolveOutboundTarget({
        chatId: "cid-group-1",
        metadata: {
          peer_kind: "group",
          conversation_id: "cid-group-1"
        }
      })
    ).toEqual({ kind: "group", targetId: "cid-group-1" });
  });
});

describe("DingTalkChannel", () => {
  it("disconnects already-started clients when one account fails during startup", async () => {
    clientInstances.length = 0;
    const channel = new DingTalkChannel(
      {
        enabled: true,
        defaultAccountId: "ops-bot",
        accounts: {
          "ops-bot": {
            clientId: "client-ok",
            clientSecret: "secret-ok",
            robotCode: "",
            corpId: "",
            agentId: "",
            allowFrom: [],
            dmPolicy: "open",
            groupPolicy: "open",
            groupAllowFrom: [],
            requireMention: false,
            mentionPatterns: [],
            groups: {}
          },
          "bad-bot": {
            clientId: "client-bad",
            clientSecret: "secret-bad",
            robotCode: "",
            corpId: "",
            agentId: "",
            allowFrom: [],
            dmPolicy: "open",
            groupPolicy: "open",
            groupAllowFrom: [],
            requireMention: false,
            mentionPatterns: [],
            groups: {}
          }
        }
      },
      new MessageBus()
    );

    await expect(channel.start()).rejects.toThrow("connect failed");
    expect(clientInstances[0]?.disconnect).toHaveBeenCalled();
    expect(channel.isRunning).toBe(false);
  });

  it("acks callback even when message handling fails", async () => {
    clientInstances.length = 0;
    const channel = new DingTalkChannel(
      {
        enabled: true,
        defaultAccountId: "ops-bot",
        accounts: {
          "ops-bot": {
            clientId: "client-ok",
            clientSecret: "secret-ok",
            robotCode: "",
            corpId: "",
            agentId: "",
            allowFrom: [],
            dmPolicy: "open",
            groupPolicy: "open",
            groupAllowFrom: [],
            requireMention: false,
            mentionPatterns: [],
            groups: {}
          }
        }
      },
      new MessageBus()
    );
    await channel.start();
    vi.spyOn(channel as any, "handleMessage").mockRejectedValue(new Error("boom"));

    await expect(
      (channel as any).handleRobotMessage("ops-bot", {
        clientId: "client-ok",
        clientSecret: "secret-ok",
        robotCode: "",
        corpId: "",
        agentId: "",
        allowFrom: [],
        dmPolicy: "open",
        groupPolicy: "open",
        groupAllowFrom: [],
        requireMention: false,
        mentionPatterns: [],
        groups: {}
      }, {
        data: JSON.stringify({
          text: { content: "hello" },
          conversationType: "1",
          conversationId: "cid-direct-1",
          senderId: "origin-user",
          senderStaffId: "staff-user"
        }),
        headers: { messageId: "msg-1" }
      })
    ).resolves.toBeUndefined();

    expect(clientInstances[0]?.socketCallBackResponse).toHaveBeenCalledWith("msg-1", { ok: true });
  });
});

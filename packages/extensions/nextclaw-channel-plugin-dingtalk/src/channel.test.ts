import https from "node:https";
import { EventEmitter } from "node:events";
import { HttpsProxyAgent } from "https-proxy-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBus } from "@nextclaw/core";
import { normalizeInboundDingTalkMessage, resolveOutboundTarget } from "./message-normalizer";
import { DingTalkChannel } from "./channel";

let mockConnectHost = "api.dingtalk.com";
let mockConnectPort = 443;

const clientInstances: Array<{
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  registerCallbackListener: ReturnType<typeof vi.fn>;
  registerAllEventListener: ReturnType<typeof vi.fn>;
  socketCallBackResponse: ReturnType<typeof vi.fn>;
  sslopts?: { agent?: { addRequest?: (...args: unknown[]) => void } };
}> = [];

vi.mock("dingtalk-stream", () => {
  class MockDWClient {
    connected = false;
    sslopts?: { agent?: { addRequest?: (...args: unknown[]) => void } };
    socket?: EventEmitter;
    _connect = vi.fn(async () => {
      this.sslopts?.agent?.addRequest?.(
        new EventEmitter(),
        {
          host: mockConnectHost,
          hostname: mockConnectHost,
          port: mockConnectPort
        }
      );
      this.socket = new EventEmitter();
      this.connected = true;
    });
    connect = vi.fn(async () => {
      await this._connect();
    });
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

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("HTTPS_PROXY", "");
  vi.stubEnv("https_proxy", "");
  vi.stubEnv("HTTP_PROXY", "");
  vi.stubEnv("http_proxy", "");
  vi.stubEnv("NO_PROXY", "");
  vi.stubEnv("no_proxy", "");
  mockConnectHost = "api.dingtalk.com";
  mockConnectPort = 443;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
  it("bypasses proxy for WebSocket targets matched by CIDR NO_PROXY", async () => {
    clientInstances.length = 0;
    mockConnectHost = "172.31.1.95";
    mockConnectPort = 1080;
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1,172.31.0.0/16");
    const directAddRequest = vi
      .spyOn(https.Agent.prototype as any, "addRequest")
      .mockImplementation(() => undefined);
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

    expect(clientInstances[0]?.sslopts?.agent).not.toBeInstanceOf(HttpsProxyAgent);
    expect(directAddRequest).toHaveBeenCalledTimes(1);
  });

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

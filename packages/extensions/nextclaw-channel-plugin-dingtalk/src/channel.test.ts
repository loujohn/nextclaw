import https from "node:https";
import { EventEmitter } from "node:events";
import { HttpsProxyAgent } from "https-proxy-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBus, type Config } from "@nextclaw/core";
import { normalizeInboundDingTalkMessage, resolveOutboundTarget } from "./message-normalizer";
import { DingTalkChannel } from "./channel";

const mockUndiciFetch = vi.hoisted(() => vi.fn());
const MockEnvHttpProxyAgent = vi.hoisted(() =>
  vi.fn(function EnvHttpProxyAgent() {})
);

vi.mock("undici", () => ({
  EnvHttpProxyAgent: MockEnvHttpProxyAgent,
  fetch: mockUndiciFetch
}));

let mockConnectHost = "api.dingtalk.com";
let mockConnectPort = 443;
let mockSocketOpenMode: "open" | "delayed-open" | "never" = "open";
let mockSdkEndpointUrl = "wss://stream.dingtalk.test/connect";
let mockSdkEndpointError: Error | null = null;

const clientInstances: Array<{
  connect: ReturnType<typeof vi.fn>;
  sdkConnect: ReturnType<typeof vi.fn>;
  sdkGetEndpoint: ReturnType<typeof vi.fn>;
  getEndpoint: ReturnType<typeof vi.fn>;
  _connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  registerCallbackListener: ReturnType<typeof vi.fn>;
  registerAllEventListener: ReturnType<typeof vi.fn>;
  socketCallBackResponse: ReturnType<typeof vi.fn>;
  sslopts?: { agent?: { addRequest?: (...args: unknown[]) => void } };
  connectedAt?: number;
  config: {
    autoReconnect: boolean;
    clientId: string;
    clientSecret: string;
    ua: string;
    subscriptions: Array<{ type: string; topic: string }>;
    endpoint?: unknown;
  };
}> = [];

type DingTalkConfig = Config["channels"]["dingtalk"];
type DingTalkAccount = DingTalkConfig["accounts"][string];

function createDingTalkAccount(
  overrides: Partial<DingTalkAccount> = {}
): DingTalkAccount {
  return {
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
    groups: {},
    ...overrides
  };
}

function createDingTalkConfig(
  accounts: Record<string, DingTalkAccount> = {
    "ops-bot": createDingTalkAccount()
  }
): DingTalkConfig {
  return {
    enabled: true,
    clientId: "",
    clientSecret: "",
    robotCode: "",
    corpId: "",
    agentId: "",
    allowFrom: [],
    dmPolicy: "open",
    groupPolicy: "open",
    groupAllowFrom: [],
    requireMention: false,
    mentionPatterns: [],
    groups: {},
    defaultAccountId: "ops-bot",
    accounts
  };
}

function createFetchResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Service Unavailable",
    text: vi.fn(async () =>
      typeof body === "string" ? body : JSON.stringify(body)
    )
  };
}

vi.mock("dingtalk-stream", () => {
  class MockDWClient {
    connected = false;
    config = {
      autoReconnect: true,
      clientId: "",
      clientSecret: "",
      ua: "",
      subscriptions: [
        {
          type: "EVENT",
          topic: "*"
        }
      ] as Array<{ type: string; topic: string }>,
      endpoint: undefined as unknown
    };
    sslopts?: { agent?: { addRequest?: (...args: unknown[]) => void } };
    socket?: EventEmitter;
    dw_url = "";
    sdkGetEndpoint = vi.fn(async () => {
      if (mockSdkEndpointError) throw mockSdkEndpointError;
      this.config.endpoint = {
        endpoint: mockSdkEndpointUrl,
        ticket: "ticket-ok"
      };
      this.dw_url = `${mockSdkEndpointUrl}?ticket=ticket-ok`;
      return this;
    });
    getEndpoint = this.sdkGetEndpoint;
    _connect = vi.fn(async () => {
      this.sslopts?.agent?.addRequest?.(
        new EventEmitter(),
        {
          host: mockConnectHost,
          hostname: mockConnectHost,
          port: mockConnectPort
        }
      );
      const attachSocket = () => {
        this.socket = new EventEmitter();
        this.socket.on("open", () => {
          this.connected = true;
        });
      };
      if (mockSocketOpenMode === "delayed-open") {
        setTimeout(() => {
          attachSocket();
          setTimeout(() => {
            this.socket?.emit("open");
          }, 0);
        }, 10);
        return;
      }
      attachSocket();
      if (mockSocketOpenMode === "open") {
        setTimeout(() => {
          this.socket?.emit("open");
        }, 0);
      }
    });
    sdkConnect = vi.fn(async () => {
      try {
        await this.getEndpoint();
        await this._connect();
      } catch (err) {
        if (this.config.autoReconnect) return;
        throw err;
      }
    });
    connect = this.sdkConnect;
    disconnect = vi.fn(() => undefined);
    registerCallbackListener = vi.fn(() => undefined);
    registerAllEventListener = vi.fn(() => undefined);
    socketCallBackResponse = vi.fn(() => undefined);

    constructor(options: { clientId: string }) {
      this.config.clientId = options.clientId;
      this.config.clientSecret = "secret-ok";
      if (options.clientId === "client-bad") {
        this._connect = vi.fn(async () => {
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
  mockUndiciFetch.mockReset();
  MockEnvHttpProxyAgent.mockClear();
  mockUndiciFetch.mockResolvedValue(
    createFetchResponse(200, {
      endpoint: "wss://stream.dingtalk.test/connect",
      ticket: "ticket-ok"
    })
  );
  mockConnectHost = "api.dingtalk.com";
  mockConnectPort = 443;
  mockSocketOpenMode = "open";
  mockSdkEndpointUrl = "wss://stream.dingtalk.test/connect";
  mockSdkEndpointError = null;
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
  it("uses the SDK getEndpoint implementation during connect", async () => {
    clientInstances.length = 0;
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
      new MessageBus()
    );

    await channel.start();

    expect(mockUndiciFetch).not.toHaveBeenCalled();
    expect(clientInstances[0]?.sdkGetEndpoint).toHaveBeenCalledTimes(1);
    expect(clientInstances[0]?.sdkConnect).toHaveBeenCalledTimes(1);
    expect(clientInstances[0]?.config.autoReconnect).toBe(true);
  });

  it("lets the SDK own reconnect when SDK getEndpoint fails", async () => {
    clientInstances.length = 0;
    mockSdkEndpointError = new Error("SDK endpoint failed");
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
      new MessageBus()
    );

    await expect(channel.start()).resolves.toBeUndefined();
    expect(channel.isRunning).toBe(true);
    expect(mockUndiciFetch).not.toHaveBeenCalled();
    expect(clientInstances[0]?.sdkGetEndpoint).toHaveBeenCalledTimes(1);
    expect(clientInstances[0]?.sdkConnect).toHaveBeenCalledTimes(1);
    expect(clientInstances[0]?.config.autoReconnect).toBe(true);
  });

  it("uses undici endpoint fetch when proxy is configured", async () => {
    clientInstances.length = 0;
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1,172.31.0.0/16");
    mockUndiciFetch.mockResolvedValueOnce(
      createFetchResponse(200, {
        endpoint: "wss://172.31.1.95/connect",
        ticket: "ticket-ok"
      })
    );
    vi.spyOn(https.Agent.prototype as any, "addRequest").mockImplementation(
      () => undefined
    );
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
      new MessageBus()
    );

    await channel.start();

    expect(MockEnvHttpProxyAgent).toHaveBeenCalledTimes(1);
    expect(mockUndiciFetch).toHaveBeenCalledWith(
      "https://api.dingtalk.com/v1.0/gateway/connections/open",
      expect.objectContaining({
        dispatcher: expect.any(Object),
        method: "POST",
        body: expect.stringContaining("\"clientId\":\"client-ok\"")
      })
    );
    expect(clientInstances[0]?.sdkGetEndpoint).not.toHaveBeenCalled();
    expect(clientInstances[0]?.dw_url).toBe("wss://172.31.1.95/connect?ticket=ticket-ok");
  });

  it("lets the SDK own reconnect when proxy endpoint fetch fails", async () => {
    clientInstances.length = 0;
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    mockUndiciFetch.mockResolvedValueOnce(
      createFetchResponse(502, "ERR_READ_ERROR")
    );
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
      new MessageBus()
    );

    await expect(channel.start()).resolves.toBeUndefined();
    expect(channel.isRunning).toBe(true);
    expect(clientInstances[0]?.sdkGetEndpoint).not.toHaveBeenCalled();
    expect(clientInstances[0]?.sdkConnect).toHaveBeenCalledTimes(1);
    expect(clientInstances[0]?.config.autoReconnect).toBe(true);
  });

  it("does not wait for WebSocket open outside the SDK", async () => {
    clientInstances.length = 0;
    mockSocketOpenMode = "never";
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
      new MessageBus()
    );

    await expect(channel.start()).resolves.toBeUndefined();
    expect(channel.isRunning).toBe(true);
    expect(clientInstances[0]?.sdkConnect).toHaveBeenCalledTimes(1);
  });

  it("does not wait for a delayed WebSocket socket outside the SDK", async () => {
    vi.useFakeTimers();
    clientInstances.length = 0;
    mockSocketOpenMode = "delayed-open";
    try {
      const channel = new DingTalkChannel(
        createDingTalkConfig(),
        new MessageBus()
      );

      const startPromise = channel.start();

      await expect(startPromise).resolves.toBeUndefined();
      expect(channel.isRunning).toBe(true);
      expect(clientInstances[0]?.connectedAt).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bypasses proxy for WebSocket targets matched by CIDR NO_PROXY", async () => {
    clientInstances.length = 0;
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1,172.31.0.0/16");
    mockUndiciFetch.mockResolvedValueOnce(
      createFetchResponse(200, {
        endpoint: "wss://172.31.1.95/connect",
        ticket: "ticket-ok"
      })
    );
    const directAddRequest = vi
      .spyOn(https.Agent.prototype as any, "addRequest")
      .mockImplementation(() => undefined);
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
      new MessageBus()
    );

    await channel.start();

    expect(clientInstances[0]?.sslopts?.agent).not.toBeInstanceOf(HttpsProxyAgent);
    expect(directAddRequest).toHaveBeenCalledTimes(1);
  });

  it("uses a concrete HTTPS proxy agent for proxied WebSocket targets", async () => {
    clientInstances.length = 0;
    mockConnectHost = "api.dingtalk.com";
    mockConnectPort = 443;
    vi.stubEnv("HTTPS_PROXY", "http://172.31.1.95:1080");
    vi.stubEnv("NO_PROXY", "localhost,127.0.0.1,172.31.0.0/16");
    const proxyAddRequest = vi
      .spyOn(HttpsProxyAgent.prototype as any, "addRequest")
      .mockImplementation(() => undefined);
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
      new MessageBus()
    );

    await channel.start();

    expect(clientInstances[0]?.sslopts?.agent).toBeInstanceOf(HttpsProxyAgent);
    expect(proxyAddRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps SDK autoReconnect responsible when one account connect attempt fails internally", async () => {
    clientInstances.length = 0;
    const channel = new DingTalkChannel(
      createDingTalkConfig({
        "ops-bot": createDingTalkAccount(),
        "bad-bot": createDingTalkAccount({
          clientId: "client-bad",
          clientSecret: "secret-bad"
        })
      }),
      new MessageBus()
    );

    await expect(channel.start()).resolves.toBeUndefined();
    expect(clientInstances[0]?.disconnect).not.toHaveBeenCalled();
    expect(clientInstances[1]?.disconnect).not.toHaveBeenCalled();
    expect(clientInstances[1]?.config.autoReconnect).toBe(true);
    expect(channel.isRunning).toBe(true);
  });

  it("acks callback even when message handling fails", async () => {
    clientInstances.length = 0;
    const channel = new DingTalkChannel(
      createDingTalkConfig(),
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

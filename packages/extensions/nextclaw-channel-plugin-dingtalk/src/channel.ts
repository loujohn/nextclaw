import http from "node:http";
import https from "node:https";
import {
  BaseChannel,
  evaluateChannelAccessPolicy,
  formatNoProxyRulesForLog,
  parseNoProxy,
  resolveGroupMentionPolicy,
  shouldBypassProxy,
  type Config,
  type MessageBus,
  type NoProxyRule,
  type OutboundMessage,
} from "@nextclaw/core";
import {
  DWClient,
  EventAck,
  TOPIC_ROBOT,
  type DWClientDownStream,
} from "dingtalk-stream";
import { fetch } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";

import {
  normalizeDingTalkConfig,
  resolveDingTalkAccount,
  type DingTalkAccountConfig,
} from "./config";
import {
  normalizeInboundDingTalkMessage,
  resolveOutboundTarget,
} from "./message-normalizer";
import { normalizeString } from "./utils";

const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const FORCE_RESTART_AFTER_MS = 120_000;
const WS_OPEN_TIMEOUT_MS = 30_000;
const WS_SOCKET_POLL_INTERVAL_MS = 10;

type AgentRequestOptions = http.RequestOptions & {
  hostname?: string;
  host?: string;
  port?: string | number;
};

type AgentWithAddRequest = http.Agent & {
  addRequest(req: http.ClientRequest, options: AgentRequestOptions): void;
};

type WebSocketLike = {
  readyState?: number;
  once(event: string, listener: (...args: any[]) => void): void;
  off?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
};

class ProxyAwareAgent extends http.Agent {
  constructor(
    private readonly accountId: string,
    private readonly proxyAgent: AgentWithAddRequest,
    private readonly directAgent: AgentWithAddRequest,
    private readonly bypassRules: NoProxyRule[],
  ) {
    super();
  }

  addRequest(req: http.ClientRequest, options: AgentRequestOptions): void {
    const host = options.hostname ?? options.host ?? "";
    const bypass = host ? shouldBypassProxy(host, this.bypassRules) : false;
    const delegate = bypass ? this.directAgent : this.proxyAgent;
    console.log(
      `[dingtalk] ws proxy route account=${this.accountId} target=${formatHostPort(host, options.port)} route=${bypass ? "direct" : "proxy"}`,
    );
    delegate.addRequest(req, options);
  }
}

function formatHostPort(host: string, port: string | number | undefined): string {
  if (!host) return "(unknown)";
  return port ? `${host}:${port}` : host;
}

function formatWsTarget(rawUrl: unknown): string {
  if (typeof rawUrl !== "string" || !rawUrl) return "(unknown)";
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

function removeSocketListener(
  socket: WebSocketLike,
  event: string,
  listener: (...args: any[]) => void,
): void {
  if (typeof socket.off === "function") {
    socket.off(event, listener);
    return;
  }
  socket.removeListener?.(event, listener);
}

function waitForWebSocketOpen(client: any, accountId: string): Promise<void> {
  if (client.connected === true) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: WebSocketLike | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      clearTimeout(timeoutTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (socket) {
        removeSocketListener(socket, "open", onOpen);
        removeSocketListener(socket, "error", onError);
        removeSocketListener(socket, "close", onClose);
      }
    };
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    };
    const onOpen = () => {
      console.log(
        `[dingtalk] ws open account=${accountId} target=${formatWsTarget(client.dw_url)}`,
      );
      finish();
    };
    const onError = (err: Error) => {
      finish(
        new Error(
          `DingTalk WebSocket error before open account=${accountId} target=${formatWsTarget(client.dw_url)}: ${err.message}`,
        ),
      );
    };
    const onClose = (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString?.() ?? "";
      finish(
        new Error(
          `DingTalk WebSocket closed before open account=${accountId} target=${formatWsTarget(client.dw_url)} code=${code} reason=${reasonStr || "(empty)"}`,
        ),
      );
    };
    const attachSocket = (nextSocket: WebSocketLike) => {
      socket = nextSocket;
      if (socket.readyState === 1 || client.connected === true) {
        finish();
        return;
      }
      socket.once("open", onOpen);
      socket.once("error", onError);
      socket.once("close", onClose);
    };
    const checkSocket = () => {
      if (client.connected === true) {
        finish();
        return;
      }
      const nextSocket = client.socket as WebSocketLike | undefined;
      if (!nextSocket) return;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      attachSocket(nextSocket);
    };
    const timeoutTimer = setTimeout(() => {
      const target = formatWsTarget(client.dw_url);
      const errorMessage = socket
        ? `DingTalk WebSocket did not open within ${WS_OPEN_TIMEOUT_MS / 1000}s account=${accountId} target=${target} readyState=${socket.readyState ?? "(unknown)"}`
        : `DingTalk WebSocket socket missing after ${WS_OPEN_TIMEOUT_MS / 1000}s account=${accountId} target=${target}`;
      finish(new Error(errorMessage));
    }, WS_OPEN_TIMEOUT_MS);

    checkSocket();
    if (!settled && !socket) {
      pollTimer = setInterval(checkSocket, WS_SOCKET_POLL_INTERVAL_MS);
    }
  });
}

/**
 * Patch DWClient._connect() to inject a proxy agent into sslopts.
 *
 * The `ws` library does NOT read HTTP_PROXY/HTTPS_PROXY env vars.
 * DWClient creates WebSocket via `new WebSocket(url, this.sslopts)` —
 * without an agent, the connection goes direct and gets blocked in
 * proxy-required production environments.
 *
 * This patch intercepts _connect and adds HttpsProxyAgent to sslopts
 * before the WebSocket is instantiated.
 */
function patchWebSocketProxy(client: DWClient, accountId: string): void {
  const proxyUrl =
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy;

  if (!proxyUrl) return;

  const origInternalConnect = (client as any)._connect;
  if (typeof origInternalConnect !== "function") return;

  const bypassRules = parseNoProxy(process.env.NO_PROXY ?? process.env.no_proxy);
  const proxyAgent = new HttpsProxyAgent(
    proxyUrl,
  ) as unknown as AgentWithAddRequest;
  const directAgent = new https.Agent() as unknown as AgentWithAddRequest;
  const agent = new ProxyAwareAgent(
    accountId,
    proxyAgent,
    directAgent,
    bypassRules,
  );
  console.log(
    `[dingtalk] ws proxy injected -> ${proxyUrl} (noProxy=${formatNoProxyRulesForLog(bypassRules)})`,
  );

  (client as any)._connect = function (this: any) {
    // Inject a NO_PROXY-aware agent before WebSocket is created.
    this.sslopts = { ...this.sslopts, agent };
    console.log(
      `[dingtalk] ws connecting account=${accountId} target=${formatWsTarget(this.dw_url)}`,
    );
    return origInternalConnect.call(this);
  };
}

/**
 * Replace the library's verbose socket error handler (dumps full stack trace
 * for every 503) with a concise single-line version.  Consecutive identical
 * errors are throttled: first 3 individually, then every 10th.  When the
 * connection recovers, a single summary line is logged.
 */
function patchSocketLogging(client: DWClient, accountId: string): void {
  const origInternalConnect = (client as any)._connect;
  if (typeof origInternalConnect !== "function") return;

  let wsErrorCount = 0;

  (client as any)._connect = function (this: any) {
    return origInternalConnect.call(this).then(() => {
      const socket = this.socket;
      if (!socket) return;

      socket.removeAllListeners("error");
      socket.on("error", (err: Error) => {
        wsErrorCount++;
        if (wsErrorCount <= 3 || wsErrorCount % 10 === 0) {
          console.warn(
            `[dingtalk] ws error account=${accountId}: ${err.message}` +
              (wsErrorCount > 1 ? ` (${wsErrorCount} consecutive)` : ""),
          );
        }
      });

      // 追加一条 close 监听，不动 SDK 自己的 reconnect close handler。
      // 只为了能在日志里看到 close code / reason（钉钉 stream 服务端主动关连接时
      // 只会走 close 事件而非 error，之前的日志里根本看不出为什么掉线）。
      socket.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason?.toString?.() ?? "";
        const connectedFor = this.connectedAt
          ? `${Date.now() - this.connectedAt}ms`
          : "(unknown)";
        console.warn(
          `[dingtalk] ws closed account=${accountId} code=${code} reason=${
            reasonStr || "(empty)"
          } connectedFor=${connectedFor}`,
        );
      });

      const origOpenListeners = socket.listeners("open").slice();
      socket.removeAllListeners("open");
      socket.on("open", (...args: unknown[]) => {
        this.connectedAt = Date.now();
        if (wsErrorCount > 0) {
          console.log(
            `[dingtalk] ws recovered account=${accountId} after ${wsErrorCount} error(s)`,
          );
          wsErrorCount = 0;
        }
        for (const fn of origOpenListeners) {
          (fn as Function).apply(socket, args);
        }
      });
    });
  };
}

/**
 * Wrap DWClient.connect() so that getEndpoint() failures (which the library
 * leaves as unhandled promise rejections during auto-reconnect) are caught
 * and retried with exponential backoff.
 *
 * The first successful connect sets a flag; errors before that propagate
 * to the caller so start() can still report failure.
 *
 * Returns a dispose function that prevents any pending retry from firing
 * after the client is intentionally stopped.
 */
function patchClientConnect(
  client: DWClient,
  accountId: string,
): { dispose(): void } {
  const originalConnect = client.connect.bind(client);
  let backoffMs = INITIAL_RECONNECT_DELAY_MS;
  let connecting = false;
  let initialConnectDone = false;
  let disposed = false;

  client.connect = async function () {
    if (connecting || disposed) return;
    connecting = true;
    try {
      await originalConnect();
      await waitForWebSocketOpen(client as any, accountId);
      backoffMs = INITIAL_RECONNECT_DELAY_MS;
      initialConnectDone = true;
    } catch (err) {
      if (!initialConnectDone) {
        connecting = false;
        throw err;
      }
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, MAX_RECONNECT_DELAY_MS);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[dingtalk] connect error account=${accountId}, retry in ${delay / 1000}s: ${msg}`,
      );
      setTimeout(() => {
        connecting = false;
        client.connect().catch(() => {});
      }, delay);
      return;
    }
    connecting = false;
  };

  return {
    dispose() {
      disposed = true;
    },
  };
}

type TokenState = { token: string; expiresAt: number };

export class DingTalkChannel extends BaseChannel<
  Config["channels"]["dingtalk"]
> {
  name = "dingtalk";
  private clients = new Map<string, DWClient>();
  private tokens = new Map<string, TokenState>();
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private disconnectedSince = new Map<string, number>();
  private clientDisposers = new Map<string, () => void>();

  async start(): Promise<void> {
    this.running = true;
    const normalized = normalizeDingTalkConfig(this.config);
    const entries = Object.entries(normalized.accounts).filter(
      ([, account]) => account.clientId && account.clientSecret,
    );
    console.log(
      `[dingtalk] starting, accounts=${entries.map(([id]) => id).join(",") || "(none)"}`,
    );
    if (entries.length === 0) {
      this.running = false;
      throw new Error("DingTalk accounts not configured");
    }

    const attemptedClients: DWClient[] = [];
    try {
      for (const [accountId, account] of entries) {
        const client = this.createClient(accountId, account);
        attemptedClients.push(client);
        await client.connect();
        this.clients.set(accountId, client);
        console.log(`[dingtalk] connected account=${accountId}`);
      }
    } catch (error) {
      this.running = false;
      for (const dispose of this.clientDisposers.values()) dispose();
      this.clientDisposers.clear();
      for (const client of attemptedClients) {
        client.disconnect();
      }
      this.clients.clear();
      this.tokens.clear();
      console.error(`[dingtalk] start failed`, error);
      throw error;
    }

    this.startHealthMonitor();
  }

  async stop(): Promise<void> {
    console.log(`[dingtalk] stopping, accounts=${this.clients.size}`);
    this.running = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    this.disconnectedSince.clear();
    for (const dispose of this.clientDisposers.values()) dispose();
    this.clientDisposers.clear();
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
    this.tokens.clear();
    console.log(`[dingtalk] stopped`);
  }

  private createClient(
    accountId: string,
    account: DingTalkAccountConfig,
  ): DWClient {
    console.log(
      `[dingtalk] connecting account=${accountId} clientId=${account.clientId}`,
    );
    const client = new DWClient({
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      debug: false,
    });
    patchWebSocketProxy(client, accountId);
    patchSocketLogging(client, accountId);
    const { dispose } = patchClientConnect(client, accountId);
    this.clientDisposers.set(accountId, dispose);
    client.registerCallbackListener(
      TOPIC_ROBOT,
      async (event: DWClientDownStream) => {
        await this.handleRobotMessage(accountId, account, event);
      },
    );
    client.registerAllEventListener(() => ({ status: EventAck.SUCCESS }));
    return client;
  }

  private startHealthMonitor(): void {
    this.healthCheckTimer = setInterval(() => {
      if (!this.running) return;
      for (const [accountId, client] of this.clients) {
        if (client.connected) {
          this.disconnectedSince.delete(accountId);
          continue;
        }
        const since = this.disconnectedSince.get(accountId);
        if (!since) {
          console.log(
            `[dingtalk] health: account=${accountId} disconnected, monitoring...`,
          );
          this.disconnectedSince.set(accountId, Date.now());
          continue;
        }
        const elapsed = Date.now() - since;
        if (elapsed > FORCE_RESTART_AFTER_MS) {
          console.warn(
            `[dingtalk] health: account=${accountId} disconnected >${Math.round(elapsed / 1000)}s, force restart`,
          );
          this.forceRestartClient(accountId).catch((err) => {
            console.error(
              `[dingtalk] health: restart failed account=${accountId}`,
              err,
            );
          });
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private async forceRestartClient(accountId: string): Promise<void> {
    this.disconnectedSince.delete(accountId);
    const oldDispose = this.clientDisposers.get(accountId);
    if (oldDispose) oldDispose();
    const oldClient = this.clients.get(accountId);
    if (oldClient) {
      try {
        oldClient.disconnect();
      } catch {
        /* ignore */
      }
    }
    const normalized = normalizeDingTalkConfig(this.config);
    const account = normalized.accounts[accountId];
    if (!account?.clientId || !account?.clientSecret) return;

    const newClient = this.createClient(accountId, account);
    await newClient.connect();
    this.clients.set(accountId, newClient);
    console.log(
      `[dingtalk] health: account=${accountId} restarted successfully`,
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    const normalized = normalizeDingTalkConfig(this.config);
    const accountId =
      normalizeString(msg.metadata.account_id) ||
      normalizeString(msg.metadata.accountId) ||
      normalized.defaultAccountId;
    const account = resolveDingTalkAccount(normalized, accountId);
    if (!account) {
      throw new Error(`DingTalk account not found: ${accountId}`);
    }

    const target = resolveOutboundTarget(msg);
    const mentionIds = Array.isArray(msg.metadata.mention_user_ids)
      ? (msg.metadata.mention_user_ids as string[]).filter(Boolean)
      : [];
    console.log(
      `[dingtalk] send account=${accountId} target=${target.kind}:${target.targetId} contentLen=${msg.content.length}${mentionIds.length > 0 ? ` mention=[${mentionIds.join(",")}]` : ""}`,
    );
    const t0 = Date.now();
    const token = await this.getAccessToken(accountId, account);
    const robotCode = account.robotCode || account.clientId;
    const url =
      target.kind === "group"
        ? "https://api.dingtalk.com/v1.0/robot/groupMessages/send"
        : "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend";

    const mentionNames =
      msg.metadata.mention_user_names &&
      typeof msg.metadata.mention_user_names === "object"
        ? (msg.metadata.mention_user_names as Record<string, string>)
        : {};
    let groupText = msg.content;
    if (target.kind === "group" && mentionIds.length > 0) {
      const missing = mentionIds.filter((id) => {
        const name = mentionNames[id] || id;
        return !msg.content.includes(`@${name}`);
      });
      if (missing.length > 0) {
        groupText = `${msg.content}\n\n${missing.map((id) => `@${mentionNames[id] || id}`).join(" ")}`;
      }
    }

    const payload =
      target.kind === "group"
        ? {
            robotCode,
            openConversationId: target.targetId,
            msgKey: "sampleMarkdown",
            msgParam: JSON.stringify({
              title: "NextClaw Reply",
              text: groupText,
            }),
          }
        : {
            robotCode,
            userIds: [target.targetId],
            msgKey: "sampleMarkdown",
            msgParam: JSON.stringify({
              title: "NextClaw Reply",
              text: msg.content,
            }),
          };

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify(payload),

        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error(
        `[dingtalk] send FAILED (network) account=${accountId} target=${target.kind}:${target.targetId} elapsed=${Date.now() - t0}ms`,
        err,
      );
      throw err;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[dingtalk] send FAILED (http) account=${accountId} status=${response.status} elapsed=${Date.now() - t0}ms body=${body}`,
      );
      throw new Error(`DingTalk send failed: ${response.status} ${body}`);
    }
    console.log(
      `[dingtalk] send OK account=${accountId} target=${target.kind}:${target.targetId} elapsed=${Date.now() - t0}ms`,
    );
  }

  private async handleRobotMessage(
    accountId: string,
    account: DingTalkAccountConfig,
    res: DWClientDownStream,
  ): Promise<void> {
    const client = this.clients.get(accountId);
    if (!res?.data || !client) {
      return;
    }

    const messageId = normalizeString(res.headers?.messageId);
    console.log(
      `[dingtalk] inbound account=${accountId} messageId=${messageId || "(none)"}`,
    );
    if (!messageId) {
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(res.data) as Record<string, unknown>;
    } catch (err) {
      console.error(
        `[dingtalk] inbound parse error account=${accountId} messageId=${messageId}`,
        err,
      );
      client.socketCallBackResponse(messageId, { ok: true });
      return;
    }
    try {
      const normalized = normalizeInboundDingTalkMessage({
        accountId,
        data: {
          text: parsed.text as { content?: string } | undefined,
          conversationType: normalizeString(parsed.conversationType),
          conversationId: normalizeString(parsed.conversationId),
          conversationTitle: normalizeString(parsed.conversationTitle),
          senderId: normalizeString(parsed.senderId),
          senderStaffId: normalizeString(parsed.senderStaffId),
          senderNick: normalizeString(parsed.senderNick),
          chatbotUserId: normalizeString(parsed.chatbotUserId),
          isInAtList: parsed.isInAtList === true,
          mentioned: parsed.mentioned === true,
          atUserIds: Array.isArray(parsed.atUserIds)
            ? (parsed.atUserIds as string[])
            : undefined,
          atUsers: Array.isArray(parsed.atUsers)
            ? (parsed.atUsers as Array<Record<string, unknown>>)
            : undefined,
        },
        ...resolveGroupMentionPolicy(account, {
          chatId: normalizeString(parsed.conversationId),
          isGroup: normalizeString(parsed.conversationType) !== "1",
        }),
      });

      if (!normalized) {
        console.log(
          `[dingtalk] inbound dropped (normalize returned null) account=${accountId} messageId=${messageId}`,
        );
        return;
      }

      const isGroup = normalized.metadata.is_group === true;
      if (
        !evaluateChannelAccessPolicy(account, {
          senderId: normalized.senderId,
          chatId: normalized.chatId,
          isGroup,
        })
      ) {
        console.log(
          `[dingtalk] inbound blocked by access policy account=${accountId} sender=${normalized.senderId} chat=${normalized.chatId}`,
        );
        return;
      }

      if (
        normalized.metadata.require_mention === true &&
        normalized.metadata.was_mentioned !== true
      ) {
        console.log(
          `[dingtalk] inbound dropped (not mentioned) account=${accountId} messageId=${messageId}`,
        );
        return;
      }

      console.log(
        `[dingtalk] inbound dispatching account=${accountId} sender=${normalized.senderId} chat=${normalized.chatId} isGroup=${isGroup} title=${normalized.metadata.conversation_title || "(none)"} contentLen=${normalized.content.length}`,
      );
      await this.handleMessage({
        senderId: normalized.senderId,
        chatId: normalized.chatId,
        content: normalized.content,
        metadata: normalized.metadata,
      });
      console.log(
        `[dingtalk] inbound handled account=${accountId} messageId=${messageId}`,
      );
    } catch (error) {
      console.error(
        `[dingtalk] inbound error account=${accountId} messageId=${messageId}`,
        error,
      );
    } finally {
      client.socketCallBackResponse(messageId, { ok: true });
    }
  }

  private async getAccessToken(
    accountId: string,
    account: DingTalkAccountConfig,
  ): Promise<string> {
    const cached = this.tokens.get(accountId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    console.log(
      `[dingtalk] getAccessToken account=${accountId} (cache miss, fetching)`,
    );
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(
        "https://api.dingtalk.com/v1.0/oauth2/accessToken",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            appKey: account.clientId,
            appSecret: account.clientSecret,
          }),

          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (err) {
      console.error(
        `[dingtalk] getAccessToken FAILED (network) account=${accountId}`,
        err,
      );
      throw err;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `[dingtalk] getAccessToken FAILED (http) account=${accountId} status=${response.status} body=${body}`,
      );
      throw new Error(`DingTalk token failed: ${response.status} ${body}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    const token = normalizeString(data.accessToken);
    if (!token) {
      throw new Error("DingTalk token missing accessToken");
    }
    const expiresIn = Number(data.expireIn ?? 7200);
    this.tokens.set(accountId, {
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    });
    return token;
  }
}

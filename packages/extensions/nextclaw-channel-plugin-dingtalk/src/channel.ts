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
  type OutboundMessage,
} from "@nextclaw/core";
import {
  DWClient,
  EventAck,
  TOPIC_ROBOT,
  type DWClientDownStream,
} from "dingtalk-stream";
import { EnvHttpProxyAgent, fetch } from "undici";
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

const DINGTALK_GATEWAY_OPEN_URL =
  "https://api.dingtalk.com/v1.0/gateway/connections/open";
const ENDPOINT_REQUEST_TIMEOUT_MS = 15_000;
const ENDPOINT_ERROR_BODY_LIMIT = 500;

type DingTalkClientInternals = DWClient & {
  config?: {
    clientId?: string;
    clientSecret?: string;
    ua?: string;
    subscriptions?: Array<{ type: string; topic: string }>;
    endpoint?: unknown;
  };
  getEndpoint?: () => Promise<unknown>;
  _connect?: () => Promise<unknown>;
  dw_url?: string;
};

type DingTalkEndpointFetchOptions = NonNullable<Parameters<typeof fetch>[1]> & {
  dispatcher?: unknown;
};

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

function resolveWsHostPort(rawUrl: unknown): {
  host: string;
  port?: string;
} {
  if (typeof rawUrl !== "string" || !rawUrl) return { host: "" };
  try {
    const url = new URL(rawUrl);
    return {
      host: url.hostname,
      port: url.port || (url.protocol === "wss:" ? "443" : "80"),
    };
  } catch {
    return { host: "" };
  }
}

function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy
  );
}

function truncateEndpointBody(body: string): string {
  if (body.length <= ENDPOINT_ERROR_BODY_LIMIT) return body;
  return `${body.slice(0, ENDPOINT_ERROR_BODY_LIMIT)}...`;
}

function createEndpointFetchOptions(
  client: DingTalkClientInternals,
): DingTalkEndpointFetchOptions {
  const config = client.config;
  return {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientId: config?.clientId,
      clientSecret: config?.clientSecret,
      ua: config?.ua ?? "",
      subscriptions: config?.subscriptions ?? [],
    }),
    dispatcher: new EnvHttpProxyAgent(),
    signal: AbortSignal.timeout(ENDPOINT_REQUEST_TIMEOUT_MS),
  };
}

async function resolveDingTalkEndpoint(
  client: DingTalkClientInternals,
  accountId: string,
): Promise<void> {
  const config = client.config;
  if (!config?.clientId || !config.clientSecret) {
    throw new Error(`DingTalk endpoint config missing account=${accountId}`);
  }

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(
      DINGTALK_GATEWAY_OPEN_URL,
      createEndpointFetchOptions(client),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `DingTalk endpoint request failed account=${accountId} network=${message}`,
      { cause: err },
    );
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(
      `DingTalk endpoint request failed account=${accountId} status=${response.status} body=${truncateEndpointBody(body)}`,
    );
  }

  let data: { endpoint?: unknown; ticket?: unknown };
  try {
    data = JSON.parse(body) as { endpoint?: unknown; ticket?: unknown };
  } catch (err) {
    throw new Error(
      `DingTalk endpoint response is not JSON account=${accountId} body=${truncateEndpointBody(body)}`,
      { cause: err },
    );
  }

  const endpoint = typeof data.endpoint === "string" ? data.endpoint : "";
  const ticket = typeof data.ticket === "string" ? data.ticket : "";
  if (!endpoint || !ticket) {
    throw new Error(
      `DingTalk endpoint response missing endpoint or ticket account=${accountId} body=${truncateEndpointBody(body)}`,
    );
  }

  config.endpoint = data;
  client.dw_url = `${endpoint}?ticket=${ticket}`;
}

function patchDingTalkEndpointWhenProxyConfigured(
  client: DingTalkClientInternals,
  accountId: string,
): void {
  if (!getProxyUrl() || typeof client.getEndpoint !== "function") return;

  client.getEndpoint = async function (this: DingTalkClientInternals) {
    await resolveDingTalkEndpoint(this, accountId);
    console.log(
      `[dingtalk] endpoint resolved via proxy fetch account=${accountId} target=${formatWsTarget(this.dw_url)}`,
    );
    return this;
  };
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
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  const directAgent = new https.Agent();
  console.log(
    `[dingtalk] ws proxy injected -> ${proxyUrl} (noProxy=${formatNoProxyRulesForLog(bypassRules)})`,
  );

  (client as any)._connect = function (this: any) {
    // Inject a NO_PROXY-aware agent before WebSocket is created.
    const target = resolveWsHostPort(this.dw_url);
    const bypass = target.host
      ? shouldBypassProxy(target.host, bypassRules)
      : false;
    this.sslopts = {
      ...this.sslopts,
      agent: bypass ? directAgent : proxyAgent,
    };
    console.log(
      `[dingtalk] ws connecting account=${accountId} target=${formatWsTarget(this.dw_url)}`,
    );
    console.log(
      `[dingtalk] ws proxy route account=${accountId} target=${formatHostPort(target.host, target.port)} route=${bypass ? "direct" : "proxy"}`,
    );
    return origInternalConnect.call(this);
  };
}

type TokenState = { token: string; expiresAt: number };

export class DingTalkChannel extends BaseChannel<
  Config["channels"]["dingtalk"]
> {
  name = "dingtalk";
  private clients = new Map<string, DWClient>();
  private tokens = new Map<string, TokenState>();

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
      for (const client of attemptedClients) {
        client.disconnect();
      }
      this.clients.clear();
      this.tokens.clear();
      console.error(`[dingtalk] start failed`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log(`[dingtalk] stopping, accounts=${this.clients.size}`);
    this.running = false;
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
    patchDingTalkEndpointWhenProxyConfigured(
      client as DingTalkClientInternals,
      accountId,
    );
    patchWebSocketProxy(client, accountId);
    client.registerCallbackListener(
      TOPIC_ROBOT,
      async (event: DWClientDownStream) => {
        await this.handleRobotMessage(accountId, account, event);
      },
    );
    client.registerAllEventListener(() => ({ status: EventAck.SUCCESS }));
    return client;
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

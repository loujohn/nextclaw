import {
  BaseChannel,
  evaluateChannelAccessPolicy,
  resolveGroupMentionPolicy,
  type Config,
  type MessageBus,
  type OutboundMessage
} from "@nextclaw/core";
import { DWClient, EventAck, TOPIC_ROBOT, type DWClientDownStream } from "dingtalk-stream";
import { HttpsProxyAgent } from "https-proxy-agent";
import { fetch, ProxyAgent, Agent } from "undici";

import { normalizeDingTalkConfig, resolveDingTalkAccount, type DingTalkAccountConfig } from "./config";
import { normalizeInboundDingTalkMessage, resolveOutboundTarget } from "./message-normalizer";
import { normalizeString } from "./utils";

function getProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy;
}

function buildDispatcher() {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    console.log(`[dingtalk] using http proxy: ${proxyUrl}`);
    return new ProxyAgent(proxyUrl);
  }
  return new Agent();
}

/**
 * 为 ws 注入代理 agent。
 * 不直接调用 HttpsProxyAgent.connect()，避免传入非 ClientRequest 导致 req.emit 异常。
 */
function injectWsProxy(client: DWClient): void {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return;

  const agent = new HttpsProxyAgent(proxyUrl);
  const base = (client as any).sslopts ?? {};
  (client as any).sslopts = {
    ...base,
    agent,
  };
  console.log(`[dingtalk] ws proxy injected → ${proxyUrl}`);
}

type TokenState = { token: string; expiresAt: number };

export class DingTalkChannel extends BaseChannel<Config["channels"]["dingtalk"]> {
  name = "dingtalk";
  private clients = new Map<string, DWClient>();
  private tokens = new Map<string, TokenState>();

  async start(): Promise<void> {
    this.running = true;
    const normalized = normalizeDingTalkConfig(this.config);
    const entries = Object.entries(normalized.accounts).filter(([, account]) => account.clientId && account.clientSecret);
    console.log(`[dingtalk] starting, accounts=${entries.map(([id]) => id).join(",") || "(none)"}`);
    if (entries.length === 0) {
      this.running = false;
      throw new Error("DingTalk accounts not configured");
    }

    const startedClients: DWClient[] = [];
    try {
      for (const [accountId, account] of entries) {
        console.log(`[dingtalk] connecting account=${accountId} clientId=${account.clientId}`);
        const client = new DWClient({
          clientId: account.clientId,
          clientSecret: account.clientSecret,
          debug: false
        });
        injectWsProxy(client);
        client.registerCallbackListener(TOPIC_ROBOT, async (event: DWClientDownStream) => {
          await this.handleRobotMessage(accountId, account, event);
        });
        client.registerAllEventListener(() => ({ status: EventAck.SUCCESS }));
        await client.connect();
        this.clients.set(accountId, client);
        startedClients.push(client);
        console.log(`[dingtalk] connected account=${accountId}`);
      }
    } catch (error) {
      this.running = false;
      for (const client of startedClients) {
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

  async send(msg: OutboundMessage): Promise<void> {
    const normalized = normalizeDingTalkConfig(this.config);
    const accountId =
      normalizeString(msg.metadata.account_id) || normalizeString(msg.metadata.accountId) || normalized.defaultAccountId;
    const account = resolveDingTalkAccount(normalized, accountId);
    if (!account) {
      throw new Error(`DingTalk account not found: ${accountId}`);
    }

    const target = resolveOutboundTarget(msg);
    console.log(`[dingtalk] send account=${accountId} target=${target.kind}:${target.targetId} contentLen=${msg.content.length}`);
    const t0 = Date.now();
    const token = await this.getAccessToken(accountId, account);
    const robotCode = account.robotCode || account.clientId;
    const url =
      target.kind === "group"
        ? "https://api.dingtalk.com/v1.0/robot/groupMessages/send"
        : "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend";

    const payload =
      target.kind === "group"
        ? {
            robotCode,
            openConversationId: target.targetId,
            msgKey: "sampleMarkdown",
            msgParam: JSON.stringify({
              title: "NextClaw Reply",
              text: msg.content
            })
          }
        : {
            robotCode,
            userIds: [target.targetId],
            msgKey: "sampleMarkdown",
            msgParam: JSON.stringify({
              title: "NextClaw Reply",
              text: msg.content
            })
          };

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-acs-dingtalk-access-token": token
        },
        body: JSON.stringify(payload),
        dispatcher: buildDispatcher(),
        signal: AbortSignal.timeout(15_000)
      });
    } catch (err) {
      console.error(`[dingtalk] send FAILED (network) account=${accountId} target=${target.kind}:${target.targetId} elapsed=${Date.now() - t0}ms`, err);
      throw err;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[dingtalk] send FAILED (http) account=${accountId} status=${response.status} elapsed=${Date.now() - t0}ms body=${body}`);
      throw new Error(`DingTalk send failed: ${response.status} ${body}`);
    }
    console.log(`[dingtalk] send OK account=${accountId} target=${target.kind}:${target.targetId} elapsed=${Date.now() - t0}ms`);
  }

  private async handleRobotMessage(
    accountId: string,
    account: DingTalkAccountConfig,
    res: DWClientDownStream
  ): Promise<void> {
    const client = this.clients.get(accountId);
    if (!res?.data || !client) {
      return;
    }

    const messageId = normalizeString(res.headers?.messageId);
    console.log(`[dingtalk] inbound account=${accountId} messageId=${messageId || "(none)"}`);
    if (!messageId) {
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(res.data) as Record<string, unknown>;
    } catch (err) {
      console.error(`[dingtalk] inbound parse error account=${accountId} messageId=${messageId}`, err);
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
          atUserIds: Array.isArray(parsed.atUserIds) ? (parsed.atUserIds as string[]) : undefined,
          atUsers: Array.isArray(parsed.atUsers) ? (parsed.atUsers as Array<Record<string, unknown>>) : undefined
        },
        ...resolveGroupMentionPolicy(account, {
          chatId: normalizeString(parsed.conversationId),
          isGroup: normalizeString(parsed.conversationType) !== "1"
        })
      });

      if (!normalized) {
        console.log(`[dingtalk] inbound dropped (normalize returned null) account=${accountId} messageId=${messageId}`);
        return;
      }

      const isGroup = normalized.metadata.is_group === true;
      if (
        !evaluateChannelAccessPolicy(account, {
          senderId: normalized.senderId,
          chatId: normalized.chatId,
          isGroup
        })
      ) {
        console.log(`[dingtalk] inbound blocked by access policy account=${accountId} sender=${normalized.senderId} chat=${normalized.chatId}`);
        return;
      }

      if (normalized.metadata.require_mention === true && normalized.metadata.was_mentioned !== true) {
        console.log(`[dingtalk] inbound dropped (not mentioned) account=${accountId} messageId=${messageId}`);
        return;
      }

      console.log(`[dingtalk] inbound dispatching account=${accountId} sender=${normalized.senderId} chat=${normalized.chatId} isGroup=${isGroup} contentLen=${normalized.content.length}`);
      await this.handleMessage({
        senderId: normalized.senderId,
        chatId: normalized.chatId,
        content: normalized.content,
        metadata: normalized.metadata
      });
      console.log(`[dingtalk] inbound handled account=${accountId} messageId=${messageId}`);
    } catch (error) {
      console.error(`[dingtalk] inbound error account=${accountId} messageId=${messageId}`, error);
    } finally {
      client.socketCallBackResponse(messageId, { ok: true });
    }
  }

  private async getAccessToken(accountId: string, account: DingTalkAccountConfig): Promise<string> {
    const cached = this.tokens.get(accountId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    console.log(`[dingtalk] getAccessToken account=${accountId} (cache miss, fetching)`);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appKey: account.clientId,
          appSecret: account.clientSecret
        }),
        dispatcher: buildDispatcher(),
        signal: AbortSignal.timeout(15_000)
      });
    } catch (err) {
      console.error(`[dingtalk] getAccessToken FAILED (network) account=${accountId}`, err);
      throw err;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[dingtalk] getAccessToken FAILED (http) account=${accountId} status=${response.status} body=${body}`);
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
      expiresAt: Date.now() + (expiresIn - 60) * 1000
    });
    return token;
  }
}

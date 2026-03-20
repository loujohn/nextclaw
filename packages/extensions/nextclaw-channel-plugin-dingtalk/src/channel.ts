import {
  BaseChannel,
  evaluateChannelAccessPolicy,
  resolveGroupMentionPolicy,
  type Config,
  type MessageBus,
  type OutboundMessage
} from "@nextclaw/core";
import { DWClient, EventAck, TOPIC_ROBOT, type DWClientDownStream } from "dingtalk-stream";
import { fetch } from "undici";
import { normalizeDingTalkConfig, resolveDingTalkAccount, type DingTalkAccountConfig } from "./config";
import { normalizeInboundDingTalkMessage, resolveOutboundTarget } from "./message-normalizer";
import { normalizeString } from "./utils";

type TokenState = { token: string; expiresAt: number };

export class DingTalkChannel extends BaseChannel<Config["channels"]["dingtalk"]> {
  name = "dingtalk";
  private clients = new Map<string, DWClient>();
  private tokens = new Map<string, TokenState>();

  async start(): Promise<void> {
    this.running = true;
    const normalized = normalizeDingTalkConfig(this.config);
    const entries = Object.entries(normalized.accounts).filter(([, account]) => account.clientId && account.clientSecret);
    if (entries.length === 0) {
      this.running = false;
      throw new Error("DingTalk accounts not configured");
    }

    const startedClients: DWClient[] = [];
    try {
      for (const [accountId, account] of entries) {
        const client = new DWClient({
          clientId: account.clientId,
          clientSecret: account.clientSecret,
          debug: false
        });
        client.registerCallbackListener(TOPIC_ROBOT, async (event: DWClientDownStream) => {
          await this.handleRobotMessage(accountId, account, event);
        });
        client.registerAllEventListener(() => ({ status: EventAck.SUCCESS }));
        await client.connect();
        this.clients.set(accountId, client);
        startedClients.push(client);
      }
    } catch (error) {
      this.running = false;
      for (const client of startedClients) {
        client.disconnect();
      }
      this.clients.clear();
      this.tokens.clear();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
    this.tokens.clear();
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

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-acs-dingtalk-access-token": token
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`DingTalk send failed: ${response.status}`);
    }
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
    if (!messageId) {
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(res.data) as Record<string, unknown>;
    } catch {
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
        return;
      }

      if (normalized.metadata.require_mention === true && normalized.metadata.was_mentioned !== true) {
        return;
      }

      await this.handleMessage({
        senderId: normalized.senderId,
        chatId: normalized.chatId,
        content: normalized.content,
        metadata: normalized.metadata
      });
    } catch (error) {
      console.error("[dingtalk] failed to handle inbound message", error);
    } finally {
      client.socketCallBackResponse(messageId, { ok: true });
    }
  }

  private async getAccessToken(accountId: string, account: DingTalkAccountConfig): Promise<string> {
    const cached = this.tokens.get(accountId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appKey: account.clientId,
        appSecret: account.clientSecret
      })
    });
    if (!response.ok) {
      throw new Error(`DingTalk token failed: ${response.status}`);
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

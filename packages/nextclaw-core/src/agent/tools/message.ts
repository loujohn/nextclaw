import type { OutboundMessage } from "../../bus/events.js";
import { Tool } from "./base.js";

export type NameResolveResult =
  | { kind: "found"; userId: string; displayName: string }
  | { kind: "ambiguous"; candidates: Array<{ userId: string; displayName: string; hint: string }> }
  | { kind: "not_found" };

export type NameResolver = (name: string) => Promise<NameResolveResult>;

export type GroupNameResolveResult =
  | { kind: "found"; conversationId: string; title: string }
  | { kind: "not_found" };

export type GroupNameResolver = (name: string) => Promise<GroupNameResolveResult>;

export type AccountIdResolveResult =
  | { kind: "resolved"; accountId: string }
  | { kind: "ambiguous"; accountIds: string[] }
  | { kind: "none" };

export type AccountIdResolver = (agentId: string, channel: string) => AccountIdResolveResult;

type DeliveryContext = Record<string, unknown>;

const NON_MESSAGING_CHANNELS = new Set(["cli", "ui", "employee", "system"]);

export class MessageTool extends Tool {
  private deliveryContext: DeliveryContext = {};
  private nameResolver?: NameResolver;
  private groupNameResolver?: GroupNameResolver;
  private knownChannels?: Set<string>;
  private accountIdResolver?: AccountIdResolver;
  private agentId?: string;

  constructor(private sendCallback: (msg: OutboundMessage) => Promise<void>) {
    super();
  }

  get name(): string {
    return "message";
  }

  get description(): string {
    return "Send a message to a chat channel. Supports sending to a specific person by name (to_name) or ID (to_user), sending to a group by group conversation ID (to_group), and @mentioning users in group messages (mention).";
  }

  get parameters(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        action: { type: "string", enum: ["send"], description: "Action to perform" },
        content: { type: "string", description: "Message to send" },
        message: { type: "string", description: "Alias for content" },
        channel: { type: "string", description: "Channel type, e.g. 'dingtalk', 'telegram'. NOT a group name or person name." },
        chatId: { type: "string", description: "Chat/conversation ID (person ID for 1:1, group ID for group chat)" },
        to: { type: "string", description: "Alias for chatId" },
        to_name: { type: "string", description: "Send to a person by name (resolved automatically)" },
        to_user: { type: "string", description: "Send to a person by user ID (exact, 1:1 direct message)" },
        to_group: { type: "string", description: "Send to a group by group conversation ID (group message)" },
        to_group_name: { type: "string", description: "Send to a group by group name (resolved automatically from known groups)" },
        mention: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } }
          ],
          description: "Name(s) to @mention in group messages (resolved via NameResolver)"
        },
        account_id: { type: "string", description: "Account ID to send from (for multi-account channels)" },
        replyTo: { type: "string", description: "Message ID to reply to" },
        silent: { type: "boolean", description: "Send without notification where supported" }
      },
      required: []
    };
  }

  setDeliveryContext(ctx: DeliveryContext): void {
    this.deliveryContext = ctx;
  }

  /** @deprecated Use setDeliveryContext instead */
  setContext(channel: string, chatId: string): void {
    this.deliveryContext = { channel, chatId };
  }

  setNameResolver(resolver: NameResolver): void {
    this.nameResolver = resolver;
  }

  setGroupNameResolver(resolver: GroupNameResolver): void {
    this.groupNameResolver = resolver;
  }

  setKnownChannels(channels: string[]): void {
    this.knownChannels = new Set(channels);
  }

  setAccountIdResolver(resolver: AccountIdResolver, agentId: string): void {
    this.accountIdResolver = resolver;
    this.agentId = agentId;
  }

  async execute(params: Record<string, unknown>): Promise<string> {
    const action = params.action ? String(params.action) : "send";
    if (action !== "send") {
      return `Error: Unsupported action '${action}'`;
    }
    const content = String(params.content ?? params.message ?? "");
    if (!content) {
      return "Error: content/message is required";
    }

    const channel = String(params.channel ?? this.deliveryContext.channel ?? "cli");
    let chatId = String(params.chatId ?? params.to ?? this.deliveryContext.chatId ?? "direct");
    const replyTo = params.replyTo ? String(params.replyTo) : undefined;
    const silent = typeof params.silent === "boolean" ? params.silent : undefined;

    if (params.channel && this.knownChannels && !this.knownChannels.has(channel)) {
      const available = [...this.knownChannels].join(", ");
      return `Error: 未知的 channel "${channel}"。channel 是渠道类型（如 dingtalk, telegram），不是群名或人名。可用渠道: ${available}`;
    }

    const metadata: Record<string, unknown> = {};
    if (silent !== undefined) metadata.silent = silent;
    if (params.account_id) {
      metadata.account_id = String(params.account_id);
      metadata.accountId = String(params.account_id);
    }

    const toUser = params.to_user ? String(params.to_user) : undefined;
    const toName = params.to_name ? String(params.to_name) : undefined;
    const toGroup = params.to_group ? String(params.to_group) : undefined;
    const toGroupName = params.to_group_name ? String(params.to_group_name) : undefined;
    const explicitChannel = Boolean(params.channel);

    if ((toUser || toName || toGroup || toGroupName) && !explicitChannel && NON_MESSAGING_CHANNELS.has(channel)) {
      return `Error: 使用 to_name/to_user/to_group/to_group_name 发送消息时，必须指定 channel 参数（如 channel: "dingtalk"）。当前上下文渠道 "${channel}" 不支持直接投递。`;
    }

    if (toGroup) {
      metadata.peer_kind = "group";
      chatId = toGroup;
    } else if (toGroupName) {
      if (!this.groupNameResolver) {
        return "Error: group name resolution is not available in this environment";
      }
      const result = await this.groupNameResolver(toGroupName);
      if (result.kind === "not_found") {
        return `Error: 未找到名为 '${toGroupName}' 的群。群名需要机器人在该群中收到过消息后才可解析。`;
      }
      metadata.peer_kind = "group";
      chatId = result.conversationId;
    } else if (toUser) {
      metadata.target_user_id = toUser;
      chatId = toUser;
    } else if (toName) {
      if (!this.nameResolver) {
        return "Error: name resolution is not available in this environment";
      }
      const result = await this.nameResolver(toName);
      if (result.kind === "not_found") {
        return `Error: 未找到名为 '${toName}' 的用户`;
      }
      if (result.kind === "ambiguous") {
        const list = result.candidates
          .map((c) => `${c.displayName} (${c.hint}, ID: ${c.userId})`)
          .join("\n  - ");
        return `找到多个匹配，请用 to_user 指定 ID:\n  - ${list}`;
      }
      metadata.target_user_id = result.userId;
      chatId = result.userId;
    }

    const mentionRaw = params.mention;
    if (mentionRaw) {
      const mentionList = Array.isArray(mentionRaw)
        ? mentionRaw.map(String)
        : [String(mentionRaw)];
      const resolvedIds: string[] = [];
      const resolvedNames: Record<string, string> = {};
      const errors: string[] = [];
      for (const m of mentionList) {
        if (/^\d{5,}$/.test(m)) {
          resolvedIds.push(m);
          continue;
        }
        if (!this.nameResolver) {
          errors.push(`'${m}' 无法解析（name resolution 不可用）`);
          continue;
        }
        const result = await this.nameResolver(m);
        if (result.kind === "found") {
          resolvedIds.push(result.userId);
          resolvedNames[result.userId] = result.displayName;
        } else if (result.kind === "ambiguous") {
          const list = result.candidates
            .map((c) => `${c.displayName} (${c.hint}, ID: ${c.userId})`)
            .join(", ");
          errors.push(`'${m}' 匹配到多人: ${list}`);
        } else {
          errors.push(`'${m}' 未找到`);
        }
      }
      if (errors.length > 0 && resolvedIds.length === 0) {
        return `Error: mention 解析失败:\n${errors.join("\n")}\n请使用精确的用户 ID 重新指定 mention。`;
      }
      if (resolvedIds.length > 0) {
        metadata.mention_user_ids = resolvedIds;
        if (Object.keys(resolvedNames).length > 0) {
          metadata.mention_user_names = resolvedNames;
        }
        if (!metadata.peer_kind) {
          metadata.peer_kind = "group";
        }
      }
    }

    const deliveryMeta = (this.deliveryContext.metadata ?? {}) as Record<string, unknown>;
    const mergedMetadata: Record<string, unknown> = {
      ...deliveryMeta,
      ...metadata,
    };

    if (!mergedMetadata.accountId && !mergedMetadata.account_id && !NON_MESSAGING_CHANNELS.has(channel)) {
      if (this.accountIdResolver && this.agentId) {
        const resolved = this.accountIdResolver(this.agentId, channel);
        if (resolved.kind === "resolved") {
          mergedMetadata.accountId = resolved.accountId;
          mergedMetadata.account_id = resolved.accountId;
        } else if (resolved.kind === "ambiguous") {
          const list = resolved.accountIds.join(", ");
          return `Error: 当前员工在 ${channel} 渠道绑定了多个账号: ${list}。请通过 account_id 参数指定使用哪个账号发送。`;
        }
      }
    }

    await this.sendCallback({
      channel,
      chatId,
      content,
      replyTo,
      media: [],
      metadata: mergedMetadata
    });
    return `Message sent to ${channel}:${chatId}`;
  }
}

import type { Config } from "@nextclaw/core";
import { DingTalkChannel } from "./channel";
import { dingtalkPluginConfigSchema } from "./config";

const plugin = {
  id: "builtin-channel-dingtalk",
  name: "Builtin DingTalk Channel",
  description: "Builtin NextClaw DingTalk channel plugin with multi-account routing",
  configSchema: dingtalkPluginConfigSchema,
  register(api: {
    registerChannel: (registration: {
      plugin: {
        id: string;
        config?: {
          listAccountIds?: (cfg?: Record<string, unknown>) => string[];
          defaultAccountId?: (cfg?: Record<string, unknown>) => string;
        };
        nextclaw: {
          isEnabled: (config: Config) => boolean;
          createChannel: (ctx: { config: Config; bus: import("@nextclaw/core").MessageBus }) => DingTalkChannel;
        };
      };
    }) => void;
  }) {
    api.registerChannel({
      plugin: {
        id: "dingtalk",
        config: {
          listAccountIds: (cfg) => Object.keys((cfg?.accounts as Record<string, unknown> | undefined) ?? {}),
          defaultAccountId: (cfg) => String(cfg?.defaultAccountId ?? "default")
        },
        nextclaw: {
          isEnabled: (config: Config) => config.channels.dingtalk.enabled,
          createChannel: (ctx) => new DingTalkChannel(ctx.config.channels.dingtalk, ctx.bus)
        }
      }
    });
  }
};

export default plugin;

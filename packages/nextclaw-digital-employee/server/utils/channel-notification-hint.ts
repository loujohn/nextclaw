import type { IntegrationConnectionRepository } from "../repositories/integration-connection-repository";
import { getEmployeeDingTalkBinding } from "../runtime/dingtalk-config";
import { createLogger } from "./logger";

const logger = createLogger("ChannelNotificationHint");

export type NotificationTarget = {
  channel: string;
  target: string;
};

/** 收集员工绑定的所有渠道通知目标。新增渠道类型（飞书、Slack 等）时在此扩展。 */
async function resolveNotificationTargets(
  repo: IntegrationConnectionRepository,
  employeeCode: string
): Promise<NotificationTarget[]> {
  const targets: NotificationTarget[] = [];

  try {
    const binding = await getEmployeeDingTalkBinding(repo, employeeCode);
    for (const group of binding.groupBindings) {
      if (group.groupId) {
        targets.push({ channel: "dingtalk", target: `group:${group.groupId}` });
      }
    }
  } catch {
    logger.debug(`员工 ${employeeCode} 无钉钉绑定`);
  }

  // TODO: 在此添加飞书 / Slack / 其他渠道

  return targets;
}

/** 为无头触发（webhook/定时任务）的消息构建渠道通知提示。无绑定时返回空字符串。 */
export async function buildChannelNotificationHint(
  repo: IntegrationConnectionRepository,
  employeeCode: string
): Promise<string> {
  try {
    const targets = await resolveNotificationTargets(repo, employeeCode);
    if (targets.length === 0) return "";

    const lines = targets.map(
      (t) => `- channel: ${t.channel}, to: ${t.target}`
    );
    return (
      `\n\n---\n[系统提示] 任务完成后，请使用 message 工具将结果摘要发送到以下渠道：\n` +
      lines.join("\n")
    );
  } catch (err) {
    logger.warn(`构建员工 ${employeeCode} 的渠道通知提示失败:`, err);
    return "";
  }
}

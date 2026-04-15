import { createError, readBody, getHeader } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import { createLogger } from "../../utils/logger";

const logger = createLogger("GitLabWebhook");

type GitLabWebhookPayload = {
  object_kind?: string;
  event_type?: string;
  project?: {
    id: number;
    name: string;
    path_with_namespace: string;
    web_url: string;
  };
  object_attributes?: {
    iid: number;
    title: string;
    description: string;
    state: string;
    action: string;
    source_branch: string;
    target_branch: string;
    url: string;
    last_commit?: {
      id: string;
      message: string;
      title: string;
    };
  };
  commits?: Array<{
    id: string;
    message: string;
    timestamp: string;
    url: string;
  }>;
  before?: string;
  after?: string;
  ref?: string;
  user_username?: string;
  user_name?: string;
};

/**
 * Verify GitLab webhook token sent via X-Gitlab-Token header.
 * Returns true when no token is configured (dev mode) — production must set GITLAB_WEBHOOK_TOKEN.
 */
function verifyWebhookToken(
  eventToken: string | undefined,
  expectedToken: string,
): boolean {
  if (!expectedToken) return true;
  if (!eventToken) return false;
  return eventToken === expectedToken;
}

async function resolveGitLabConfig(
  ctx: Awaited<ReturnType<typeof getPlatformContext>>,
): Promise<{
  gitlabUrl: string;
  webhookToken: string;
  reviewerEmployeeCode: string;
}> {
  const secrets = await ctx.secretsRepo.getDecryptedForScope();

  const gitlabUrl = secrets.get("GITLAB_URL") || process.env.GITLAB_URL || "";
  const webhookToken =
    secrets.get("GITLAB_WEBHOOK_TOKEN") ||
    process.env.GITLAB_WEBHOOK_TOKEN ||
    "";
  const reviewerEmployeeCode =
    secrets.get("GITLAB_REVIEWER_EMPLOYEE_CODE") ||
    process.env.GITLAB_REVIEWER_EMPLOYEE_CODE ||
    "code-reviewer";

  return { gitlabUrl, webhookToken, reviewerEmployeeCode };
}

function isPushCommits(event: GitLabWebhookPayload): boolean {
  return event.object_kind === "push" && Array.isArray(event.commits);
}

function buildProjectSection(
  event: GitLabWebhookPayload,
  gitlabUrl: string,
): string {
  const p = event.project;
  return (
    `## 项目信息\n` +
    `- 项目: ${p?.path_with_namespace || "未知"}\n` +
    `- GitLab: ${gitlabUrl}\n` +
    `- 项目ID: ${p?.id}\n` +
    `- 项目链接: ${p?.web_url || ""}\n\n`
  );
}

function buildMRSection(mr: NonNullable<GitLabWebhookPayload["object_attributes"]>): string {
  let s =
    `## Merge Request 信息\n` +
    `- MR #${mr.iid}: ${mr.title}\n` +
    `- 状态: ${mr.state}\n` +
    `- 动作: ${mr.action}\n` +
    `- 分支: ${mr.source_branch} → ${mr.target_branch}\n` +
    `- MR 链接: ${mr.url}\n`;
  if (mr.description) s += `- 描述: ${mr.description}\n`;
  return s + `\n`;
}

function buildPushSection(event: GitLabWebhookPayload): string {
  let s =
    `## Push 信息\n` +
    `- 分支: ${event.ref || "未知"}\n` +
    `- Before: ${event.before || "未知"}\n` +
    `- After: ${event.after || "未知"}\n`;
  if (event.commits && event.commits.length > 0) {
    s += `- 提交数: ${event.commits.length}\n- 提交信息:\n`;
    for (const c of event.commits.slice(0, 5)) {
      s += `  - [${c.id.slice(0, 8)}](${c.url}) ${c.message.split("\n")[0]}\n`;
    }
  }
  return s + `\n`;
}

function buildReviewSteps(): string {
  return (
    `## 执行步骤\n\n` +
    `请严格按照 gitlab-code-review 技能中的 Code Review 执行流程操作：\n\n` +
    `### 第一步：获取代码变更\n` +
    `- 使用 gitlab-api.py get-diff 获取 diff 内容\n` +
    `- 使用 gitlab-api.py get-commits 获取所有提交详情（含提交链接）\n\n` +
    `### 第二步：Code Review（Senior Reviewer 视角）\n` +
    `按以下维度逐文件审查，问题分类为 Critical / Important / Minor：\n` +
    `- **安全性**：SQL 注入、XSS、敏感信息泄露、权限缺失\n` +
    `- **代码质量**：函数过长、重复代码、命名、魔法数字、错误处理\n` +
    `- **性能**：N+1 查询、不必要循环、缺少缓存\n` +
    `- **可维护性**：职责单一、依赖合理、注释充分\n` +
    `- **业务逻辑**：边界条件、异常场景、数据一致性\n\n` +
    `对每个问题必须标注：文件路径、行号、问题描述、为什么重要、如何修复\n\n` +
    `### 第三步：发表评论\n` +
    `- 对具体问题发表行级评论（post-comment --path --line）\n` +
    `- 发表总体 review 总结（post-note），包含提交列表和问题统计\n\n` +
    `### 第四步：返回结构化结果\n` +
    `审查完成后，必须以 JSON 格式返回以下结构化摘要：\n` +
    "```json\n" +
    `{
  "review_status": "completed",
  "mr_url": "<MR链接>",
  "project": "<项目名称>",
  "commits": [
    {"short_id": "<短SHA>", "message": "<提交信息>", "author": "<作者>", "url": "<提交链接>"}
  ],
  "summary": {
    "files_changed": "<数量>",
    "critical": "<数量>",
    "important": "<数量>",
    "minor": "<数量>"
  },
  "verdict": "Ready to merge | Needs fixes | Blocked",
  "comments_posted": "<数量>"
}\n` +
    "```\n\n"
  );
}

function buildMRCommandRef(projectId: number | undefined, mrIid: number): string {
  return (
    `## 命令参数参考\n\n` +
    `获取 diff:\n\`\`\`bash\n` +
    `python scripts/gitlab-api.py get-diff --project-id ${projectId} --mr-iid ${mrIid}\n\`\`\`\n\n` +
    `获取提交列表:\n\`\`\`bash\n` +
    `python scripts/gitlab-api.py get-commits --project-id ${projectId} --mr-iid ${mrIid}\n\`\`\`\n\n` +
    `发表行级评论:\n\`\`\`bash\n` +
    `python scripts/gitlab-api.py post-comment --project-id ${projectId} --mr-iid ${mrIid} --body "<内容>" --path "<路径>" --line <行号>\n\`\`\`\n\n` +
    `发表总体评论:\n\`\`\`bash\n` +
    `python scripts/gitlab-api.py post-note --project-id ${projectId} --mr-iid ${mrIid} --body "<总体内容>"\n\`\`\`\n`
  );
}

function buildPushCommandRef(projectId: number | undefined, before: string, after: string): string {
  return (
    `## 命令参数参考\n\n` +
    `获取 diff:\n\`\`\`bash\n` +
    `python scripts/gitlab-api.py get-push-diff --project-id ${projectId} --before "${before}" --after "${after}"\n\`\`\`\n`
  );
}

function buildReviewPrompt(
  event: GitLabWebhookPayload,
  gitlabUrl: string,
): string {
  const isMR = event.object_kind === "merge_request";
  const isPush = event.object_kind === "push";

  let prompt = `你是一名专业的 Code Reviewer，请以 Senior Code Reviewer 视角执行审查。\n\n`;
  prompt += buildProjectSection(event, gitlabUrl);

  if (isMR && event.object_attributes) prompt += buildMRSection(event.object_attributes);
  if (isPush) prompt += buildPushSection(event);

  prompt += `## 提交者\n- ${event.user_name || event.user_username || "未知"}\n\n`;
  prompt += buildReviewSteps();

  if (isMR && event.object_attributes) {
    prompt += buildMRCommandRef(event.project?.id, event.object_attributes.iid);
  }
  if (isPush) {
    prompt += buildPushCommandRef(event.project?.id, event.before || "", event.after || "");
  }

  return prompt;
}

export default defineEventHandler(async (event) => {
  const ctx = await getPlatformContext();
  const config = await resolveGitLabConfig(ctx);

  const webhookToken = getHeader(event, "x-gitlab-token");
  if (!verifyWebhookToken(webhookToken, config.webhookToken)) {
    logger.warn("Webhook token verification failed");
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid webhook token",
    });
  }

  const body = await readBody<GitLabWebhookPayload>(event);

  if (!body.object_kind) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing object_kind in webhook payload",
    });
  }

  const supportedEvents = ["merge_request", "push"];
  if (!supportedEvents.includes(body.object_kind)) {
    logger.info(`Ignoring unsupported event type: ${body.object_kind}`);
    return { ok: true, message: `Event type '${body.object_kind}' is ignored` };
  }

  if (body.object_kind === "merge_request" && body.object_attributes) {
    const action = body.object_attributes.action;
    const state = body.object_attributes.state;
    if (action && !["open", "update", "reopen"].includes(action)) {
      logger.info(`Ignoring MR action: ${action}`);
      return { ok: true, message: `MR action '${action}' is ignored` };
    }
    if (state === "merged" || state === "closed") {
      logger.info(`Ignoring MR state: ${state}`);
      return { ok: true, message: `MR state '${state}' is ignored` };
    }
  }

  const employee = await ctx.employeeRepo.getByCode(
    config.reviewerEmployeeCode,
  );
  if (!employee) {
    throw createError({
      statusCode: 400,
      statusMessage: `Code Review 员工不存在: ${config.reviewerEmployeeCode}。请先创建该员工或配置 GITLAB_REVIEWER_EMPLOYEE_CODE。`,
    });
  }

  const prompt = buildReviewPrompt(body, config.gitlabUrl);

  logger.info(
    `Triggering code review for ${body.object_kind} - project: ${body.project?.path_with_namespace}, ` +
      `employee: ${employee.code}`,
  );

  ctx.employeeRunService
    .runEmployeeTurn({
      employeeId: employee.id,
      message: prompt,
      triggerType: "webhook",
      triggerSource: `gitlab:${body.object_kind}:${body.project?.id}`,
      sessionTitle: `Code Review: ${body.object_kind === "merge_request" ? `MR #${body.object_attributes?.iid}` : `Push to ${body.ref}`}`,
    })
    .then((result) => {
      logger.info(
        `Code review completed for ${body.object_kind} (runId: ${result.runId}): ${result.reply.slice(0, 100)}...`,
      );
    })
    .catch((err) => {
      logger.error(`Code review failed for ${body.object_kind}:`, err);
    });

  return {
    ok: true,
    message: "Code review triggered",
    data: {
      eventType: body.object_kind,
      project: body.project?.path_with_namespace,
      projectUrl: body.project?.web_url,
      employee: employee.code,
      ...(body.object_kind === "merge_request" && body.object_attributes
        ? {
            mrIid: body.object_attributes.iid,
            mrTitle: body.object_attributes.title,
            mrUrl: body.object_attributes.url,
            sourceBranch: body.object_attributes.source_branch,
            targetBranch: body.object_attributes.target_branch,
          }
        : {}),
      ...(isPushCommits(body)
        ? {
            commits: body.commits?.slice(0, 5).map((c) => ({
              shortId: c.id.slice(0, 8),
              message: c.message.split("\n")[0],
              url: c.url,
            })),
          }
        : {}),
    },
  };
});

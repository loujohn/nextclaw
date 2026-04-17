import { createError, defineEventHandler } from "h3";
import { getUserSyncJob } from "../../../services/user-sync-job-manager";
import { requireRole } from "../../../utils/auth-guards";

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const jobId = event.context.params?.jobId;
  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "缺少同步任务 ID。",
    });
  }

  const job = getUserSyncJob(jobId);
  if (!job) {
    throw createError({
      statusCode: 404,
      statusMessage: "Sync job not found",
      message: "未找到对应的同步任务，可能已过期或不存在。",
    });
  }

  return { ok: true, data: job };
});
import { defineEventHandler, readBody, createError } from "h3";
import { hashSync } from "bcryptjs";
import { getPlatformContext } from "../../runtime/platform-context";
import { requireRole } from "../../utils/auth-guards";
import type { UserRole } from "../../../shared/auth-types";

const VALID_ROLES: UserRole[] = ["admin", "manager", "user"];

export default defineEventHandler(async (event) => {
  requireRole(event, "admin");

  const body = await readBody<{
    username?: string;
    email?: string;
    displayName?: string;
    password?: string;
    role?: UserRole;
  }>(event);

  if (!body?.username || !body?.password || !body?.displayName) {
    throw createError({ statusCode: 400, statusMessage: "Missing required fields: username, displayName, password" });
  }

  if (body.role && !VALID_ROLES.includes(body.role)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid role" });
  }

  const ctx = await getPlatformContext();
  const existing = await ctx.userRepo.findByUsername(body.username);
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: "User with this username already exists" });
  }

  const passwordHash = hashSync(body.password, 10);
  const user = await ctx.userRepo.createLocalUser({
    username: body.username,
    email: body.email,
    displayName: body.displayName,
    passwordHash,
    role: body.role,
  });

  return { ok: true, data: { id: user.id, username: body.username, displayName: user.displayName, role: user.role } };
});

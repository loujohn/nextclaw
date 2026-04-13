import { defineEventHandler, readBody, createError } from "h3";
import { compareSync } from "bcryptjs";
import { getPlatformContext } from "../../runtime/platform-context";
import { signLocalJwt } from "../../utils/local-jwt";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event);
  if (!body?.username || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: "Missing username or password" });
  }
  const usernameInput = body.username.trim();
  const passwordInput = body.password;

  const ctx = await getPlatformContext();
  const user = await ctx.userRepo.findByUsername(usernameInput);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Invalid credentials" });
  }

  if (user.auth_provider !== "local" || !user.password_hash) {
    throw createError({ statusCode: 401, statusMessage: "This account uses SSO login" });
  }

  if (user.is_active !== 1) {
    throw createError({ statusCode: 403, statusMessage: "Account disabled" });
  }

  const valid = compareSync(passwordInput, user.password_hash);
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: "Invalid credentials" });
  }

  await ctx.userRepo.updateLastLogin(user.id);

  const { accessToken, expiresIn } = await signLocalJwt({
    sub: user.id,
    email: user.email,
    name: user.display_name,
    role: user.role,
  });

  return {
    ok: true,
    access_token: accessToken,
    expires_in: expiresIn,
    token_type: "Bearer",
  };
});

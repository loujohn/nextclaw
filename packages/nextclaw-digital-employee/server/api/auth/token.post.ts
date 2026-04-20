import { defineEventHandler, readBody, createError } from "h3";
import { getPlatformContext } from "../../runtime/platform-context";
import {
  isLocalJwtToken,
  signLocalJwt,
  signLocalRefreshJwt,
  verifyLocalRefreshJwt,
} from "../../utils/local-jwt";

/**
 * Server-side proxy for Keycloak token endpoint.
 * Avoids browser CORS issues by routing all token requests through the backend.
 * Supports grant_type: authorization_code (PKCE callback) and refresh_token.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, string>>(event);
  const grantType = body?.grant_type;

  if (!grantType || !["authorization_code", "refresh_token"].includes(grantType)) {
    throw createError({ statusCode: 400, statusMessage: "Unsupported grant_type" });
  }

  if (grantType === "refresh_token" && body.refresh_token && isLocalJwtToken(body.refresh_token)) {
    const payload = await verifyLocalRefreshJwt(body.refresh_token);
    if (!payload?.sub) {
      throw createError({ statusCode: 401, statusMessage: "Invalid or expired refresh token" });
    }

    const ctx = await getPlatformContext();
    const user = await ctx.userRepo.findById(payload.sub);
    if (!user) {
      throw createError({ statusCode: 401, statusMessage: "User not found" });
    }
    if (!user.isActive) {
      throw createError({ statusCode: 403, statusMessage: "Account disabled" });
    }

    const { accessToken, expiresIn } = await signLocalJwt({
      sub: user.id,
      email: user.email,
      name: user.displayName,
      role: user.role,
    });
    const { refreshToken, expiresIn: refreshExpiresIn } = await signLocalRefreshJwt({
      sub: user.id,
    });

    return {
      access_token: accessToken,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      refresh_expires_in: refreshExpiresIn,
      token_type: "Bearer",
    };
  }

  const config = useRuntimeConfig();
  const keycloakUrl = config.keycloakUrl as string;
  const realm = config.keycloakRealm as string;

  if (!keycloakUrl || !realm) {
    throw createError({ statusCode: 500, statusMessage: "Keycloak not configured" });
  }

  const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value != null) params.set(key, value);
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[auth/token] Keycloak token request failed:", res.status, errText);
    throw createError({
      statusCode: res.status >= 400 && res.status < 500 ? res.status : 502,
      statusMessage: "Token exchange failed",
    });
  }

  return res.json();
});

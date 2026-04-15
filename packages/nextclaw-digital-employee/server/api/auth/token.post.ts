import { defineEventHandler, readBody, createError } from "h3";

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

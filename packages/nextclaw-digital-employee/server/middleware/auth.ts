import { defineEventHandler, getHeader, getCookie, createError } from "h3";
import { verifyAccessToken, initJwks } from "../utils/jwks-cache";
import { verifyLocalJwt, initLocalJwt, getLocalIssuer } from "../utils/local-jwt";
import { getPlatformContext } from "../runtime/platform-context";
import type { UserContext } from "../../shared/auth-types";

const PUBLIC_PATHS = [
  "/api/health",
  "/api/auth/login",
  "/api/webhooks/",
  "/_nuxt/",
  "/__nuxt_error",
  "/favicon.ico",
  "/_ipx/",
];

const PUBLIC_PAGE_PATHS = [
  "/login",
  "/auth/callback",
];

let _initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = Promise.resolve().then(() => {
    const config = useRuntimeConfig();

    if (config.jwtSecret) {
      initLocalJwt(config.jwtSecret as string);
    }

    if (config.keycloakUrl && config.keycloakRealm) {
      initJwks({
        keycloakUrl: config.keycloakUrl as string,
        realm: config.keycloakRealm as string,
        clientId: (config.public as Record<string, string>).keycloakClientId ?? "de-platform",
      });
    } else {
      console.warn("[auth] KEYCLOAK_URL or KEYCLOAK_REALM not configured — SSO login disabled, local auth only");
    }
  });
  return _initPromise;
}

function decodeIssuer(token: string): string | null {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return json.iss ?? null;
  } catch {
    return null;
  }
}

export default defineEventHandler(async (event) => {
  await ensureInit();

  const path = event.path ?? "";

  if (PUBLIC_PAGE_PATHS.some((p) => path === p || path.startsWith(p + "?"))) {
    return;
  }
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return;
  }

  if (!path.startsWith("/api/")) {
    return;
  }

  const authHeader = getHeader(event, "authorization");
  let token: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = getCookie(event, "de_access_token") || undefined;
  }
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "Missing or invalid Authorization" });
  }
  const issuer = decodeIssuer(token);

  let userContext: UserContext | null = null;
  const ctx = await getPlatformContext();

  if (issuer === getLocalIssuer()) {
    const payload = await verifyLocalJwt(token);
    if (!payload?.sub) {
      throw createError({ statusCode: 401, statusMessage: "Invalid or expired token" });
    }
    const user = await ctx.userRepo.findById(payload.sub);
    if (!user) {
      throw createError({ statusCode: 401, statusMessage: "User not found" });
    }
    if (!user.isActive) {
      throw createError({ statusCode: 403, statusMessage: "Account disabled" });
    }
    userContext = {
      id: user.id,
      keycloakSub: "",
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isActive: user.isActive,
      departmentId: user.departmentId,
      humanEmployeeId: user.humanEmployeeId,
    };
  } else {
    const result = await verifyAccessToken(token);
    if (!result) {
      throw createError({ statusCode: 401, statusMessage: "Invalid or expired token" });
    }

    const payload = result.payload as Record<string, unknown>;
    const sub = payload.sub as string | undefined;
    if (!sub) {
      throw createError({ statusCode: 401, statusMessage: "Token missing sub claim" });
    }
    const email = (payload.email as string) ?? "";
    const name = (payload.name as string) ?? (payload.preferred_username as string) ?? "";

    const user = await ctx.userRepo.upsertFromToken({
      keycloakSub: sub,
      email,
      displayName: name,
    });

    if (!user.isActive) {
      throw createError({ statusCode: 403, statusMessage: "Account disabled" });
    }
    userContext = user;
  }

  event.context.user = userContext;
});

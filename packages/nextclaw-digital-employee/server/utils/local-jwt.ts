import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const LOCAL_ISSUER = "de-platform-local";
const ACCESS_TOKEN_AUDIENCE = "de-platform";
const REFRESH_TOKEN_AUDIENCE = "de-platform-refresh";
const DEFAULT_ACCESS_TOKEN_TTL = "1h";
const DEFAULT_REFRESH_TOKEN_TTL = "14d";

let _secret: Uint8Array | null = null;
let _accessTokenTtl = DEFAULT_ACCESS_TOKEN_TTL;
let _refreshTokenTtl = DEFAULT_REFRESH_TOKEN_TTL;

function parseTtlToSeconds(ttl: string): number {
  const normalized = ttl.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(s|m|h|d|w)?$/);
  if (!match) {
    throw new Error(`Unsupported local JWT ttl: ${ttl}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  let multiplier = 1;

  switch (unit) {
    case "s":
      multiplier = 1;
      break;
    case "m":
      multiplier = 60;
      break;
    case "h":
      multiplier = 3600;
      break;
    case "d":
      multiplier = 86400;
      break;
    case "w":
      multiplier = 604800;
      break;
    default:
      throw new Error(`Unsupported local JWT ttl unit: ${unit}`);
  }

  return amount * multiplier;
}

export function initLocalJwt(secret: string, options?: {
  accessTokenTtl?: string;
  refreshTokenTtl?: string;
}): void {
  _secret = new TextEncoder().encode(secret);
  _accessTokenTtl = options?.accessTokenTtl?.trim() || DEFAULT_ACCESS_TOKEN_TTL;
  _refreshTokenTtl = options?.refreshTokenTtl?.trim() || DEFAULT_REFRESH_TOKEN_TTL;
  parseTtlToSeconds(_accessTokenTtl);
  parseTtlToSeconds(_refreshTokenTtl);
}

function getSecret(): Uint8Array {
  if (!_secret) throw new Error("Local JWT secret not initialized — call initLocalJwt() first");
  return _secret;
}

export function getLocalIssuer(): string {
  return LOCAL_ISSUER;
}

export function isLocalJwtToken(token: string): boolean {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return false;
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return json.iss === LOCAL_ISSUER;
  } catch {
    return false;
  }
}

export function isLocalJwtConfigured(): boolean {
  return _secret !== null;
}

export type LocalJwtPayload = JWTPayload & {
  sub: string;
  email: string;
  name: string;
  role: string;
};

export type LocalRefreshJwtPayload = JWTPayload & {
  sub: string;
};

export async function signLocalJwt(payload: {
  sub: string;
  email: string;
  name: string;
  role: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const expiresIn = parseTtlToSeconds(_accessTokenTtl);
  const token = await new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(LOCAL_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(_accessTokenTtl)
    .sign(getSecret());

  return { accessToken: token, expiresIn };
}

export async function signLocalRefreshJwt(payload: {
  sub: string;
}): Promise<{ refreshToken: string; expiresIn: number }> {
  const expiresIn = parseTtlToSeconds(_refreshTokenTtl);
  const token = await new SignJWT({
    token_use: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(LOCAL_ISSUER)
    .setAudience(REFRESH_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(_refreshTokenTtl)
    .sign(getSecret());

  return { refreshToken: token, expiresIn };
}

export async function verifyLocalJwt(token: string): Promise<LocalJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: LOCAL_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    });
    return payload as LocalJwtPayload;
  } catch {
    return null;
  }
}

export async function verifyLocalRefreshJwt(token: string): Promise<LocalRefreshJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: LOCAL_ISSUER,
      audience: REFRESH_TOKEN_AUDIENCE,
    });
    if (payload.token_use !== "refresh") {
      return null;
    }
    return payload as LocalRefreshJwtPayload;
  } catch {
    return null;
  }
}

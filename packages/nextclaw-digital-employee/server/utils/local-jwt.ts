import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const LOCAL_ISSUER = "de-platform-local";
const DEFAULT_EXPIRY = "1h";

let _secret: Uint8Array | null = null;

export function initLocalJwt(secret: string): void {
  _secret = new TextEncoder().encode(secret);
}

function getSecret(): Uint8Array {
  if (!_secret) throw new Error("Local JWT secret not initialized — call initLocalJwt() first");
  return _secret;
}

export function getLocalIssuer(): string {
  return LOCAL_ISSUER;
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

export async function signLocalJwt(payload: {
  sub: string;
  email: string;
  name: string;
  role: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const expiresIn = 3600;
  const token = await new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(LOCAL_ISSUER)
    .setAudience("de-platform")
    .setIssuedAt()
    .setExpirationTime(DEFAULT_EXPIRY)
    .sign(getSecret());

  return { accessToken: token, expiresIn };
}

export async function verifyLocalJwt(token: string): Promise<LocalJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: LOCAL_ISSUER,
      audience: "de-platform",
    });
    return payload as LocalJwtPayload;
  } catch {
    return null;
  }
}

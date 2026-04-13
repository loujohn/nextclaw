import { createRemoteJWKSet, type JWTVerifyResult, jwtVerify, errors } from "jose";

type JwksCacheConfig = {
  keycloakUrl: string;
  realm: string;
  clientId: string;
};

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let _config: JwksCacheConfig | null = null;

function getJwksUri(config: JwksCacheConfig): URL {
  return new URL(
    `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/certs`
  );
}

function getIssuer(config: JwksCacheConfig): string {
  return `${config.keycloakUrl}/realms/${config.realm}`;
}

export function initJwks(config: JwksCacheConfig): void {
  _config = config;
  _jwks = createRemoteJWKSet(getJwksUri(config), {
    cooldownDuration: 30_000,
    cacheMaxAge: 300_000,
  });
}

export function resetJwks(): void {
  _config = null;
  _jwks = null;
}

export async function verifyAccessToken(
  token: string
): Promise<JWTVerifyResult | null> {
  if (!_jwks || !_config) return null;

  const verifyOpts = {
    issuer: getIssuer(_config),
  };

  try {
    const result = await jwtVerify(token, _jwks, verifyOpts);
    return result;
  } catch (err: unknown) {
    if (err instanceof errors.JWKSNoMatchingKey || err instanceof errors.JWKSMultipleMatchingKeys) {
      _jwks = createRemoteJWKSet(getJwksUri(_config), {
        cooldownDuration: 30_000,
        cacheMaxAge: 300_000,
      });
      try {
        return await jwtVerify(token, _jwks, verifyOpts);
      } catch {
        return null;
      }
    }
    return null;
  }
}

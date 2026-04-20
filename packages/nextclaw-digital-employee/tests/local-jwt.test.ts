import { describe, expect, it } from "vitest";
import {
  initLocalJwt,
  isLocalJwtToken,
  signLocalJwt,
  signLocalRefreshJwt,
  verifyLocalJwt,
  verifyLocalRefreshJwt,
} from "../server/utils/local-jwt";

describe("local jwt auth session", () => {
  it("issues separate access and refresh tokens", async () => {
    initLocalJwt("unit-test-secret", {
      accessTokenTtl: "2h",
      refreshTokenTtl: "14d",
    });

    const { accessToken, expiresIn } = await signLocalJwt({
      sub: "user-1",
      email: "user@example.com",
      name: "Test User",
      role: "admin",
    });
    const { refreshToken, expiresIn: refreshExpiresIn } = await signLocalRefreshJwt({
      sub: "user-1",
    });

    const accessPayload = await verifyLocalJwt(accessToken);
    const refreshPayload = await verifyLocalRefreshJwt(refreshToken);

    expect(expiresIn).toBe(7200);
    expect(refreshExpiresIn).toBe(1_209_600);
    expect(isLocalJwtToken(accessToken)).toBe(true);
    expect(isLocalJwtToken(refreshToken)).toBe(true);
    expect(accessPayload?.sub).toBe("user-1");
    expect(accessPayload?.email).toBe("user@example.com");
    expect(refreshPayload?.sub).toBe("user-1");
  });

  it("does not allow refresh token to masquerade as access token", async () => {
    initLocalJwt("unit-test-secret-2", {
      accessTokenTtl: "1h",
      refreshTokenTtl: "7d",
    });

    const { accessToken } = await signLocalJwt({
      sub: "user-2",
      email: "user2@example.com",
      name: "Test User 2",
      role: "manager",
    });
    const { refreshToken } = await signLocalRefreshJwt({
      sub: "user-2",
    });

    expect(await verifyLocalRefreshJwt(accessToken)).toBeNull();
    expect(await verifyLocalJwt(refreshToken)).toBeNull();
  });
});
import type { UserView, UserRole } from "../../shared/auth-types";
import { rememberLoginModeOverride } from "./useAuthRedirect";

type AuthState = {
  user: UserView | null;
  loading: boolean;
  accessToken: string | null;
};

const REFRESH_TOKEN_KEY = "de_refresh_token";
const CODE_VERIFIER_KEY = "de_code_verifier";
const OAUTH_STATE_KEY = "de_oauth_state";
const ID_TOKEN_KEY = "de_id_token";
const ACCESS_TOKEN_COOKIE = "de_access_token";

function resolveErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeError = error as {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
    data?: { statusCode?: number };
  };

  return maybeError.statusCode
    ?? maybeError.status
    ?? maybeError.response?.status
    ?? maybeError.data?.statusCode
    ?? null;
}

let _refreshPromise: Promise<boolean> | null = null;
let _readyResolve: (() => void) | null = null;
const _readyPromise = new Promise<void>((resolve) => {
  _readyResolve = resolve;
});
let _initStarted = false;
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const data = new TextEncoder().encode(plain);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    return crypto.subtle.digest("SHA-256", data);
  }
  return sha256Fallback(data);
}

function sha256Fallback(data: Uint8Array): ArrayBuffer {
  const K: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  const bitLen = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) & ~63));
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen, false);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  for (let off = 0; off < padded.length; off += 64) {
    const w = new Int32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  const out = new ArrayBuffer(32);
  const dv = new DataView(out);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => dv.setUint32(i * 4, v, false));
  return out;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getTokenRemainingTtl(token: string): number {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return 0;
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    const exp = json.exp as number | undefined;
    if (!exp) return 0;
    return Math.max(0, exp - Math.floor(Date.now() / 1000));
  } catch {
    return 0;
  }
}

function decodeTokenIssuer(token: string | null): string | null {
  if (!token) {
    return null;
  }

  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    return typeof json.iss === "string" ? json.iss : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const state = useState<AuthState>("auth", () => ({
    user: null,
    loading: true,
    accessToken: null,
  }));

  const isSecureContext = import.meta.client
    ? window.location.protocol === "https:"
    : !import.meta.dev;

  const tokenCookie = useCookie(ACCESS_TOKEN_COOKIE, {
    maxAge: 3600,
    path: "/",
    sameSite: "lax",
    secure: isSecureContext,
  });

  const config = useRuntimeConfig();
  const keycloakUrl = config.public.keycloakUrl as string;
  const realm = config.public.keycloakRealm as string;
  const clientId = config.public.keycloakClientId as string;
  const redirectNotice = useAuthRedirectNotice();
  const redirecting = useAuthRedirectingState();

  function setAccessToken(token: string | null): void {
    state.value.accessToken = token;
    tokenCookie.value = token;
  }

  const isAuthenticated = computed(() => !!state.value.user && !!state.value.accessToken);
  const isAdmin = computed(() => state.value.user?.role === "admin");
  const isManager = computed(() => state.value.user?.role === "manager");
  const loading = computed(() => state.value.loading);
  const user = computed(() => state.value.user);

  function getAuthEndpoint(): string {
    return `${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth`;
  }

  function getLogoutEndpoint(): string {
    return `${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout`;
  }

  async function login(): Promise<void> {
    const codeVerifier = generateRandomString(64);
    const challengeBuffer = await sha256(codeVerifier);
    const codeChallenge = base64UrlEncode(challengeBuffer);
    const oauthState = generateRandomString(32);

    sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);

    const redirectUri = `${window.location.origin}/auth/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope: "openid profile email",
      state: oauthState,
    });

    window.location.href = `${getAuthEndpoint()}?${params}`;
  }

  async function handleCallback(code: string, returnedState: string): Promise<boolean> {
    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (returnedState !== savedState) {
      console.error("[auth] OAuth state mismatch, saved:", savedState, "returned:", returnedState);
      return false;
    }

    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    if (!codeVerifier) {
      console.error("[auth] Missing code verifier");
      return false;
    }

    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    const redirectUri = `${window.location.origin}/auth/callback`;

    try {
      const data = await $fetch<Record<string, unknown>>("/api/auth/token", {
        method: "POST",
        body: {
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        },
      });
      await handleTokenResponse(data);
      return true;
    } catch (err) {
      console.error("[auth] Token exchange error:", err);
      return false;
    }
  }

  async function loginWithPassword(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await $fetch<{
        ok: boolean;
        access_token: string;
        expires_in: number;
        refresh_token?: string;
      }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });

      if (!res.ok || !res.access_token) {
        return { ok: false, error: "认证失败" };
      }

      await handleTokenResponse(res as unknown as Record<string, unknown>);
      if (!state.value.user) {
        return { ok: false, error: "无法获取用户信息" };
      }
      return { ok: true };
    } catch (err: unknown) {
      const msg = (err as { data?: { message?: string } })?.data?.message
        ?? (err instanceof Error ? err.message : "网络错误，请重试");
      return { ok: false, error: msg };
    }
  }

  async function handleTokenResponse(data: Record<string, unknown>): Promise<void> {
    setAccessToken(data.access_token as string);
    if (data.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token as string);
    }
    if (data.id_token) {
      localStorage.setItem(ID_TOKEN_KEY, data.id_token as string);
    }
    await fetchMe();
    scheduleTokenRefresh((data.expires_in as number) ?? 300);
  }

  async function refreshToken(): Promise<boolean> {
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
      const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!rt) return false;

      try {
        const data = await $fetch<Record<string, unknown>>("/api/auth/token", {
          method: "POST",
          body: {
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: rt,
          },
        });

        setAccessToken(data.access_token as string);
        if (data.refresh_token) {
          localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token as string);
        }
        if (data.id_token) {
          localStorage.setItem(ID_TOKEN_KEY, data.id_token as string);
        }

        scheduleTokenRefresh((data.expires_in as number) ?? 300);
        return true;
      } catch (error) {
        if (resolveErrorStatus(error) === 401) {
          await handleUnauthorizedResponse();
        } else {
          clearTokens();
        }
        return false;
      } finally {
        _refreshPromise = null;
      }
    })();

    return _refreshPromise;
  }

  async function fetchMe(): Promise<void> {
    if (!state.value.accessToken) return;
    try {
      const res = await $fetch<{ ok: boolean; data: UserView }>("/api/auth/me", {
        headers: { Authorization: `Bearer ${state.value.accessToken}` },
      });
      if (res.ok) {
        state.value.user = res.data;
      }
    } catch (error) {
      state.value.user = null;
      if (resolveErrorStatus(error) === 401) {
        await handleUnauthorizedResponse();
      }
    }
  }

  function scheduleTokenRefresh(expiresInSeconds: number): void {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    const refreshInMs = Math.max((expiresInSeconds - 30) * 1000, 10_000);
    _refreshTimer = setTimeout(() => refreshToken(), refreshInMs);
  }

  function clearTokens(): void {
    setAccessToken(null);
    state.value.user = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ID_TOKEN_KEY);
    if (_refreshTimer) {
      clearTimeout(_refreshTimer);
      _refreshTimer = null;
    }
    _initStarted = false;
  }

  async function redirectToInitialLogin(message?: string): Promise<void> {
    clearTokens();

    if (!import.meta.client) {
      return;
    }

    if (message) {
      redirectNotice.value = message;
    }

    rememberLoginModeOverride();

    if (redirecting.value) {
      return;
    }

    redirecting.value = true;
    try {
      await navigateTo(getLoginPagePath(), { replace: true });
    } finally {
      redirecting.value = false;
    }
  }

  async function handleUnauthorizedResponse(message = SESSION_EXPIRED_MESSAGE): Promise<void> {
    await redirectToInitialLogin(message);
  }

  async function logout(): Promise<void> {
    const redirectUri = buildInitialLoginUrl();
    const idToken = localStorage.getItem(ID_TOKEN_KEY);
    const accessToken = state.value.accessToken;
    const keycloakIssuer = keycloakUrl && realm
      ? `${keycloakUrl}/realms/${realm}`
      : null;
    const shouldLogoutFromKeycloak = !!keycloakIssuer
      && (decodeTokenIssuer(accessToken) === keycloakIssuer || !!idToken);
    rememberLoginModeOverride();
    clearTokens();

    if (shouldLogoutFromKeycloak) {
      const params = new URLSearchParams({
        client_id: clientId,
        post_logout_redirect_uri: redirectUri,
      });
      if (idToken) {
        params.set("id_token_hint", idToken);
      }
      window.location.href = `${getLogoutEndpoint()}?${params}`;
    } else {
      await redirectToInitialLogin();
    }
  }

  function getAccessToken(): string | null {
    return state.value.accessToken;
  }

  function hasRole(...roles: UserRole[]): boolean {
    return !!state.value.user && roles.includes(state.value.user.role);
  }

  function canManageDepartment(deptId: string): boolean {
    if (!state.value.user) return false;
    if (state.value.user.role === "admin") return true;
    if (state.value.user.role === "manager" && state.value.user.departmentId === deptId) return true;
    return false;
  }

  async function waitUntilReady(): Promise<void> {
    return _readyPromise;
  }

  async function initialize(): Promise<void> {
    if (!import.meta.client) return;
    if (_initStarted) return;
    _initStarted = true;
    state.value.loading = true;

    const savedToken = tokenCookie.value;
    if (savedToken) {
      state.value.accessToken = savedToken;
      await fetchMe();
      if (state.value.user) {
        const remainingTtl = getTokenRemainingTtl(savedToken);
        scheduleTokenRefresh(remainingTtl > 0 ? remainingTtl : 60);
      } else {
        setAccessToken(null);
      }
    }

    const hasRefreshToken = !state.value.user && !!localStorage.getItem(REFRESH_TOKEN_KEY);
    if (hasRefreshToken) {
      const success = await refreshToken();
      if (success) {
        await fetchMe();
      }
    }

    state.value.loading = false;
    _readyResolve?.();
  }

  if (import.meta.client) {
    initialize();
  }

  return {
    user,
    isAuthenticated,
    isAdmin,
    isManager,
    loading,
    login,
    loginWithPassword,
    logout,
    handleCallback,
    refreshToken,
    waitUntilReady,
    getAccessToken,
    hasRole,
    canManageDepartment,
    handleUnauthorizedResponse,
  };
}

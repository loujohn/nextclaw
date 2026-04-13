import type { UserView, UserRole } from "../../shared/auth-types";

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
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
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

export function useAuth() {
  const state = useState<AuthState>("auth", () => ({
    user: null,
    loading: true,
    accessToken: null,
  }));

  const tokenCookie = useCookie(ACCESS_TOKEN_COOKIE, {
    maxAge: 3600,
    path: "/",
    sameSite: "lax",
    secure: import.meta.dev ? false : true,
  });

  const config = useRuntimeConfig();
  const keycloakUrl = config.public.keycloakUrl as string;
  const realm = config.public.keycloakRealm as string;
  const clientId = config.public.keycloakClientId as string;

  function setAccessToken(token: string | null): void {
    state.value.accessToken = token;
    tokenCookie.value = token;
  }

  const isAuthenticated = computed(() => !!state.value.user && !!state.value.accessToken);
  const isAdmin = computed(() => state.value.user?.role === "admin");
  const isManager = computed(() => state.value.user?.role === "manager");
  const loading = computed(() => state.value.loading);
  const user = computed(() => state.value.user);

  function getTokenEndpoint(): string {
    return `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
  }

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
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    try {
      const res = await fetch(getTokenEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[auth] Token exchange failed:", res.status, errText);
        return false;
      }

      const data = await res.json();
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
      }>("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });

      if (!res.ok || !res.access_token) {
        return { ok: false, error: "认证失败" };
      }

      setAccessToken(res.access_token);
      await fetchMe();
      if (!state.value.user) {
        return { ok: false, error: "无法获取用户信息" };
      }
      scheduleTokenRefresh(res.expires_in ?? 3600);
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
      sessionStorage.setItem(ID_TOKEN_KEY, data.id_token as string);
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
        const body = new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: rt,
        });

        const res = await fetch(getTokenEndpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });

        if (!res.ok) {
          clearTokens();
          return false;
        }

        const data = await res.json();
        setAccessToken(data.access_token);
        if (data.refresh_token) {
          localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        }

        scheduleTokenRefresh(data.expires_in ?? 300);
        return true;
      } catch {
        clearTokens();
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
    } catch {
      state.value.user = null;
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
    sessionStorage.removeItem(ID_TOKEN_KEY);
    if (_refreshTimer) {
      clearTimeout(_refreshTimer);
      _refreshTimer = null;
    }
    _initStarted = false;
  }

  async function logout(): Promise<void> {
    const redirectUri = `${window.location.origin}/login`;
    const idToken = sessionStorage.getItem(ID_TOKEN_KEY);
    clearTokens();

    if (keycloakUrl && realm) {
      const params = new URLSearchParams({
        post_logout_redirect_uri: redirectUri,
      });
      if (idToken) {
        params.set("id_token_hint", idToken);
      }
      window.location.href = `${getLogoutEndpoint()}?${params}`;
    } else {
      window.location.href = "/login";
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
  };
}

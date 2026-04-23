const LOGIN_PAGE_PATH = "/login";
const INITIAL_LOGIN_MODE = "password";
const LOGIN_MODE_OVERRIDE_KEY = "de_login_mode_override";

export const AUTH_EXEMPT_401_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/token",
]);

export const SESSION_EXPIRED_MESSAGE = "登录已失效，请重新登录";

export type LoginMode = "sso" | "password";

export function useAuthRedirectNotice() {
  return useState<string | null>("auth-redirect-notice", () => null);
}

export function useAuthRedirectingState() {
  return useState<boolean>("auth-redirecting", () => false);
}

function useLoginModeOverrideCookie() {
  return useCookie<LoginMode | null>(LOGIN_MODE_OVERRIDE_KEY, {
    path: "/",
    sameSite: "lax",
    maxAge: 300,
  });
}

export function rememberLoginModeOverride(mode: LoginMode = INITIAL_LOGIN_MODE): void {
  useLoginModeOverrideCookie().value = mode;
}

export function readLoginModeOverride(): LoginMode | null {
  const mode = useLoginModeOverrideCookie().value;
  return mode === "sso" || mode === "password" ? mode : null;
}

export function clearLoginModeOverride(): void {
  useLoginModeOverrideCookie().value = null;
}

export function buildInitialLoginUrl(): string {
  if (!import.meta.client) {
    return LOGIN_PAGE_PATH;
  }

  rememberLoginModeOverride();
  return new URL(LOGIN_PAGE_PATH, window.location.origin).toString();
}

export function getLoginPagePath(): string {
  rememberLoginModeOverride();
  return LOGIN_PAGE_PATH;
}
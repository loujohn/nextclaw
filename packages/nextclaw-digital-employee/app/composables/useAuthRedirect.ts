const LOGIN_PAGE_PATH = "/login";

export const AUTH_EXEMPT_401_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/token",
]);

export const SESSION_EXPIRED_MESSAGE = "登录已失效，请重新登录";

export function useAuthRedirectNotice() {
  return useState<string | null>("auth-redirect-notice", () => null);
}

export function useAuthRedirectingState() {
  return useState<boolean>("auth-redirecting", () => false);
}

export function buildInitialLoginUrl(): string {
  if (!import.meta.client) {
    return LOGIN_PAGE_PATH;
  }

  return new URL(LOGIN_PAGE_PATH, window.location.origin).toString();
}

export function getLoginPagePath(): string {
  return LOGIN_PAGE_PATH;
}
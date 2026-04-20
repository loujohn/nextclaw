function resolveRequestUrl(input: RequestInfo | URL): URL | null {
  if (!import.meta.client) {
    return null;
  }

  try {
    if (typeof input === "string") {
      return new URL(input, window.location.origin);
    }
    if (input instanceof URL) {
      return input;
    }
    return new URL(input.url, window.location.origin);
  } catch {
    return null;
  }
}

function shouldHandleUnauthorized(input: RequestInfo | URL, response: Response): boolean {
  if (!import.meta.client || response.status !== 401) {
    return false;
  }

  const url = resolveRequestUrl(input);
  if (!url || url.origin !== window.location.origin) {
    return false;
  }

  if (!url.pathname.startsWith("/api/")) {
    return false;
  }

  if (AUTH_EXEMPT_401_PATHS.has(url.pathname)) {
    return false;
  }

  return true;
}

export default defineNuxtPlugin((nuxtApp) => {
  const state = globalThis as typeof globalThis & { __deAuthFetchPatched__?: boolean };
  if (state.__deAuthFetchPatched__) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  state.__deAuthFetchPatched__ = true;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    if (shouldHandleUnauthorized(input, response)) {
      void nuxtApp.runWithContext(async () => {
        const { handleUnauthorizedResponse } = useAuth();
        await handleUnauthorizedResponse(SESSION_EXPIRED_MESSAGE);
      });
    }

    return response;
  };
});
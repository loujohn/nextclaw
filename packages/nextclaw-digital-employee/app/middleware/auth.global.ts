const PUBLIC_ROUTES = ["/login", "/auth/callback"];

export default defineNuxtRouteMiddleware(async (to) => {
  if (!import.meta.client) return;

  if (PUBLIC_ROUTES.includes(to.path)) return;

  const { isAuthenticated, loading, waitUntilReady } = useAuth();

  if (loading.value) {
    await waitUntilReady();
  }

  if (!isAuthenticated.value) {
    return navigateTo("/login");
  }
});

type ErrorExtractor = (error: unknown) => string;

const defaultExtractError: ErrorExtractor = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

interface ApiCallOptions {
  extractError?: ErrorExtractor;
  toast?: { composable: ReturnType<typeof useToast>; prefix?: string };
}

export function useApiCall(options?: ApiCallOptions) {
  const loading = ref(false);
  const error = ref<string | null>(null);

  const extractError = options?.extractError ?? defaultExtractError;

  async function execute<T>(fn: () => Promise<T>): Promise<T | undefined> {
    loading.value = true;
    error.value = null;
    try {
      const result = await fn();
      return result;
    } catch (e: unknown) {
      const msg = extractError(e);
      error.value = msg;
      if (options?.toast) {
        const prefix = options.toast.prefix ?? "操作失败";
        options.toast.composable.showToast("error", `${prefix}：${msg}`);
      }
      return undefined;
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    loading.value = false;
    error.value = null;
  }

  return { loading: readonly(loading), error: readonly(error), execute, reset };
}

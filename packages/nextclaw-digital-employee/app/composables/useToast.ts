export type Toast = { id: number; type: "success" | "error"; message: string };

let _toastId = 0;

export function useToast() {
  const toasts = ref<Toast[]>([]);

  function showToast(type: "success" | "error", message: string) {
    const id = ++_toastId;
    toasts.value.push({ id, type, message });
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3500);
  }

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { toasts, showToast, dismissToast };
}

<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";

definePageMeta({ layout: false });

const route = useRoute();
const router = useRouter();
const { handleCallback } = useAuth();

const error = ref<string | null>(null);

onMounted(async () => {
  const errorParam = route.query.error as string | undefined;
  if (errorParam) {
    const desc = (route.query.error_description as string) ?? errorParam;
    error.value = `认证失败：${desc}`;
    return;
  }

  const code = route.query.code as string | undefined;
  const state = route.query.state as string | undefined;

  if (!code || !state) {
    error.value = "缺少认证参数，请重新登录";
    return;
  }

  const success = await handleCallback(code, state);
  if (success) {
    router.replace("/dashboard");
  } else {
    error.value = "登录处理失败，请重试";
  }
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div v-if="error" class="text-center space-y-4">
      <p class="text-destructive text-sm">{{ error }}</p>
      <NuxtLink
        to="/login"
        class="inline-block rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
      >
        返回登录
      </NuxtLink>
    </div>
    <div v-else class="flex flex-col items-center gap-3 text-muted-foreground">
      <Loader2 class="h-8 w-8 animate-spin" />
      <p class="text-sm">正在处理登录...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Zap, ArrowRight, Lock, User, Eye, EyeOff } from "lucide-vue-next";

definePageMeta({ layout: false });

const { login, loginWithPassword, isAuthenticated } = useAuth();
const router = useRouter();
const config = useRuntimeConfig();
const hasSso = !!(config.public.keycloakUrl && config.public.keycloakRealm);

watch(isAuthenticated, (val) => {
  if (val) router.replace("/dashboard");
}, { immediate: true });

const loginMode = ref<"sso" | "password">(hasSso ? "sso" : "password");
const username = ref("");
const password = ref("");
const showPassword = ref(false);
const errorMsg = ref("");
const submitting = ref(false);

async function handlePasswordLogin() {
  if (!username.value || !password.value) {
    errorMsg.value = "请输入用户名和密码";
    return;
  }
  errorMsg.value = "";
  submitting.value = true;
  try {
    const result = await loginWithPassword(username.value, password.value);
    if (!result.ok) {
      errorMsg.value = result.error ?? "登录失败";
    }
  } finally {
    submitting.value = false;
  }
}

const features = [
  { title: "智能执行", desc: "7×24 自动处理日常工作" },
  { title: "多渠道协同", desc: "钉钉、邮件等统一接入" },
  { title: "技能扩展", desc: "可编排的工作技能体系" },
];
</script>

<template>
  <div class="flex min-h-screen">
    <div class="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-12 text-white lg:flex">
      <div>
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-400 shadow-lg">
            <Zap class="h-5 w-5 text-white" :stroke-width="2.2" fill="currentColor" />
          </span>
          <span class="text-xl font-semibold tracking-tight">元工（MetaWorker）</span>
        </div>
        <p class="mt-2 text-sm text-gray-400">智能协作 · 自动执行</p>
      </div>

      <div class="space-y-8">
        <h2 class="text-3xl font-bold leading-tight">
          让数字员工<br />成为你的超级队友
        </h2>
        <div class="space-y-4">
          <div
            v-for="feat in features"
            :key="feat.title"
            class="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur"
          >
            <p class="font-medium">{{ feat.title }}</p>
            <p class="mt-1 text-sm text-gray-400">{{ feat.desc }}</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-500">© {{ new Date().getFullYear() }} MetaWorker. All rights reserved.</p>
    </div>

    <div class="flex flex-1 items-center justify-center bg-background p-8">
      <div class="w-full max-w-sm space-y-8 text-center">
        <div class="lg:hidden flex items-center justify-center gap-3 mb-4">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-400 shadow-lg">
            <Zap class="h-5 w-5 text-white" :stroke-width="2.2" fill="currentColor" />
          </span>
          <span class="text-xl font-semibold">元工</span>
        </div>

        <div>
          <h1 class="text-2xl font-bold text-foreground">欢迎回来</h1>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ loginMode === "sso" ? "使用企业统一身份登录" : "使用账号密码登录" }}
          </p>
        </div>

        <!-- SSO 登录 -->
        <template v-if="hasSso && loginMode === 'sso'">
          <button
            class="group flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
            @click="login"
          >
            统一身份登录
            <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>

          <div class="flex items-center gap-3">
            <div class="h-px flex-1 bg-border"></div>
            <span class="text-xs text-muted-foreground">或</span>
            <div class="h-px flex-1 bg-border"></div>
          </div>

          <button
            class="w-full rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            @click="loginMode = 'password'"
          >
            使用账号密码登录
          </button>
        </template>

        <!-- 密码登录 -->
        <template v-else>
          <form class="space-y-4 text-left" @submit.prevent="handlePasswordLogin">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-foreground">用户名</label>
              <div class="relative">
                <User class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  v-model="username"
                  type="text"
                  autocomplete="username"
                  class="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
                  placeholder="请输入用户名"
                />
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium text-foreground">密码</label>
              <div class="relative">
                <Lock class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  class="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
                  placeholder="请输入密码"
                  @keyup.enter="handlePasswordLogin"
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div v-if="errorMsg" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {{ errorMsg }}
            </div>

            <button
              type="submit"
              :disabled="submitting"
              class="group flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {{ submitting ? "登录中..." : "登录" }}
              <ArrowRight v-if="!submitting" class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          <template v-if="hasSso">
            <div class="flex items-center gap-3">
              <div class="h-px flex-1 bg-border"></div>
              <span class="text-xs text-muted-foreground">或</span>
              <div class="h-px flex-1 bg-border"></div>
            </div>

            <button
              class="w-full rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              @click="loginMode = 'sso'"
            >
              使用企业统一身份登录
            </button>
          </template>
        </template>

        <p class="text-xs text-muted-foreground">
          点击登录即表示你同意我们的使用条款
        </p>
      </div>
    </div>
  </div>
</template>

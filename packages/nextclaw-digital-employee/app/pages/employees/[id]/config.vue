<script setup lang="ts">
import { Bot } from "lucide-vue-next";

const route = useRoute();
const employeeId = computed(() => String(route.params.id));

const { data: dingtalkConfig, refresh: refreshDingTalkConfig } = useLazyFetch<{
  ok: boolean;
  data: {
    channel: {
      enabled: boolean;
      defaultAccountId: string;
      accounts: Array<{ accountId: string }>;
    };
  };
}>("/api/integrations/dingtalk");

const { data: dingtalkBinding, refresh: refreshDingTalkBinding } = useLazyFetch<{
  ok: boolean;
  data: {
    employeeCode: string;
    directAccountIds: string[];
    groupBindings: Array<{
      groupId: string;
      accountId: string;
      allowCollaboration: boolean;
      allowedEmployeeCodes: string[];
    }>;
  };
}>(() => `/api/employees/${employeeId.value}/dingtalk-binding`);

const dingtalkForm = reactive({
  directAccountIds: [] as string[]
});

watchEffect(() => {
  dingtalkForm.directAccountIds = [...(dingtalkBinding.value?.data.directAccountIds ?? [])];
});

async function saveDingTalkBinding() {
  await $fetch(`/api/employees/${employeeId.value}/dingtalk-binding`, {
    method: "PUT",
    body: {
      directAccountIds: dingtalkForm.directAccountIds,
      groupBindings: dingtalkBinding.value?.data.groupBindings ?? []
    }
  });
  await Promise.all([refreshDingTalkBinding(), refreshDingTalkConfig()]);
}

const configTab = ref<"dingtalk" | "workspace">("dingtalk");
</script>

<template>
  <div class="space-y-4">
    <nav class="flex gap-2">
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="configTab === 'dingtalk' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="configTab = 'dingtalk'"
      >钉钉入口</button>
      <button
        class="rounded-full px-4 py-2 text-sm font-medium transition-colors"
        :class="configTab === 'workspace' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'"
        @click="configTab = 'workspace'"
      >工作空间</button>
    </nav>

    <template v-if="configTab === 'dingtalk'">
      <section v-if="dingtalkConfig?.data && dingtalkBinding?.data" class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div class="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <span class="section-label">钉钉入口</span>
            <h2 class="mt-0.5 text-base font-semibold">私聊绑定与群入口</h2>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold"
            :class="dingtalkConfig.data.channel.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
          >
            {{ dingtalkConfig.data.channel.enabled ? "已启用" : "未启用" }}
          </span>
        </div>

        <div class="grid gap-5 p-5 lg:grid-cols-[320px_1fr]">
          <form class="space-y-3 rounded-xl border border-border bg-muted/30 p-4" @submit.prevent="saveDingTalkBinding">
            <div class="flex items-center gap-2 text-sm font-medium">
              <Bot class="h-4 w-4" :stroke-width="1.8" />
              默认私聊入口
            </div>
            <p class="text-xs text-muted-foreground">可同时勾选多个账号；这些机器人私聊都会默认交给该员工。</p>

            <div class="space-y-2 rounded-lg border border-border bg-background/80 p-3">
              <label
                v-for="account in dingtalkConfig.data.channel.accounts"
                :key="account.accountId"
                class="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input v-model="dingtalkForm.directAccountIds" type="checkbox" :value="account.accountId" class="h-4 w-4 rounded accent-primary" />
                <span>{{ account.accountId }}</span>
              </label>
              <p v-if="dingtalkConfig.data.channel.accounts.length === 0" class="text-xs text-muted-foreground">
                还没有可用账号，请先在集成中心配置钉钉机器人。
              </p>
            </div>

            <button class="btn-primary" type="submit">保存钉钉绑定</button>
          </form>

          <div class="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div>
              <span class="section-label">已接管群</span>
              <h3 class="mt-0.5 text-sm font-semibold">当前群入口状态</h3>
            </div>

            <div v-if="dingtalkBinding.data.groupBindings.length === 0" class="rounded-lg bg-background/80 px-4 py-3 text-sm text-muted-foreground">
              当前还没有群绑定到这个员工。可在集成中心的“群路由”里指定。
            </div>

            <div
              v-for="group in dingtalkBinding.data.groupBindings"
              :key="group.groupId"
              class="rounded-lg border border-border bg-background/80 p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold">{{ group.groupId }}</p>
                  <p class="text-xs text-muted-foreground">入口账号：{{ group.accountId }}</p>
                </div>
                <span
                  class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  :class="group.allowCollaboration ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
                >
                  {{ group.allowCollaboration ? "允许后台协作" : "单员工直出" }}
                </span>
              </div>
              <p class="mt-1.5 text-xs text-muted-foreground">
                协作者：{{ group.allowedEmployeeCodes.length > 0 ? group.allowedEmployeeCodes.join("、") : "未配置" }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div v-else class="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
        钉钉渠道未配置，请先在集成中心启用钉钉机器人。
      </div>
    </template>

    <EmployeeWorkspacePanel v-else :employee-id="employeeId" />
  </div>
</template>

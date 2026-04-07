<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";
import type { EditableDingTalkGroupBinding } from "~~/shared/dingtalk-editor-model";

interface EditableAccount {
  sourceAccountId: string;
  accountId: string;
  clientId: string;
  clientSecret: string;
  clientSecretSet: boolean;
  robotCode: string;
  corpId: string;
  agentId: string;
  allowFrom: string[];
  dmPolicy: string;
  groupPolicy: string;
  groupAllowFrom: string[];
  requireMention: boolean;
  mentionPatterns: string[];
  groups: Record<string, { requireMention: boolean; mentionPatterns: string[] }>;
}

interface DingTalkFormState {
  enabled: boolean;
  defaultAccountId: string;
  accounts: EditableAccount[];
  deletedAccountIds: string[];
  defaultByAccount: Record<string, string>;
  groups: EditableDingTalkGroupBinding[];
}

const props = defineProps<{
  form: DingTalkFormState;
  employees: Array<{ id: string; name: string; code: string }>;
  loading: boolean;
  saving: boolean;
  error: string;
}>();

const emit = defineEmits<{
  save: [];
  close: [];
  addAccount: [];
  removeAccount: [index: number];
  addGroup: [];
  removeGroup: [index: number];
}>();

const accountOptions = computed(() =>
  props.form.accounts.map((a) => a.accountId.trim()).filter(Boolean)
);
</script>

<template>
  <form class="space-y-6 p-6" @submit.prevent="emit('save')">
    <div v-if="loading" class="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
      正在加载钉钉配置...
    </div>

    <template v-else>
      <label class="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
        <div>
          <p class="text-sm font-medium">启用钉钉入口</p>
          <p class="text-xs text-muted-foreground">关闭后，所有钉钉私聊与群入口都会停止响应。</p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          :class="form.enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
          @click="form.enabled = !form.enabled"
        >
          <span
            class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
            :class="form.enabled ? 'translate-x-5' : 'translate-x-1'"
          />
        </button>
      </label>

      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="section-label">机器人账号</span>
            <h3 class="mt-0.5 text-base font-semibold">多账号入口</h3>
          </div>
          <button type="button" class="btn-ghost" @click="emit('addAccount')">
            <Plus class="h-4 w-4" :stroke-width="1.8" />
            新增账号
          </button>
        </div>

        <div v-if="form.accounts.length === 0" class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
          还没有钉钉机器人账号。先添加一个账号，员工才能通过钉钉私聊或群入口被唤起。
        </div>

        <article v-for="(account, index) in form.accounts" :key="`${account.sourceAccountId}:${index}`" class="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <span class="section-label">账号 {{ index + 1 }}</span>
              <div class="flex items-center gap-3">
                <label class="flex items-center gap-2 text-sm">
                  <input v-model="form.defaultAccountId" type="radio" :value="account.accountId" />
                  默认入口
                </label>
                <span class="text-xs text-muted-foreground">员工页可把此账号绑定成默认私聊入口</span>
              </div>
            </div>
            <button type="button" class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive" @click="emit('removeAccount', index)">
              <Trash2 class="h-4 w-4" :stroke-width="1.8" />
            </button>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">Account ID</span>
              <input v-model="account.accountId" class="input-field" placeholder="ops-bot" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">Client ID</span>
              <input v-model="account.clientId" class="input-field" placeholder="请输入 DingTalk Client ID" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">Client Secret</span>
              <input v-model="account.clientSecret" type="password" class="input-field" placeholder="留空保持不变" />
              <p class="text-[11px] text-muted-foreground">
                <span v-if="account.clientSecretSet">当前已设置密钥，留空不会覆盖。</span>
                <span v-else>当前未设置密钥。</span>
              </p>
            </label>
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">Robot Code</span>
              <input v-model="account.robotCode" class="input-field" placeholder="机器人编码" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">Corp ID</span>
              <input v-model="account.corpId" class="input-field" placeholder="企业 Corp ID" />
            </label>
            <label class="block space-y-1.5">
              <span class="text-sm font-medium">Agent ID</span>
              <input v-model="account.agentId" class="input-field" placeholder="应用 Agent ID" />
            </label>
          </div>
        </article>
      </section>

      <section class="space-y-4 rounded-xl border border-border bg-muted/10 p-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="section-label">群路由</span>
            <h3 class="mt-0.5 text-base font-semibold">群到员工的入口映射</h3>
          </div>
          <button type="button" class="btn-ghost" @click="emit('addGroup')">
            <Plus class="h-4 w-4" :stroke-width="1.8" />
            新增群绑定
          </button>
        </div>

        <div v-if="form.groups.length === 0" class="rounded-lg bg-background/80 px-4 py-4 text-sm text-muted-foreground">
          还没有群路由。配置后，可为每个群单独控制是否必须 @ 机器人，以及由哪个员工对外响应。
        </div>

        <div v-for="(group, index) in form.groups" :key="`${group.groupId}:${index}`" class="grid gap-3 rounded-lg border border-border bg-background/80 p-4 md:grid-cols-2">
          <label class="block space-y-1.5">
            <span class="text-sm font-medium">Group ID</span>
            <input v-model="group.groupId" class="input-field" placeholder="cid_xxx" />
          </label>
          <label class="block space-y-1.5">
            <span class="text-sm font-medium">入口账号</span>
            <select v-model="group.accountId" class="input-field">
              <option value="">请选择账号</option>
              <option v-for="accountId in accountOptions" :key="accountId" :value="accountId">{{ accountId }}</option>
            </select>
          </label>
          <label class="block space-y-1.5">
            <span class="text-sm font-medium">主响应员工</span>
            <select v-model="group.employeeCode" class="input-field">
              <option value="">请选择员工</option>
              <option v-for="employee in employees" :key="employee.id" :value="employee.code">{{ employee.name }} · {{ employee.code }}</option>
            </select>
          </label>
          <label class="block space-y-1.5">
            <span class="text-sm font-medium">允许后台协作员工</span>
            <input v-model="group.allowedEmployeeCodesText" class="input-field" placeholder="risk-bot, daily-bot" />
          </label>
          <label class="col-span-full flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input v-model="group.requireMention" type="checkbox" />
            该群消息必须 @ 机器人后才处理；关闭后，不 @ 也会进入员工链路
          </label>
          <label class="col-span-full block space-y-1.5">
            <span class="text-sm font-medium">@ 识别关键词</span>
            <input
              v-model="group.mentionPatternsText"
              class="input-field"
              :disabled="!group.requireMention"
              placeholder="机器人, 日报员工"
            />
            <p class="text-xs text-muted-foreground">
              用逗号分隔。仅当"必须 @"开启时生效；关闭后可留空。
            </p>
          </label>
          <label class="col-span-full flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input v-model="group.allowCollaboration" type="checkbox" />
            允许该群入口员工在后台委托其他员工协作，但仍由入口员工统一对外回复
          </label>
          <div class="col-span-full flex justify-end">
            <button type="button" class="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive" @click="emit('removeGroup', index)">
              删除群绑定
            </button>
          </div>
        </div>
      </section>

      <p v-if="error" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>

      <div class="flex items-center justify-between gap-2 border-t border-border pt-4">
        <button type="button" class="btn-ghost" @click="emit('close')">取消</button>
        <button class="btn-primary" :disabled="saving">
          {{ saving ? "保存中..." : "保存钉钉配置" }}
        </button>
      </div>
    </template>
  </form>
</template>

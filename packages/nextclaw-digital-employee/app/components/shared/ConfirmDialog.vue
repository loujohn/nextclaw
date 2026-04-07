<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  error?: string;
  confirming?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-foreground/35" @click="emit('cancel')" />
        <div class="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <p class="mt-2 text-sm text-muted-foreground">
            <slot>{{ message }}</slot>
          </p>
          <p v-if="error" class="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{{ error }}</p>
          <div class="mt-5 flex items-center justify-end gap-2">
            <button class="btn-ghost" :disabled="confirming" @click="emit('cancel')">取消</button>
            <button class="btn-ghost text-destructive hover:bg-destructive/10" :disabled="confirming" @click="emit('confirm')">
              {{ confirming ? (confirmingLabel ?? '处理中...') : (confirmLabel ?? '确认') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { CheckCircle, AlertCircle, X } from "lucide-vue-next";

defineProps<{
  toasts: Array<{ id: number; type: "success" | "error"; message: string }>;
}>();

const emit = defineEmits<{
  dismiss: [id: number];
}>();
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-0 inset-x-0 z-[60] flex flex-col items-center gap-2 pt-5 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm min-w-[260px] max-w-sm"
          :class="toast.type === 'success' ? 'bg-card border-primary/20 text-foreground' : 'bg-card border-destructive/20 text-foreground'"
        >
          <CheckCircle v-if="toast.type === 'success'" class="h-4 w-4 shrink-0 text-primary" :stroke-width="2" />
          <AlertCircle v-else class="h-4 w-4 shrink-0 text-destructive" :stroke-width="2" />
          <p class="flex-1 text-sm">{{ toast.message }}</p>
          <button class="text-muted-foreground hover:text-foreground" @click="emit('dismiss', toast.id)">
            <X class="h-3.5 w-3.5" :stroke-width="2" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

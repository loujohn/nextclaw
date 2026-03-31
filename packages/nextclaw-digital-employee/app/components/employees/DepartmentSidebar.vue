<script setup lang="ts">
/**
 * Department tree sidebar for the employee page.
 * Thin wrapper component to be used in the employee list page.
 * The full sidebar rendering logic remains in pages/employees/index.vue
 * and will be migrated incrementally.
 */
defineProps<{
  selectedDeptId: string | null;
}>();

defineEmits<{
  "select-dept": [id: string | null];
  "select-overview": [];
}>();
</script>

<template>
  <aside class="department-sidebar">
    <slot />
  </aside>
</template>

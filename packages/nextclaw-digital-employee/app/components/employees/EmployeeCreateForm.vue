<script setup lang="ts">
/**
 * Employee creation form (slide-over panel).
 * Currently a thin wrapper component; the full creation form rendering logic
 * remains in pages/employees/index.vue and will be migrated incrementally.
 *
 * The full extraction is planned for v0.16 (EmployeeCreateWizard).
 */
defineProps<{
  visible: boolean;
}>();

defineEmits<{
  close: [];
  created: [employeeId: string];
}>();
</script>

<template>
  <slot />
</template>

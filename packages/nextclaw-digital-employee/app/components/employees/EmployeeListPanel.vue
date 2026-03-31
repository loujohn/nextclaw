<script setup lang="ts">
/**
 * Employee list panel — wraps search + EmployeeCard grid.
 * Currently a thin wrapper; the full list rendering logic remains in pages/employees/index.vue
 * and will be migrated incrementally.
 */
import { Search, Plus, Sparkles } from "lucide-vue-next";
import type { EmployeeResponse } from "~/composables/useEmployeeList";

defineProps<{
  employees: EmployeeResponse[];
  searchQuery: string;
  selectedDeptName: string;
}>();

defineEmits<{
  "update:searchQuery": [value: string];
  create: [];
  navigate: [employeeId: string];
  edit: [employee: EmployeeResponse];
  delete: [employee: EmployeeResponse];
}>();
</script>

<template>
  <div class="employee-list-view">
    <slot />
  </div>
</template>

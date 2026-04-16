<script setup lang="ts">
const route = useRoute();
const employeeId = computed(() => String(route.params.id));
const initialRelativePath = computed(() => typeof route.query.path === "string" ? route.query.path : null);
</script>

<template>
  <EmployeeWorkspacePanel :employee-id="employeeId" :initial-relative-path="initialRelativePath" />
</template>

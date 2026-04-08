import { defineStore } from "pinia";
import type { EmployeeResponse, EmployeeListPayload } from "~/composables/useEmployeeList";

export const useEmployeesStore = defineStore("employees", () => {
  const { data, pending, refresh } = useAsyncData<EmployeeListPayload | null>(
    "store-employees",
    async () => await $fetch<EmployeeListPayload>("/api/employees"),
    {
      default: () => null,
    }
  );

  const list = computed<EmployeeResponse[]>(() => data.value?.data ?? []);
  const nameMap = computed(() => new Map(list.value.map((e) => [e.id, e.name])));

  return { data, list, nameMap, pending, refresh };
});

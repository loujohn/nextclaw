import { defineStore } from "pinia";
import type { EmployeeResponse, EmployeeListPayload } from "~/composables/useEmployeeList";

export const useEmployeesStore = defineStore("employees", () => {
  const { data, refresh, pending } = useLazyFetch<EmployeeListPayload>("/api/employees", {
    key: "store-employees",
    getCachedData: (k) => useNuxtData<EmployeeListPayload>(k).data.value ?? undefined,
  });

  const list = computed<EmployeeResponse[]>(() => data.value?.data ?? []);
  const nameMap = computed(() => new Map(list.value.map((e) => [e.id, e.name])));

  return { data, list, nameMap, pending, refresh };
});

import { defineStore } from "pinia";
import type { DepartmentView } from "~~/shared/department-types";

type DepartmentPayload = { ok: boolean; data: DepartmentView[] };

export const useDepartmentsStore = defineStore("departments", () => {
  const { data, refresh, pending } = useLazyFetch<DepartmentPayload>("/api/departments", {
    key: "store-departments",
    getCachedData: (k) => useNuxtData<DepartmentPayload>(k).data.value ?? undefined,
  });

  const list = computed<DepartmentView[]>(() => data.value?.data ?? []);
  const nameMap = computed(() => new Map(list.value.map((d) => [d.id, d.name])));

  return { data, list, nameMap, pending, refresh };
});

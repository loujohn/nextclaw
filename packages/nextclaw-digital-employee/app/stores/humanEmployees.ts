import { defineStore } from "pinia";
import type { HumanEmployeeApiItem } from "~/composables/useDepartmentTree";

type HumanEmployeePayload = { ok: boolean; data: HumanEmployeeApiItem[] };

export const useHumanEmployeesStore = defineStore("humanEmployees", () => {
  const { data, refresh, pending } = useLazyFetch<HumanEmployeePayload>("/api/org/human-employees", {
    key: "store-human-employees",
  });

  const list = computed<HumanEmployeeApiItem[]>(() => data.value?.data ?? []);

  return { data, list, pending, refresh };
});

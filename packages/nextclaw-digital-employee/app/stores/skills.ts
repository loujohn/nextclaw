import { defineStore } from "pinia";
import type { SkillCatalogEntryView } from "~~/shared/ui-models";

type SkillPayload = { ok: boolean; data: SkillCatalogEntryView[] };

export const useSkillsStore = defineStore("skills", () => {
  const { data, refresh, pending } = useLazyFetch<SkillPayload>("/api/skills", {
    key: "store-skills",
    getCachedData: (k) => useNuxtData<SkillPayload>(k).data.value ?? undefined,
  });

  const list = computed<SkillCatalogEntryView[]>(() => data.value?.data ?? []);
  const displayNameMap = computed(() => {
    const m = new Map<string, string>();
    for (const s of list.value) m.set(s.name, s.nameZh ?? s.name);
    return m;
  });

  return { data, list, displayNameMap, pending, refresh };
});

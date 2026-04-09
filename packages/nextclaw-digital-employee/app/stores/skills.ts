import { defineStore } from "pinia";
import type { SkillCatalogEntryView } from "~~/shared/ui-models";

type SkillPayload = { ok: boolean; data: SkillCatalogEntryView[] };

export const useSkillsStore = defineStore("skills", () => {
  const { data, refresh, pending } = useLazyFetch<SkillPayload>("/api/skills", {
    key: "store-skills",
  });

  const list = computed<SkillCatalogEntryView[]>(() => data.value?.data ?? []);
  const displayNameMap = computed(() => {
    const m = new Map<string, string>();
    for (const s of list.value) m.set(s.name, s.nameZh ?? s.name);
    return m;
  });

  async function toggleSkill(name: string, enabled: boolean) {
    await $fetch(`/api/skills/${name}/state`, { method: "PATCH", body: { enabled } });
    await refresh();
  }

  return { data, list, displayNameMap, pending, refresh, toggleSkill };
});

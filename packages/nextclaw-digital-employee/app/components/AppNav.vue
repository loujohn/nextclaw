<script setup lang="ts">
const route = useRoute();

const items = [
  { label: "工作台", to: "/", icon: "home" as const },
  { label: "员工中心", to: "/employees", icon: "employees" as const },
  { label: "技能中心", to: "/skills", icon: "skills" as const },
  { label: "运行中心", to: "/runs", icon: "runs" as const },
  { label: "集成中心", to: "/integrations", icon: "integrations" as const }
];

function isActive(path: string): boolean {
  return path === "/" ? route.path === path : route.path.startsWith(path);
}
</script>

<template>
  <aside class="app-sidebar">
    <NuxtLink class="brand-mark" to="/">
      <span class="brand-chip">NC</span>
      <span>
        <strong>数字员工平台</strong>
        <small>NextClaw Digital Employee</small>
      </span>
    </NuxtLink>

    <div class="app-sidebar-copy">
      <p class="eyebrow">Operations</p>
      <p>围绕员工、自动任务、结果和通知的统一运营台。</p>
    </div>

    <nav class="app-nav">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="nav-link"
        :class="{ active: isActive(item.to) }"
      >
        <AppIcon :name="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="app-sidebar-panel">
      <p class="eyebrow">AI Workbench</p>
      <strong>把聊天、自动运行和业务结果放到同一个界面里。</strong>
    </div>
  </aside>

  <nav class="app-nav-mobile">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="nav-link mobile"
      :class="{ active: isActive(item.to) }"
    >
      <AppIcon :name="item.icon" :size="18" />
      <span>{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

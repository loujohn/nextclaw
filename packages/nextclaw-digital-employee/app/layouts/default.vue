<script setup lang="ts">
import {
  Home,
  Users,
  Blocks,
  Plug,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  Settings,
  ShieldCheck,
  LogOut,
  UserCog,
  type LucideIcon,
} from "lucide-vue-next";

const route = useRoute();
const collapsed = ref(false);
const { user, logout } = useAuth();

type NavItem = { label: string; to: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { label: "组织架构", to: "/employees", icon: Users },
  { label: "工作中心", to: "/dashboard", icon: Home },
  { label: "技能中心", to: "/skills", icon: Blocks },
  { label: "集成中心", to: "/integrations", icon: Plug },
  { label: "安全中心", to: "/security", icon: ShieldCheck },
  { label: "用户管理", to: "/users", icon: UserCog },
];

const visibleNavItems = computed(() =>
  navItems.filter((item) => item.to !== "/users" || user.value?.role === "admin")
);

function isActive(path: string): boolean {
  return path === "/" ? route.path === path : route.path.startsWith(path);
}
</script>

<template>
  <div class="flex min-h-screen">
    <aside
      class="sidebar-glass sticky top-0 z-30 hidden h-screen flex-col text-sidebar-foreground transition-all duration-300 ease-out lg:flex"
      :class="collapsed ? 'w-[68px]' : 'w-[240px]'"
    >
      <div class="flex items-center gap-3 px-4 pt-5 pb-6" :class="collapsed && 'justify-center px-0'">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-emerald-400 shadow-lg shadow-primary/20">
          <Zap class="h-4.5 w-4.5 text-white" :stroke-width="2.2" fill="currentColor" />
        </span>
        <div v-if="!collapsed" class="min-w-0">
          <p class="truncate text-sm font-semibold leading-tight text-sidebar-foreground">元工（MetaWorker）</p>
          <p class="truncate text-[11px] text-sidebar-muted">智能协作 · 自动执行</p>
        </div>
      </div>

      <nav class="flex flex-1 flex-col gap-0.5 px-3 py-1">
        <NuxtLink
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
          class="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-sidebar-muted transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          :class="[
            isActive(item.to) && 'bg-sidebar-accent text-white font-medium shadow-sm',
            collapsed && 'justify-center px-0'
          ]"
        >
          <span
            v-if="isActive(item.to)"
            class="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
            :class="collapsed && 'left-0.5'"
          />
          <component :is="item.icon" class="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105" :stroke-width="1.8" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="mt-auto space-y-0.5 border-t border-sidebar-border px-3 py-3">
        <div v-if="user" class="flex items-center gap-3 rounded-lg px-3 py-2" :class="collapsed && 'justify-center px-0'">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {{ user.displayName?.charAt(0) ?? '?' }}
          </div>
          <div v-if="!collapsed" class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-sidebar-foreground">{{ user.displayName }}</p>
            <p class="truncate text-[11px] text-sidebar-muted">{{ user.username }}</p>
          </div>
        </div>
        <NuxtLink
          to="/integrations"
          class="group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-sidebar-muted transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          :class="collapsed && 'justify-center px-0'"
        >
          <Settings class="h-[18px] w-[18px] shrink-0" :stroke-width="1.8" />
          <span v-if="!collapsed">设置</span>
        </NuxtLink>
        <button
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-sidebar-muted transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          :class="collapsed && 'justify-center px-0'"
          @click="logout"
        >
          <LogOut class="h-[18px] w-[18px] shrink-0" :stroke-width="1.8" />
          <span v-if="!collapsed">退出登录</span>
        </button>
        <button
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-sidebar-muted transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          :class="collapsed && 'justify-center px-0'"
          @click="collapsed = !collapsed"
        >
          <PanelLeftClose v-if="!collapsed" class="h-[18px] w-[18px] shrink-0" :stroke-width="1.8" />
          <PanelLeftOpen v-else class="h-[18px] w-[18px] shrink-0" :stroke-width="1.8" />
          <span v-if="!collapsed">{{ collapsed ? '展开' : '收起' }}</span>
        </button>
      </div>
    </aside>

    <nav class="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-background/80 px-2 pb-safe backdrop-blur-xl lg:hidden">
      <NuxtLink
        v-for="item in visibleNavItems"
        :key="item.to"
        :to="item.to"
        class="relative flex flex-col items-center gap-1 px-3 py-2.5 text-xs text-muted-foreground transition-colors"
        :class="isActive(item.to) && 'text-primary font-medium'"
      >
        <span
          v-if="isActive(item.to)"
          class="absolute -top-px left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary"
        />
        <component :is="item.icon" class="h-5 w-5" :stroke-width="1.8" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <main class="flex-1 min-w-0 pb-20 lg:pb-0">
      <slot />
    </main>
  </div>
</template>

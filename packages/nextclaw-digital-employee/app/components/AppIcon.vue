<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name:
      | "home"
      | "employees"
      | "skills"
      | "runs"
      | "integrations"
      | "chat"
      | "spark"
      | "clock"
      | "warning"
      | "report";
    size?: number;
  }>(),
  {
    size: 20
  }
);

const iconPath = computed(() => {
  switch (props.name) {
    case "home":
      return "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z";
    case "employees":
      return "M7.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m9 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M3 19.5a4.5 4.5 0 0 1 9 0M14 19.5a3.5 3.5 0 0 1 7 0";
    case "skills":
      return "M12 3 4 7v6l8 4 8-4V7zm0 0v14m-8-4 8-4 8 4";
    case "runs":
      return "M12 5v7l4 2m4-2a8 8 0 1 1-16 0 8 8 0 0 1 16 0";
    case "integrations":
      return "M7 7h4V3h2v4h4v2h-4v4h-2V9H7zm-2 8h14v4H5z";
    case "chat":
      return "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z";
    case "spark":
      return "M12 2.5 13.7 7l4.8 1.3-4.8 1.3L12 14l-1.7-4.4L5.5 8.3 10.3 7z";
    case "clock":
      return "M12 5v7l4 2m4-2a8 8 0 1 1-16 0 8 8 0 0 1 16 0";
    case "warning":
      return "M12 4 3.5 19h17zM12 9v4m0 3h.01";
    case "report":
      return "M6 3.5h8l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm8 0V8h4M9 12h6M9 16h6";
    default:
      return "M4 4h16v16H4z";
  }
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="iconPath" />
  </svg>
</template>

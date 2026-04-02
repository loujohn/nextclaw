export const SKILL_CATEGORIES = [
  { slug: "project-management", label: "项目管理类", emoji: "📋" },
  { slug: "business-management", label: "经营管理类", emoji: "📈" },
  { slug: "product-rd", label: "产品研发类", emoji: "🔬" },
  { slug: "marketing", label: "市场营销类", emoji: "📣" },
  { slug: "solutions", label: "解决方案类", emoji: "💡" },
  { slug: "general", label: "通用能力类", emoji: "⚡" },
] as const;

export type SkillCategorySlug = (typeof SKILL_CATEGORIES)[number]["slug"];

export const SKILL_CATEGORY_SLUG_TO_LABEL: Record<string, string> = Object.fromEntries(
  SKILL_CATEGORIES.map((cat) => [cat.slug, cat.label])
);

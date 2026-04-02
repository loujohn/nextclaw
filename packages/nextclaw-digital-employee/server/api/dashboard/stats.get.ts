import { getPlatformContext } from "../../runtime/platform-context";
import { SKILL_CATEGORIES } from "../../../shared/skill-categories";

export default defineEventHandler(async () => {
  const ctx = await getPlatformContext();
  const [todayStats, totalCounts, availableSkills] = await Promise.all([
    ctx.runRepo.getTodayStats(),
    ctx.runRepo.getTotalCountByEmployee(),
    ctx.gateway.listAvailableSkills(),
  ]);

  const todayRunCount = todayStats.reduce((sum, s) => sum + s.total, 0);
  const todaySuccessCount = todayStats.reduce((sum, s) => sum + s.succeeded, 0);
  const todaySuccessRate = todayRunCount > 0 ? Math.round((todaySuccessCount / todayRunCount) * 100) : 100;

  const totalCountMap = new Map(totalCounts.map((c) => [c.employeeId, c.total]));
  const todayStatsMap = new Map(todayStats.map((s) => [s.employeeId, s]));

  const allEmployeeIds = new Set([...totalCountMap.keys(), ...todayStatsMap.keys()]);
  const employeeStats = [...allEmployeeIds].map((employeeId) => {
    const stat = todayStatsMap.get(employeeId);
    return {
      employeeId,
      todayRunCount: stat?.total ?? 0,
      totalRunCount: totalCountMap.get(employeeId) ?? 0,
      todaySuccessRate: (() => {
        if (!stat || stat.total === 0) return 100;
        return Math.round((stat.succeeded / stat.total) * 100);
      })(),
    };
  });

  const categoryCounts = new Map<string, number>();
  for (const skill of availableSkills) {
    const cat = skill.category || "general";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  const skillCategoryCounts = SKILL_CATEGORIES.map((cat) => ({
    category: cat.slug,
    categoryLabel: cat.label,
    emoji: cat.emoji,
    count: categoryCounts.get(cat.slug) ?? 0,
  }));

  return {
    ok: true,
    data: {
      todayRunCount,
      todaySuccessRate,
      totalSkillCount: availableSkills.length,
      employeeStats,
      skillCategoryCounts,
    },
  };
});

import { describe, expect, it } from "vitest";
import {
  buildCronExpr,
  parseCronToVisual,
  cronHumanLabel,
  everyMsHumanLabel,
  validateCronVisual
} from "../shared/cron-utils";

// ─────────────────────────────────────────────────────────────────────────────
// buildCronExpr
// ─────────────────────────────────────────────────────────────────────────────
describe("buildCronExpr", () => {
  // daily
  it("每天 09:00 → '0 9 * * *'", () => {
    expect(buildCronExpr("daily", { time: "09:00" })).toBe("0 9 * * *");
  });

  it("每天 18:30 → '30 18 * * *'", () => {
    expect(buildCronExpr("daily", { time: "18:30" })).toBe("30 18 * * *");
  });

  it("每天 00:00 → '0 0 * * *'", () => {
    expect(buildCronExpr("daily", { time: "00:00" })).toBe("0 0 * * *");
  });

  it("每天 23:59 → '59 23 * * *'", () => {
    expect(buildCronExpr("daily", { time: "23:59" })).toBe("59 23 * * *");
  });

  // weekly
  it("每周周一 09:00 → '0 9 * * 1'", () => {
    expect(buildCronExpr("weekly", { time: "09:00", weekday: "1" })).toBe("0 9 * * 1");
  });

  it("每周周日 08:00 → '0 8 * * 0'", () => {
    expect(buildCronExpr("weekly", { time: "08:00", weekday: "0" })).toBe("0 8 * * 0");
  });

  it("每周周六 10:15 → '15 10 * * 6'", () => {
    expect(buildCronExpr("weekly", { time: "10:15", weekday: "6" })).toBe("15 10 * * 6");
  });

  // monthly
  it("每月1日 09:00 → '0 9 1 * *'", () => {
    expect(buildCronExpr("monthly", { time: "09:00", dayOfMonth: "1" })).toBe("0 9 1 * *");
  });

  it("每月15日 12:00 → '0 12 15 * *'", () => {
    expect(buildCronExpr("monthly", { time: "12:00", dayOfMonth: "15" })).toBe("0 12 15 * *");
  });

  it("每月31日 23:00 → '0 23 31 * *'", () => {
    expect(buildCronExpr("monthly", { time: "23:00", dayOfMonth: "31" })).toBe("0 23 31 * *");
  });

  // none (一次性)
  it("不重复 2026-03-24 09:00 → '0 9 24 3 *'", () => {
    expect(buildCronExpr("none", { time: "09:00", date: "2026-03-24" })).toBe("0 9 24 3 *");
  });

  it("不重复 2026-12-01 00:30 → '30 0 1 12 *'", () => {
    expect(buildCronExpr("none", { time: "00:30", date: "2026-12-01" })).toBe("30 0 1 12 *");
  });

  it("不重复但无 date → 降级为每天", () => {
    expect(buildCronExpr("none", { time: "09:00" })).toBe("0 9 * * *");
  });

  // edge: hour/min clamping
  it("超出范围小时 clamp → 23", () => {
    // time "25:00" → h clamped to 23
    expect(buildCronExpr("daily", { time: "25:00" })).toBe("0 23 * * *");
  });

  it("超出范围分钟 clamp → 59", () => {
    expect(buildCronExpr("daily", { time: "09:99" })).toBe("59 9 * * *");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCronToVisual
// ─────────────────────────────────────────────────────────────────────────────
describe("parseCronToVisual", () => {
  it("每天 09:00 → daily, 09:00, visual", () => {
    const r = parseCronToVisual("0 9 * * *");
    expect(r).toMatchObject({ repeatType: "daily", time: "09:00", mode: "visual" });
  });

  it("每天 18:30 → daily, 18:30", () => {
    const r = parseCronToVisual("30 18 * * *");
    expect(r).toMatchObject({ repeatType: "daily", time: "18:30", mode: "visual" });
  });

  it("每周周一 → weekly, weekday '1'", () => {
    const r = parseCronToVisual("0 9 * * 1");
    expect(r).toMatchObject({ repeatType: "weekly", weekday: "1", time: "09:00", mode: "visual" });
  });

  it("每周周日 → weekly, weekday '0'", () => {
    const r = parseCronToVisual("0 8 * * 0");
    expect(r).toMatchObject({ repeatType: "weekly", weekday: "0", time: "08:00", mode: "visual" });
  });

  it("每月1日 → monthly, dayOfMonth '1'", () => {
    const r = parseCronToVisual("0 9 1 * *");
    expect(r).toMatchObject({ repeatType: "monthly", dayOfMonth: "1", time: "09:00", mode: "visual" });
  });

  it("每月15日 → monthly, dayOfMonth '15'", () => {
    const r = parseCronToVisual("0 9 15 * *");
    expect(r).toMatchObject({ repeatType: "monthly", dayOfMonth: "15", mode: "visual" });
  });

  it("不重复 2026-03-24 → none, date 2026-03-24", () => {
    const r = parseCronToVisual("0 9 24 3 *", 2026);
    expect(r).toMatchObject({ repeatType: "none", date: "2026-03-24", time: "09:00", mode: "visual" });
  });

  it("不重复 2026-12-01 → none, date 2026-12-01", () => {
    const r = parseCronToVisual("30 0 1 12 *", 2026);
    expect(r).toMatchObject({ repeatType: "none", date: "2026-12-01", time: "00:30", mode: "visual" });
  });

  // Non-standard / raw fallbacks
  it("工作日 1-5 → raw mode", () => {
    const r = parseCronToVisual("0 9 * * 1-5");
    expect(r.mode).toBe("raw");
    expect(r.rawCron).toBe("0 9 * * 1-5");
  });

  it("6 字段 → raw mode", () => {
    const r = parseCronToVisual("0 0 9 * * 1");
    expect(r.mode).toBe("raw");
  });

  it("空字符串 → raw mode", () => {
    const r = parseCronToVisual("");
    expect(r.mode).toBe("raw");
  });

  // roundtrip: build → parse → build
  it("roundtrip daily", () => {
    const cron = buildCronExpr("daily", { time: "17:45" });
    const visual = parseCronToVisual(cron);
    const rebuilt = buildCronExpr(visual.repeatType, { time: visual.time });
    expect(rebuilt).toBe(cron);
  });

  it("roundtrip weekly 周五", () => {
    const cron = buildCronExpr("weekly", { time: "08:00", weekday: "5" });
    const visual = parseCronToVisual(cron);
    const rebuilt = buildCronExpr(visual.repeatType, { time: visual.time, weekday: visual.weekday });
    expect(rebuilt).toBe(cron);
  });

  it("roundtrip monthly 28日", () => {
    const cron = buildCronExpr("monthly", { time: "20:00", dayOfMonth: "28" });
    const visual = parseCronToVisual(cron);
    const rebuilt = buildCronExpr(visual.repeatType, { time: visual.time, dayOfMonth: visual.dayOfMonth });
    expect(rebuilt).toBe(cron);
  });

  it("roundtrip none 2026-06-15", () => {
    const cron = buildCronExpr("none", { time: "11:00", date: "2026-06-15" });
    const visual = parseCronToVisual(cron, 2026);
    const rebuilt = buildCronExpr(visual.repeatType, { time: visual.time, date: visual.date });
    expect(rebuilt).toBe(cron);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cronHumanLabel
// ─────────────────────────────────────────────────────────────────────────────
describe("cronHumanLabel", () => {
  it("每天 09:00 → '每天 09:00'", () => {
    expect(cronHumanLabel("0 9 * * *")).toBe("每天 09:00");
  });

  it("每天 00:00 → '每天 00:00'", () => {
    expect(cronHumanLabel("0 0 * * *")).toBe("每天 00:00");
  });

  it("每天 18:30 → '每天 18:30'", () => {
    expect(cronHumanLabel("30 18 * * *")).toBe("每天 18:30");
  });

  it("每周周一 → '每周周一 09:00'", () => {
    expect(cronHumanLabel("0 9 * * 1")).toBe("每周周一 09:00");
  });

  it("每周周日 → '每周周日 09:00'", () => {
    expect(cronHumanLabel("0 9 * * 0")).toBe("每周周日 09:00");
  });

  it("每周周六 → '每周周六 10:00'", () => {
    expect(cronHumanLabel("0 10 * * 6")).toBe("每周周六 10:00");
  });

  it("每月1日 → '每月1日 09:00'", () => {
    expect(cronHumanLabel("0 9 1 * *")).toBe("每月1日 09:00");
  });

  it("每月15日 → '每月15日 14:30'", () => {
    expect(cronHumanLabel("30 14 15 * *")).toBe("每月15日 14:30");
  });

  it("不重复 3月24日 → '3月24日 09:00（不重复）'", () => {
    expect(cronHumanLabel("0 9 24 3 *")).toBe("3月24日 09:00（不重复）");
  });

  it("不重复 12月1日 → '12月1日 00:30（不重复）'", () => {
    expect(cronHumanLabel("30 0 1 12 *")).toBe("12月1日 00:30（不重复）");
  });

  it("空字符串 → '—'", () => {
    expect(cronHumanLabel("")).toBe("—");
  });

  it("非标准 1-5 → 返回原始 cron", () => {
    expect(cronHumanLabel("0 9 * * 1-5")).toBe("0 9 * * 1-5");
  });

  it("字段数不足 → 返回原始字符串", () => {
    expect(cronHumanLabel("0 9 *")).toBe("0 9 *");
  });

  it("小时分钟各补零 → 09:05", () => {
    expect(cronHumanLabel("5 9 * * *")).toBe("每天 09:05");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// everyMsHumanLabel
// ─────────────────────────────────────────────────────────────────────────────
describe("everyMsHumanLabel", () => {
  it("1 小时 → '每 1 小时'", () => {
    expect(everyMsHumanLabel(3600000)).toBe("每 1 小时");
  });

  it("30 分钟 → '每 30 分钟'", () => {
    expect(everyMsHumanLabel(1800000)).toBe("每 30 分钟");
  });

  it("1 小时 30 分钟 → '每 1 小时 30 分钟'", () => {
    expect(everyMsHumanLabel(5400000)).toBe("每 1 小时 30 分钟");
  });

  it("1 分钟 → '每 1 分钟'", () => {
    expect(everyMsHumanLabel(60000)).toBe("每 1 分钟");
  });

  it("30 秒 → '每 30 秒'", () => {
    expect(everyMsHumanLabel(30000)).toBe("每 30 秒");
  });

  it("2 小时 → '每 2 小时'", () => {
    expect(everyMsHumanLabel(7200000)).toBe("每 2 小时");
  });

  it("2 小时 45 分钟 → '每 2 小时 45 分钟'", () => {
    expect(everyMsHumanLabel(9900000)).toBe("每 2 小时 45 分钟");
  });

  it("0 ms → '—'（无效）", () => {
    expect(everyMsHumanLabel(0)).toBe("—");
  });

  it("负数 → '—'", () => {
    expect(everyMsHumanLabel(-1)).toBe("—");
  });

  it("整小时忽略 0 分钟", () => {
    // 3 hours 0 min → "每 3 小时" not "每 3 小时 0 分钟"
    expect(everyMsHumanLabel(10800000)).toBe("每 3 小时");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateCronVisual
// ─────────────────────────────────────────────────────────────────────────────
describe("validateCronVisual", () => {
  it("daily + 有效时间 → ok", () => {
    expect(validateCronVisual("daily", { time: "09:00" }).ok).toBe(true);
  });

  it("weekly + 有效时间 → ok", () => {
    expect(validateCronVisual("weekly", { time: "18:00" }).ok).toBe(true);
  });

  it("monthly + 有效时间 → ok", () => {
    expect(validateCronVisual("monthly", { time: "00:00" }).ok).toBe(true);
  });

  it("none + 有效未来日期 → ok", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(validateCronVisual("none", { time: "09:00", date: tomorrow }).ok).toBe(true);
  });

  it("none + 无 date → error '请选择日期'", () => {
    const r = validateCronVisual("none", { time: "09:00" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("请选择日期");
  });

  it("none + 过去日期 → error '日期不能早于今天'", () => {
    const r = validateCronVisual("none", { time: "09:00", date: "2020-01-01" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("日期不能早于今天");
  });
});

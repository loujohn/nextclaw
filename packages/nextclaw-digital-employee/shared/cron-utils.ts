/**
 * Cron expression utilities shared between the UI layer and tests.
 * All functions are pure (no side effects, no Vue reactivity).
 */

export type RepeatType = "none" | "daily" | "weekly" | "monthly";

/** Maps JS getDay() index (0=Sun) to Chinese label */
export const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/** Week-day options displayed in the picker (Mon first, Sun last) */
export const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0] as const;

export interface CronVisualState {
  repeatType: RepeatType;
  date: string;        // "YYYY-MM-DD", used for "none"
  weekday: string;     // "0"–"6", used for "weekly"
  dayOfMonth: string;  // "1"–"31", used for "monthly"
  time: string;        // "HH:mm"
  mode: "visual" | "raw";
  rawCron: string;     // only meaningful when mode === "raw"
}

// ── Build cron expression from visual state ──────────────────────────────────

/**
 * Produces a standard 5-field cron expression from visual picker state.
 *
 * @param repeatType - recurrence pattern
 * @param opts.date      - ISO date string "YYYY-MM-DD" (only for "none")
 * @param opts.weekday   - "0"–"6" (only for "weekly")
 * @param opts.dayOfMonth - "1"–"31" (only for "monthly")
 * @param opts.time      - "HH:mm" (required)
 * @returns 5-field cron string, e.g. "0 9 * * 1"
 */
export function buildCronExpr(
  repeatType: RepeatType,
  opts: { date?: string; weekday?: string; dayOfMonth?: string; time: string }
): string {
  const [hStr = "0", mStr = "0"] = opts.time.split(":");
  const h = Math.max(0, Math.min(23, Number(hStr) || 0));
  const m = Math.max(0, Math.min(59, Number(mStr) || 0));

  switch (repeatType) {
    case "daily":
      return `${m} ${h} * * *`;
    case "weekly": {
      const dow = opts.weekday ?? "1";
      return `${m} ${h} * * ${dow}`;
    }
    case "monthly": {
      const dom = Number(opts.dayOfMonth ?? "1");
      const day = Math.max(1, Math.min(31, dom));
      return `${m} ${h} ${day} * *`;
    }
    case "none": {
      if (opts.date) {
        const parts = opts.date.split("-");
        const day = Number(parts[2]);
        const month = Number(parts[1]);
        if (!isNaN(day) && !isNaN(month) && day >= 1 && month >= 1) {
          return `${m} ${h} ${day} ${month} *`;
        }
      }
      // Fallback: treat as daily if no valid date
      return `${m} ${h} * * *`;
    }
  }
}

// ── Parse cron expression into visual state ───────────────────────────────────

/**
 * Parses a 5-field cron expression and returns the visual picker state.
 * Non-standard expressions (e.g. ranges like "1-5") fall back to raw mode.
 *
 * @param cron - 5-field cron string
 * @param currentYear - override for year (defaults to current year)
 */
export function parseCronToVisual(cron: string, currentYear?: number): CronVisualState {
  const raw: CronVisualState = {
    repeatType: "daily",
    date: "",
    weekday: "1",
    dayOfMonth: "1",
    time: "09:00",
    mode: "raw",
    rawCron: cron
  };

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return raw;

  const [minStr, hourStr, domStr, monthStr, dowStr] = parts as [string, string, string, string, string];

  const hourNum = Number(hourStr);
  const minNum = Number(minStr);
  if (isNaN(hourNum) || isNaN(minNum)) return raw;

  const h = String(hourNum).padStart(2, "0");
  const m = String(minNum).padStart(2, "0");
  const time = `${h}:${m}`;

  const base: CronVisualState = { ...raw, time, mode: "visual" };

  // day-of-week is set → weekly
  if (dowStr !== "*") {
    if (/^\d$/.test(dowStr)) {
      return { ...base, repeatType: "weekly", weekday: dowStr };
    }
    // Non-simple DOW (e.g. "1-5") → raw mode
    return { ...raw, rawCron: cron };
  }

  // Both dom and month are set → one-time (none)
  if (domStr !== "*" && monthStr !== "*") {
    const domNum = Number(domStr);
    const monthNum = Number(monthStr);
    if (isNaN(domNum) || isNaN(monthNum)) return { ...raw, rawCron: cron };
    const year = currentYear ?? new Date().getFullYear();
    const mo = String(monthNum).padStart(2, "0");
    const d = String(domNum).padStart(2, "0");
    return { ...base, repeatType: "none", date: `${year}-${mo}-${d}` };
  }

  // Only dom is set → monthly
  if (domStr !== "*") {
    const domNum = Number(domStr);
    if (isNaN(domNum)) return { ...raw, rawCron: cron };
    return { ...base, repeatType: "monthly", dayOfMonth: domStr };
  }

  // Wildcard everywhere → daily
  return { ...base, repeatType: "daily" };
}

// ── Human-readable labels ─────────────────────────────────────────────────────

/**
 * Converts a 5-field cron expression to a concise Chinese label.
 * Returns the raw cron string unchanged for non-standard expressions.
 *
 * @example
 * cronHumanLabel("0 9 * * *")    → "每天 09:00"
 * cronHumanLabel("0 9 * * 1")   → "每周周一 09:00"
 * cronHumanLabel("0 9 1 * *")   → "每月1日 09:00"
 * cronHumanLabel("0 9 24 3 *")  → "3月24日 09:00（不重复）"
 */
export function cronHumanLabel(cron: string): string {
  if (!cron) return "—";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minStr, hourStr, domStr, monthStr, dowStr] = parts as [string, string, string, string, string];
  const hourNum = Number(hourStr);
  const minNum = Number(minStr);
  if (isNaN(hourNum) || isNaN(minNum)) return cron;
  const h = String(hourNum).padStart(2, "0");
  const m = String(minNum).padStart(2, "0");
  const time = `${h}:${m}`;

  if (dowStr !== "*") {
    // Non-simple DOW (e.g. "1-5") → return raw cron unchanged
    if (!/^\d$/.test(dowStr)) return cron;
    const dayNum = Number(dowStr);
    const dayLabel = !isNaN(dayNum) && dayNum >= 0 && dayNum <= 6 ? WEEKDAY_LABELS[dayNum] : dowStr;
    return `每周${dayLabel} ${time}`;
  }
  if (domStr !== "*" && monthStr !== "*") {
    return `${monthStr}月${domStr}日 ${time}（不重复）`;
  }
  if (domStr !== "*") {
    return `每月${domStr}日 ${time}`;
  }
  return `每天 ${time}`;
}

/**
 * Converts an interval in milliseconds to a concise Chinese label.
 *
 * @example
 * everyMsHumanLabel(3600000)  → "每 1 小时"
 * everyMsHumanLabel(1800000)  → "每 30 分钟"
 * everyMsHumanLabel(5400000)  → "每 1 小时 30 分钟"
 */
export function everyMsHumanLabel(ms: number): string {
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && min > 0) return `每 ${h} 小时 ${min} 分钟`;
  if (h > 0) return `每 ${h} 小时`;
  if (min > 0) return `每 ${min} 分钟`;
  return `每 ${Math.floor(ms / 1000)} 秒`;
}

/** Validates that the visual picker state can produce a meaningful cron. */
export function validateCronVisual(
  repeatType: RepeatType,
  opts: { date?: string; time: string }
): { ok: boolean; error?: string } {
  const [hStr, mStr] = opts.time.split(":");
  if (!hStr || !mStr || isNaN(Number(hStr)) || isNaN(Number(mStr))) {
    return { ok: false, error: "请选择有效的时间" };
  }
  if (repeatType === "none") {
    if (!opts.date) return { ok: false, error: "请选择日期" };
    const today = new Date().toISOString().slice(0, 10);
    if (opts.date < today) return { ok: false, error: "日期不能早于今天" };
  }
  return { ok: true };
}

/**
 * Billing calendar math.
 *
 * "Billing dates" in Brightloop are calendar dates in the business timezone
 * (Asia/Kolkata) stored as `YYYY-MM-DD` strings, so they sort and compare
 * lexicographically. Timestamps (who/when) stay UTC epoch milliseconds.
 *
 * Period arithmetic clamps to the end of the month, so a 31 Jan monthly
 * renewal bills 28 Feb in a non-leap year and 29 Feb in a leap year.
 */

export type Day = string; // YYYY-MM-DD

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m - 1);
}

function requireDay(day: string): void {
  if (!isValidDay(day)) throw new Error(`Invalid calendar date: ${day}`);
}

/** Today's date in the business timezone. */
export function todayInBusinessTz(now: Date = new Date()): Day {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dayToDate(day: Day): Date {
  requireDay(day);
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function dateToDay(date: Date): Day {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(day: Day, amount: number): Day {
  const date = dayToDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateToDay(date);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: Day, b: Day): number {
  return Math.round((dayToDate(b).getTime() - dayToDate(a).getTime()) / 86_400_000);
}

export function isBefore(a: Day, b: Day): boolean {
  return a < b;
}
export function isAfter(a: Day, b: Day): boolean {
  return a > b;
}
export function isToday(day: Day, today: Day): boolean {
  return day === today;
}
/** Inclusive range check; undefined bounds are open. */
export function isWithin(day: Day, from?: Day | null, to?: Day | null): boolean {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export type BillingPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** Add N periods to a day, clamping to the last day of the target month/year. */
export function addPeriod(
  day: Day,
  period: BillingPeriod,
  amount = 1,
): Day {
  switch (period) {
    case "DAILY":
      return addDays(day, amount);
    case "WEEKLY":
      return addDays(day, 7 * amount);
    case "MONTHLY": {
      const date = dayToDate(day);
      const targetMonthIndex = date.getUTCMonth() + amount;
      const year = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
      const monthIndex = ((targetMonthIndex % 12) + 12) % 12;
      const dayOfMonth = Math.min(
        date.getUTCDate(),
        daysInMonth(year, monthIndex),
      );
      return dateToDay(new Date(Date.UTC(year, monthIndex, dayOfMonth)));
    }
    case "YEARLY": {
      const date = dayToDate(day);
      const year = date.getUTCFullYear() + amount;
      const monthIndex = date.getUTCMonth();
      const dayOfMonth = Math.min(date.getUTCDate(), daysInMonth(year, monthIndex));
      return dateToDay(new Date(Date.UTC(year, monthIndex, dayOfMonth)));
    }
  }
}

/** Inclusive end day of the period that starts on `start`. */
export function periodEnd(start: Day, period: BillingPeriod): Day {
  return addDays(addPeriod(start, period, 1), -1);
}

/** The start day of the next period. */
export function nextPeriodStart(start: Day, period: BillingPeriod): Day {
  return addPeriod(start, period, 1);
}

/** Human label for a billing date, e.g. "31 Jan 2026". */
export function formatDay(day: Day | null | undefined): string {
  if (!day) return "—";
  if (!isValidDay(day)) return day;
  const date = dayToDate(day);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Days from `from` until `until`, floored at 0. Used for "days overdue". */
export function daysOverdue(dueDate: Day, today: Day): number {
  const diff = diffDays(dueDate, today);
  return diff > 0 ? diff : 0;
}

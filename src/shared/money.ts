/**
 * Money utilities.
 *
 * Every monetary value in Brightloop is an **integer number of paise**.
 * Floats never touch a total: forms collect rupees (possibly with decimals),
 * the UI converts to paise before sending, and every calculation below is
 * integer-in / integer-out. Percentages are stored as basis points (18% = 1800).
 *
 * Rounding rule (documented in docs/DECISIONS.md): round half up to whole
 * paise, applied per line, then summed.
 */

export const PAISE_PER_RUPEE = 100;

/** Round half away from zero (half-up for the positive amounts we bill). */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Not a finite number");
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Rupees (as typed by a human, e.g. 560.5) -> integer paise. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new Error("Invalid amount");
  return roundHalfUp(rupees * PAISE_PER_RUPEE);
}

/** Parse a user-typed money string ("1,234.50") into paise. Returns null when invalid. */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, "");
  if (cleaned === "" || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return rupeesToPaise(parseFloat(cleaned));
}

export function paiseToRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

/** Format paise as Indian-grouped rupees: ₹1,23,456.00 */
const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(paise: number): string {
  return inrFormatter.format(paise / PAISE_PER_RUPEE);
}

/** Format without the currency symbol, for table columns that carry a ₹ header. */
export function formatAmount(paise: number): string {
  return (paise / PAISE_PER_RUPEE).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Apply a basis-point rate to an amount and round half up.
 * 18% of ₹1,000.00 => applyBps(100000, 1800) === 18000 paise.
 */
export function applyBps(amountPaise: number, bps: number): number {
  return roundHalfUp((amountPaise * bps) / 10000);
}

/** Fixed-amount discount/tax values are stored in paise already. */
export function clampToAmount(value: number, cap: number): number {
  if (value < 0) return 0;
  return Math.min(value, cap);
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * MRR normalisation: yearly plans divide by 12, weekly multiply by 52/12,
 * daily by 365/12, monthly stands as-is. Used by the dashboard only.
 */
export function normalizeToMonthly(
  amountPaise: number,
  period: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
): number {
  switch (period) {
    case "YEARLY":
      return roundHalfUp(amountPaise / 12);
    case "WEEKLY":
      return roundHalfUp((amountPaise * 52) / 12);
    case "DAILY":
      return roundHalfUp((amountPaise * 365) / 12);
    case "MONTHLY":
      return amountPaise;
  }
}

/** Human input for money fields: rupees with up to two decimals. */
export const MONEY_INPUT_PATTERN = /^\d+(\.\d{1,2})?$/;

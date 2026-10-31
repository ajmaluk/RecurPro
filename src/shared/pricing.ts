/**
 * Pricing engine: taxes + discounts + invoice arithmetic.
 *
 * Pure functions, integer paise in and out, so the same code runs in the
 * browser (live subscription totals) and inside Convex (billing run), and can
 * be unit-tested without a database.
 *
 * Documented rules (docs/DECISIONS.md):
 *  - Best single discount wins (no stacking).
 *  - A discount is allocated across lines in proportion to gross, by largest
 *    remainder, so the shares always sum exactly to the discount.
 *  - Tax is computed per line on the post-discount amount.
 *  - Rounding: round half up to whole paise per line, then summed.
 *  - Inclusive taxes are extracted from the net using the sum of their rates;
 *    fixed-amount taxes are always added on top (exclusive).
 *  - A discount can never drive a total below zero.
 */
import type { BillingPeriod, DiscountScope, DiscountType, TaxType } from "./enums";
import { applyBps, clampToAmount, roundHalfUp, sum } from "./money";
import { isWithin } from "./periods";

export type TaxRule = {
  id: string;
  name: string;
  type: TaxType;
  /** Percentage taxes: rate in basis points (18% => 1800). */
  rateBps?: number;
  /** Fixed taxes: amount in paise. */
  amount?: number;
  isInclusive: boolean;
};

export type DiscountRule = {
  id: string;
  name: string;
  type: DiscountType;
  /** FIXED => paise. PERCENTAGE => basis points (10% => 1000). */
  value: number;
  minPurchase?: number | null;
  minQuantity?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  usedCount: number;
  appliesTo: DiscountScope;
  productIds?: string[];
  isActive: boolean;
};

export type PricedLineInput = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxes: TaxRule[];
};

export type ComputedTax = {
  taxId: string;
  name: string;
  rateBps: number;
  isInclusive: boolean;
  amount: number;
};

export type ComputedLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  discountAmount: number;
  net: number;
  taxes: ComputedTax[];
  taxAmount: number;
  exclusiveTaxAmount: number;
  lineTotal: number;
};

export type InvoiceTotals = {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  exclusiveTaxTotal: number;
  total: number;
  lines: ComputedLine[];
};

/* ------------------------------------------------------------------ */
/* Discount eligibility                                                */
/* ------------------------------------------------------------------ */

export type DiscountContext = {
  /** Today's calendar date in the business timezone. */
  today: string;
  subtotal: number;
  totalQuantity: number;
  /** Gross (qty x unit price) per line, in input order. */
  lineGross: number[];
  /** Product ids per line, in input order. */
  lineProductIds: (string | null)[];
  customerId?: string;
  /** How many times this customer already redeemed the discount. */
  customerRedemptions?: number;
};

export type DiscountEvaluation = {
  discount: DiscountRule;
  eligible: boolean;
  amount: number;
  reason?: string;
  /** The part of the invoice the discount can apply to. */
  scopeAmount: number;
};

export function evaluateDiscount(
  discount: DiscountRule,
  ctx: DiscountContext,
): DiscountEvaluation {
  const base = { discount, eligible: false, amount: 0, scopeAmount: 0 };
  if (!discount.isActive) return { ...base, reason: "Inactive" };

  const inWindow = isWithin(ctx.today, discount.startDate, discount.endDate);
  if (!inWindow) return { ...base, reason: "Outside its date window" };

  if (discount.minPurchase && ctx.subtotal < discount.minPurchase) {
    return { ...base, reason: "Below the minimum purchase amount" };
  }
  if (discount.minQuantity && ctx.totalQuantity < discount.minQuantity) {
    return { ...base, reason: "Below the minimum quantity" };
  }
  if (discount.usageLimit != null && discount.usedCount >= discount.usageLimit) {
    return { ...base, reason: "Usage limit reached" };
  }
  if (
    discount.perCustomerLimit != null &&
    (ctx.customerRedemptions ?? 0) >= discount.perCustomerLimit
  ) {
    return { ...base, reason: "Per-customer limit reached" };
  }

  let scopeAmount = ctx.subtotal;
  if (discount.appliesTo === "PRODUCTS") {
    const ids = new Set(discount.productIds ?? []);
    scopeAmount = sum(
      ctx.lineGross.filter((_, index) => ids.has(ctx.lineProductIds[index] ?? "")),
    );
    if (scopeAmount <= 0) return { ...base, reason: "No matching products" };
  }

  const cap = Math.min(scopeAmount, ctx.subtotal);
  const amount =
    discount.type === "FIXED"
      ? clampToAmount(discount.value, cap)
      : clampToAmount(applyBps(scopeAmount, discount.value), cap);

  if (amount <= 0) return { ...base, scopeAmount, reason: "Discount is zero" };
  return { discount, eligible: true, amount, scopeAmount };
}

/** Best single discount wins; ties break on the larger amount, then the name. */
export function pickBestDiscount(
  discounts: DiscountRule[],
  ctx: DiscountContext,
): DiscountEvaluation | null {
  const eligible = discounts
    .map((discount) => evaluateDiscount(discount, ctx))
    .filter((evaluation) => evaluation.eligible)
    .sort(
      (a, b) => b.amount - a.amount || a.discount.name.localeCompare(b.discount.name),
    );
  return eligible[0] ?? null;
}

/** The discount a subscription asked for, if it still qualifies today. */
export function evaluateSpecificDiscount(
  discounts: DiscountRule[],
  discountId: string | null | undefined,
  ctx: DiscountContext,
): DiscountEvaluation | null {
  if (!discountId) return null;
  const match = discounts.find((discount) => discount.id === discountId);
  if (!match) return null;
  const evaluation = evaluateDiscount(match, ctx);
  return evaluation.eligible ? evaluation : null;
}

/* ------------------------------------------------------------------ */
/* Discount allocation across lines                                    */
/* ------------------------------------------------------------------ */

/** Split `discount` over `grosses` proportionally, summing exactly. */
export function allocateDiscount(discount: number, grosses: number[]): number[] {
  if (discount <= 0 || grosses.length === 0) return grosses.map(() => 0);
  const total = sum(grosses);
  if (total <= 0) return grosses.map(() => 0);

  const exact = grosses.map((gross) => (discount * gross) / total);
  const shares = exact.map((value) => Math.floor(value));
  let remainder = discount - sum(shares);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const entry of order) {
    if (remainder <= 0) break;
    shares[entry.index] += 1;
    remainder -= 1;
  }
  return shares;
}

/* ------------------------------------------------------------------ */
/* Tax                                                                 */
/* ------------------------------------------------------------------ */

export type LineTaxResult = {
  taxes: ComputedTax[];
  taxAmount: number;
  exclusiveTaxAmount: number;
};

/**
 * Compute every tax on one line's post-discount amount.
 * Inclusive rates are extracted together using their combined rate so that
 * CGST 9% + SGST 9% inclusive yields exactly 9% + 9% of the taxable base.
 */
export function computeLineTaxes(net: number, taxes: TaxRule[]): LineTaxResult {
  const percentage = taxes.filter((tax) => tax.type === "PERCENT");
  const fixed = taxes.filter((tax) => tax.type !== "PERCENT");
  const inclusiveBps = sum(
    percentage.filter((tax) => tax.isInclusive).map((tax) => tax.rateBps ?? 0),
  );

  const inclusiveBase =
    inclusiveBps > 0
      ? roundHalfUp((net * 10000) / (10000 + inclusiveBps))
      : 0;

  const computed: ComputedTax[] = [];
  for (const tax of percentage) {
    const amount = tax.isInclusive
      ? applyBps(inclusiveBase, tax.rateBps ?? 0)
      : applyBps(net, tax.rateBps ?? 0);
    computed.push({
      taxId: tax.id,
      name: tax.name,
      rateBps: tax.rateBps ?? 0,
      isInclusive: tax.isInclusive,
      amount,
    });
  }
  for (const tax of fixed) {
    computed.push({
      taxId: tax.id,
      name: tax.name,
      rateBps: 0,
      isInclusive: false,
      amount: tax.amount ?? 0,
    });
  }

  const exclusiveTaxAmount = sum(
    computed.filter((tax) => !tax.isInclusive).map((tax) => tax.amount),
  );
  const taxAmount = sum(computed.map((tax) => tax.amount));
  return { taxes: computed, taxAmount, exclusiveTaxAmount };
}

/* ------------------------------------------------------------------ */
/* Invoice totals                                                      */
/* ------------------------------------------------------------------ */

export function computeInvoiceTotals(
  lines: PricedLineInput[],
  discountAmount = 0,
): InvoiceTotals {
  const grosses = lines.map((line) => line.quantity * line.unitPrice);
  const subtotal = sum(grosses);
  const discount = Math.max(0, Math.min(discountAmount, subtotal));
  const shares = allocateDiscount(discount, grosses);

  const computedLines: ComputedLine[] = lines.map((line, index) => {
    const gross = grosses[index];
    const discountOnLine = shares[index];
    const net = gross - discountOnLine;
    const taxes = computeLineTaxes(net, line.taxes);
    return {
      ...line,
      gross,
      discountAmount: discountOnLine,
      net,
      ...taxes,
      lineTotal: net + taxes.exclusiveTaxAmount,
    };
  });

  const taxTotal = sum(computedLines.map((line) => line.taxAmount));
  const exclusiveTaxTotal = sum(
    computedLines.map((line) => line.exclusiveTaxAmount),
  );

  return {
    subtotal,
    discountTotal: discount,
    taxTotal,
    exclusiveTaxTotal,
    total: subtotal - discount + exclusiveTaxTotal,
    lines: computedLines,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function percentToBps(percent: number): number {
  return roundHalfUp(percent * 100);
}

/** Recurring amount of one subscription line per billing period. */
export function lineRecurring(
  quantity: number,
  unitPrice: number,
  period: BillingPeriod,
): number {
  return quantity * unitPrice;
}

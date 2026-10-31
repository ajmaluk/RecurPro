/**
 * State machines — the single source of truth for every status transition in
 * RecurPro. Both the UI (to decide which buttons to show) and the Convex
 * mutations (to decide whether to accept a transition) import from here.
 *
 * Anything not listed is rejected with a clear error (409 semantics).
 */
import type { InvoiceStatus, SubscriptionStatus } from "./enums";

export const SUBSCRIPTION_TRANSITIONS: Record<
  SubscriptionStatus,
  SubscriptionStatus[]
> = {
  DRAFT: ["QUOTATION", "CLOSED"],
  QUOTATION: ["CONFIRMED", "DRAFT", "CLOSED"],
  CONFIRMED: ["ACTIVE", "CLOSED"],
  ACTIVE: ["PAUSED", "CLOSED"],
  PAUSED: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

export function allowedSubscriptionTransitions(
  from: SubscriptionStatus,
): SubscriptionStatus[] {
  return SUBSCRIPTION_TRANSITIONS[from] ?? [];
}

export function allowedInvoiceTransitions(from: InvoiceStatus): InvoiceStatus[] {
  return INVOICE_TRANSITIONS[from] ?? [];
}

export function canTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return (SUBSCRIPTION_TRANSITIONS[from] ?? []).includes(to);
}

export function assertSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  reason?: string,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Cannot move a subscription from ${from} to ${to}.${reason ? ` ${reason}` : ""}`,
    );
  }
}

export function assertInvoiceTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): void {
  if (!(INVOICE_TRANSITIONS[from] ?? []).includes(to)) {
    throw new Error(`Cannot move an invoice from ${from} to ${to}.`);
  }
}

/**
 * Extra preconditions that depend on plan configuration. Called by the
 * subscription mutations after the generic transition check passes.
 */
export type PlanFlags = {
  pausable: boolean;
  closable: boolean;
  renewable: boolean;
};

export function assertSubscriptionPrecondition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  plan: PlanFlags,
): void {
  assertSubscriptionTransition(from, to);
  if (from === "ACTIVE" && to === "PAUSED" && !plan.pausable) {
    throw new Error("This plan does not allow subscriptions to be paused.");
  }
  if (to === "CLOSED" && from === "ACTIVE" && !plan.closable) {
    throw new Error(
      "This plan only closes automatically when the subscription expires.",
    );
  }
}

/** Badge metadata shared by every table, card and timeline in the UI. */
export const STATUS_META: Record<
  string,
  { label: string; classes: string }
> = {
  DRAFT: { label: "Draft", classes: "bg-slate-100 text-slate-700 ring-slate-200" },
  QUOTATION: {
    label: "Quotation",
    classes: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  CONFIRMED: {
    label: "Confirmed",
    classes: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  ACTIVE: {
    label: "Active",
    classes: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  PAUSED: {
    label: "Paused",
    classes: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  CLOSED: {
    label: "Closed",
    classes: "bg-slate-100 text-slate-500 ring-slate-200",
  },
  PAID: {
    label: "Paid",
    classes: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  CANCELLED: {
    label: "Cancelled",
    classes: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  OVERDUE: {
    label: "Overdue",
    classes: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  PARTIALLY_PAID: {
    label: "Partially paid",
    classes: "bg-amber-50 text-amber-700 ring-amber-200",
  },
};

export function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      label: status,
      classes: "bg-slate-100 text-slate-600 ring-slate-200",
    }
  );
}

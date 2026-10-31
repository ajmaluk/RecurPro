/**
 * Billing engine.
 *
 * Guarantees, in order of defence:
 *  1. Only `ACTIVE` subscriptions whose `nextInvoiceDate <= today` are picked,
 *     taken in bounded batches, and `nextInvoiceDate` is advanced inside the
 *     same transaction as the invoice insert.
 *  2. Every period has a `periodKey` (`${subscriptionId}|${periodStart}`) with a
 *     **unique index**, so the same period can never be billed twice even if
 *     two runs race — the loser fails its insert, re-reads on the next batch,
 *     sees the invoice and simply advances.
 *  3. Catch-up is inherent: the generator loops from `nextInvoiceDate` until it
 *     passes `today`, so missed days (crash, redeploy) are billed, never skipped.
 *
 * A subscription that keeps failing is counted in `jobRuns.attempts` and parked
 * in `stuckIds` after three tries, so a run always terminates and admins see it.
 */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { audit, errorMessage, requireAdmin, requireStaff, today } from "./lib/authz";
import { toDiscountRule } from "./lib/rules";
import { taxRulesForProduct } from "./catalog";
import { addDays, nextPeriodStart, periodEnd } from "../shared/periods";
import {
  computeInvoiceTotals,
  evaluateDiscount,
  pickBestDiscount,
  type PricedLineInput,
} from "../shared/pricing";

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

type GenerateResult = {
  created: boolean;
  invoiceId?: Id<"invoices">;
  periodStart: string;
  periodEnd: string;
  nextPeriodStart: string;
  total?: number;
  discountName?: string;
  /** Set when running a preview: what *would* be billed. */
  preview?: {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    lineCount: number;
  };
  reason?: string;
};

/* ------------------------------------------------------------------ */
/* Invoice builder                                                     */
/* ------------------------------------------------------------------ */

async function generateInvoiceForPeriod(
  // Queries use this builder read-only (`write: false`); mutations write.
  ctx: MutationCtx | QueryCtx,
  subscription: Doc<"subscriptions">,
  plan: Doc<"plans">,
  periodStart: string,
  options: { write: boolean; actorId?: Id<"users"> },
): Promise<GenerateResult> {
  const endDay = periodEnd(periodStart, plan.billingPeriod);
  const following = nextPeriodStart(periodStart, plan.billingPeriod);
  const periodKey = `${subscription._id}|${periodStart}`;

  const existing = await ctx.db
    .query("invoices")
    .withIndex("by_period_key", (q) => q.eq("periodKey", periodKey))
    .first();
  if (existing) {
    return {
      created: false,
      periodStart,
      periodEnd: endDay,
      nextPeriodStart: following,
      reason: existing.status === "CANCELLED" ? "cancelled" : "already billed",
    };
  }

  const rows = await ctx.db
    .query("subscriptionLines")
    .withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
    .collect();
  if (rows.length === 0) throw new Error(`${subscription.number} has no lines to bill.`);

  const pricedLines: PricedLineInput[] = [];
  for (const line of rows.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const taxes = await taxRulesForProduct(ctx, line.productId);
    pricedLines.push({
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxes,
    });
  }

  const lineGross = pricedLines.map((line) => line.quantity * line.unitPrice);
  const subtotal = lineGross.reduce((total, gross) => total + gross, 0);
  const totalQuantity = pricedLines.reduce((total, line) => total + line.quantity, 0);
  const todayDate = today();

  const activeDiscounts = await ctx.db
    .query("discounts")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .collect();

  const evaluationContext = {
    today: todayDate,
    subtotal,
    totalQuantity,
    lineGross,
    lineProductIds: pricedLines.map((line) => line.productId),
    customerId: subscription.customerId,
  };

  let evaluation = null;
  if (subscription.discountId) {
    const attached = activeDiscounts.find((row) => row._id === subscription.discountId);
    if (attached) {
      const candidate = evaluateDiscount(toDiscountRule(attached), {
        ...evaluationContext,
        customerRedemptions: await redemptionCount(
          ctx,
          attached._id,
          subscription.customerId,
        ),
      });
      if (candidate.eligible) evaluation = candidate;
    }
  } else {
    const best = pickBestDiscount(activeDiscounts.map(toDiscountRule), {
      ...evaluationContext,
      customerRedemptions: 0,
    });
    evaluation = best;
  }

  const totals = computeInvoiceTotals(pricedLines, evaluation?.amount ?? 0);
  const base: GenerateResult = {
    created: false,
    periodStart,
    periodEnd: endDay,
    nextPeriodStart: following,
    total: totals.total,
    discountName: evaluation?.eligible ? evaluation.discount.name : undefined,
    preview: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      lineCount: totals.lines.length,
    },
  };

  if (!options.write) return base;

  const customer = await ctx.db.get(subscription.customerId);
  if (!customer) throw new Error("Customer missing for this subscription.");
  const paymentTerm = await ctx.db.get(subscription.paymentTermId);
  const now = Date.now();

  const invoiceId = await ctx.db.insert("invoices", {
    subscriptionId: subscription._id,
    customerId: customer._id,
    status: "DRAFT",
    periodStart,
    periodEnd: endDay,
    periodKey,
    issueDate: periodStart,
    dueDate: addDays(periodStart, paymentTerm?.dueDays ?? 0),
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    amountPaid: 0,
    amountDue: totals.total,
    customerSnapshot: {
      name: customer.name,
      email: customer.email,
      company: customer.company,
      taxId: customer.taxId,
      address: customer.address,
    },
    searchText: `${customer.name} ${subscription.number}`.toLowerCase(),
    createdBy: options.actorId,
    createdAt: now,
  });

  for (const line of totals.lines) {
    await ctx.db.insert("invoiceLines", {
      invoiceId,
      productId: (line.productId as Id<"products"> | null) ?? undefined,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
      taxes: line.taxes.map((tax) => ({
        taxId: tax.taxId as Id<"taxes">,
        name: tax.name,
        rateBps: tax.rateBps,
        isInclusive: tax.isInclusive,
        amount: tax.amount,
      })),
    });
  }

  // Redemption is written in the same transaction as the invoice, so the
  // counter can never drift from what was actually billed.
  if (evaluation && totals.discountTotal > 0) {
    const discount = await ctx.db.get(evaluation.discount.id as Id<"discounts">);
    const withinLimit =
      discount &&
      (discount.usageLimit == null || discount.usedCount < discount.usageLimit);
    if (discount && withinLimit) {
      await ctx.db.patch(discount._id, { usedCount: discount.usedCount + 1 });
      await ctx.db.insert("discountRedemptions", {
        discountId: discount._id,
        invoiceId,
        customerId: customer._id,
        amount: totals.discountTotal,
        createdAt: now,
      });
    }
  }

  // `write: true` implies a mutation context (the query preview returns above).
  await audit(ctx as MutationCtx, {
    actorId: options.actorId,
    action: "invoice.generate",
    entityType: "invoices",
    entityId: invoiceId,
    after: {
      number: subscription.number,
      periodStart,
      periodEnd: endDay,
      total: totals.total,
    },
  });

  return { ...base, created: true, invoiceId };
}

async function redemptionCount(
  ctx: MutationCtx,
  discountId: Id<"discounts">,
  customerId: Id<"customers">,
): Promise<number> {
  const rows = await ctx.db
    .query("discountRedemptions")
    .withIndex("by_customer_discount", (q) =>
      q.eq("customerId", customerId).eq("discountId", discountId),
    )
    .collect();
  return rows.filter((row) => !row.reversedAt).length;
}

/* ------------------------------------------------------------------ */
/* Daily housekeeping: activate due subs, close expired ones           */
/* ------------------------------------------------------------------ */

async function housekeeping(ctx: MutationCtx): Promise<{
  activated: number;
  closed: number;
}> {
  const todayDate = today();
  let activated = 0;
  let closed = 0;

  const confirmed = await ctx.db
    .query("subscriptions")
    .withIndex("by_status", (q) => q.eq("status", "CONFIRMED"))
    .take(500);
  for (const subscription of confirmed) {
    if (subscription.startDate > todayDate) continue;
    await ctx.db.patch(subscription._id, {
      status: "ACTIVE",
      nextInvoiceDate: subscription.nextInvoiceDate ?? subscription.startDate,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("subscriptionStatusHistory", {
      subscriptionId: subscription._id,
      fromStatus: "CONFIRMED",
      toStatus: "ACTIVE",
      changedBy: undefined,
      changedByName: "Scheduled job",
      changedAt: Date.now(),
      reason: "Start date reached",
    });
    activated += 1;
  }

  const active = await ctx.db
    .query("subscriptions")
    .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
    .take(2000);
  for (const subscription of active) {
    if (subscription.expiryDate >= todayDate) continue;
    const plan = await ctx.db.get(subscription.planId);
    if (!plan?.autoCloseOnEnd) continue;
    // Only close once billing has consumed every period up to the expiry,
    // so a missed run still invoices its remaining periods first.
    const nextInvoice = subscription.nextInvoiceDate ?? subscription.startDate;
    if (nextInvoice <= subscription.expiryDate) continue;
    await ctx.db.patch(subscription._id, {
      status: "CLOSED",
      closedAt: Date.now(),
      closeReason: "Expired",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("subscriptionStatusHistory", {
      subscriptionId: subscription._id,
      fromStatus: "ACTIVE",
      toStatus: "CLOSED",
      changedBy: undefined,
      changedByName: "Scheduled job",
      changedAt: Date.now(),
      reason: "Subscription reached its expiry date",
    });
    closed += 1;
  }

  return { activated, closed };
}

/* ------------------------------------------------------------------ */
/* Run control                                                         */
/* ------------------------------------------------------------------ */

async function beginRun(
  ctx: MutationCtx,
  triggeredBy: string,
): Promise<Id<"jobRuns">> {
  const now = Date.now();
  const jobRunId = await ctx.db.insert("jobRuns", {
    jobName: "billing",
    status: "RUNNING",
    runDate: today(),
    dryRun: false,
    triggeredBy,
    processed: 0,
    created: 0,
    failed: 0,
    stuckIds: [],
    attempts: {},
    startedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.billing.processBatch, { jobRunId });
  return jobRunId;
}

/** Admin-triggered manual run ("Run billing now"). */
export const start = mutation({
  args: { triggeredBy: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    await housekeeping(ctx);
    const jobRunId = await beginRun(ctx, args.triggeredBy ?? "manual");
    await audit(ctx, {
      actor,
      action: "billing.run",
      entityType: "jobRuns",
      entityId: jobRunId,
      after: { triggeredBy: "manual" },
    });
    return jobRunId;
  },
});

/** Cron entry point (00:30 Asia/Kolkata). */
export const dailyRun = internalMutation({
  args: {},
  handler: async (ctx) => {
    await housekeeping(ctx);
    return await beginRun(ctx, "cron");
  },
});

/** One bounded batch. Re-schedules itself until nothing is due. */
export const processBatch = internalMutation({
  args: { jobRunId: v.id("jobRuns") },
  handler: async (ctx, { jobRunId }) => {
    const jobRun = await ctx.db.get(jobRunId);
    if (!jobRun || jobRun.status !== "RUNNING") return;

    const todayDate = today();
    const stuck = new Set(jobRun.stuckIds);
    const due = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_next", (q) =>
        q.eq("status", "ACTIVE").lte("nextInvoiceDate", todayDate),
      )
      .take(BATCH_SIZE * 3);

    const batch = due.filter((subscription) => !stuck.has(subscription._id)).slice(0, BATCH_SIZE);

    if (batch.length === 0) {
      await ctx.db.patch(jobRunId, {
        status: "SUCCEEDED",
        finishedAt: Date.now(),
        error:
          jobRun.stuckIds.length > 0
            ? `${jobRun.stuckIds.length} subscription(s) could not be billed and need attention.`
            : undefined,
      });
      return;
    }

    const attempts = { ...(jobRun.attempts ?? {}) };
    const stuckIds = [...jobRun.stuckIds];
    let processed = 0;
    let created = 0;
    let failed = 0;

    for (const subscription of batch) {
      try {
        const plan = await ctx.db.get(subscription.planId);
        if (!plan) throw new Error("Plan missing.");
        let cursor = subscription.nextInvoiceDate ?? subscription.startDate;
        let guard = 0;
        while (cursor <= todayDate && guard < 400) {
          guard += 1;
          const result = await generateInvoiceForPeriod(ctx, subscription, plan, cursor, {
            write: true,
          });
          if (result.created) created += 1;
          cursor = result.nextPeriodStart;
          await ctx.db.patch(subscription._id, {
            nextInvoiceDate: cursor,
            updatedAt: Date.now(),
          });
        }
        if (guard >= 400) {
          throw new Error("Period guard tripped; check the plan billing period.");
        }

        // auto_close_on_end: the next period would start after the expiry date.
        if (plan.autoCloseOnEnd && cursor > subscription.expiryDate) {
          await ctx.db.patch(subscription._id, {
            status: "CLOSED",
            closedAt: Date.now(),
            closeReason: "Expired",
            updatedAt: Date.now(),
          });
          await ctx.db.insert("subscriptionStatusHistory", {
            subscriptionId: subscription._id,
            fromStatus: "ACTIVE",
            toStatus: "CLOSED",
            changedBy: undefined,
            changedByName: "Billing run",
            changedAt: Date.now(),
            reason: "No further periods remain before the expiry date",
          });
        }
        processed += 1;
        delete attempts[subscription._id];
      } catch (error) {
        failed += 1;
        const attemptsForSub = (attempts[subscription._id] ?? 0) + 1;
        attempts[subscription._id] = attemptsForSub;
        if (attemptsForSub >= MAX_ATTEMPTS && !stuckIds.includes(subscription._id)) {
          stuckIds.push(subscription._id);
        }
        await ctx.db.patch(jobRunId, {
          error: `${subscription.number}: ${errorMessage(error)}`,
        });
      }
    }

    await ctx.db.patch(jobRunId, {
      processed: jobRun.processed + processed,
      created: jobRun.created + created,
      failed: jobRun.failed + failed,
      attempts,
      stuckIds,
    });

    await ctx.scheduler.runAfter(0, internal.billing.processBatch, { jobRunId });
  },
});

export const jobStatus = query({
  args: { jobRunId: v.id("jobRuns") },
  handler: async (ctx, { jobRunId }) => {
    await requireStaff(ctx);
    return await ctx.db.get(jobRunId);
  },
});

export const recentRuns = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("jobRuns")
      .withIndex("by_job", (q) => q.eq("jobName", "billing"))
      .order("desc")
      .take(10);
  },
});

/**
 * Dry run: exactly the same builder as the real run, with writes disabled.
 * Returns what would be billed right now, per subscription and period.
 */
export const preview = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const todayDate = today();
    const due = await ctx.db
      .query("subscriptions")
      .withIndex("by_status_next", (q) =>
        q.eq("status", "ACTIVE").lte("nextInvoiceDate", todayDate),
      )
      .take(100);

    const rows = [];
    let grandTotal = 0;
    for (const subscription of due) {
      const plan = await ctx.db.get(subscription.planId);
      const customer = await ctx.db.get(subscription.customerId);
      if (!plan) continue;
      const periods = [];
      let cursor = subscription.nextInvoiceDate ?? subscription.startDate;
      let guard = 0;
      while (cursor <= todayDate && guard < 60) {
        guard += 1;
        const result = await generateInvoiceForPeriod(ctx, subscription, plan, cursor, {
          write: false,
        });
        if (result.reason === "already billed") {
          cursor = result.nextPeriodStart;
          continue;
        }
        periods.push({
          periodStart: result.periodStart,
          periodEnd: result.periodEnd,
          discountName: result.discountName ?? null,
          ...(result.preview ?? {
            subtotal: 0,
            discountTotal: 0,
            taxTotal: 0,
            total: 0,
            lineCount: 0,
          }),
        });
        grandTotal += result.preview?.total ?? 0;
        cursor = result.nextPeriodStart;
      }
      if (periods.length === 0) continue;
      rows.push({
        subscriptionId: subscription._id,
        number: subscription.number,
        customerName: customer?.name ?? "Unknown",
        periods,
      });
    }

    return {
      dueCount: due.length,
      invoiceCount: rows.reduce((total, row) => total + row.periods.length, 0),
      total: grandTotal,
      rows,
      ranAt: Date.now(),
    };
  },
});

/** Internal: bill one specific period (used by the seed script). */
export const billPeriod = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    periodStart: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found.");
    const plan = await ctx.db.get(subscription.planId);
    if (!plan) throw new Error("Plan not found.");
    return await generateInvoiceForPeriod(ctx, subscription, plan, args.periodStart, {
      write: true,
    });
  },
});

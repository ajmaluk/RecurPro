/**
 * Finance reporting. All money is integer paise end to end; every period is a
 * calendar month in Asia/Kolkata, matching how invoices are issued.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireStaff, today } from "./lib/authz";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `YYYY-MM-01` for a month `monthsBack` before the given day. */
function monthStart(day: string, monthsBack: number): string {
  const [year, month] = day.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  return date.toISOString().slice(0, 10);
}

function monthEnd(day: string, monthsBack: number): string {
  const [year, month] = day.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - monthsBack, 0));
  return date.toISOString().slice(0, 10);
}

function labelFor(startDay: string): string {
  const [year, month] = startDay.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year % 100}`;
}

async function sumInvoicesInRange(
  ctx: QueryCtx,
  from: string,
  to: string,
): Promise<{ total: number; count: number }> {
  const rows = await ctx.db
    .query("invoices")
    .withIndex("by_issue_date", (q) => q.gte("issueDate", from).lte("issueDate", to))
    .take(5000);
  let total = 0;
  let count = 0;
  for (const row of rows) {
    if (row.status === "CANCELLED") continue;
    total += row.total;
    count += 1;
  }
  return { total, count };
}

async function sumPaymentsInRange(
  ctx: QueryCtx,
  from: string,
  to: string,
): Promise<number> {
  const rows = await ctx.db
    .query("payments")
    .withIndex("by_paid_on", (q) => q.gte("paidOn", from).lte("paidOn", to))
    .take(5000);
  return rows.reduce((total, row) => total + row.amount, 0);
}

/** Monthly-recurring equivalent of one subscription, in paise. */
function monthlyEquivalent(price: number, period: Doc<"plans">["billingPeriod"]): number {
  switch (period) {
    case "DAILY":
      return Math.round((price * 365) / 12);
    case "WEEKLY":
      return Math.round((price * 52) / 12);
    case "MONTHLY":
      return price;
    case "YEARLY":
      return Math.round(price / 12);
  }
}

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const todayDate = today();
    const currentMonthStart = `${todayDate.slice(0, 7)}-01`;
    const currentMonthEnd = monthEnd(todayDate, 0);

    const [billedThisMonth, collectedThisMonth] = await Promise.all([
      sumInvoicesInRange(ctx, currentMonthStart, currentMonthEnd),
      sumPaymentsInRange(ctx, currentMonthStart, currentMonthEnd),
    ]);

    // 12-month billing / collection trend (oldest first).
    const series = [];
    for (let monthsBack = 11; monthsBack >= 0; monthsBack -= 1) {
      const from = monthStart(todayDate, monthsBack);
      const to = monthEnd(todayDate, monthsBack);
      const billed = await sumInvoicesInRange(ctx, from, to);
      const collected = await sumPaymentsInRange(ctx, from, to);
      series.push({
        month: labelFor(from),
        from,
        to,
        billed: billed.total,
        collected,
        invoiceCount: billed.count,
      });
    }

    // Overdue: confirmed, past due date, still owing.
    const overdueRows = await ctx.db
      .query("invoices")
      .withIndex("by_status_due", (q) =>
        q.eq("status", "CONFIRMED").lt("dueDate", todayDate),
      )
      .take(5000);
    const overdueRowsWithBalance = overdueRows.filter((row) => row.amountDue > 0);
    const overdueAmount = overdueRowsWithBalance.reduce(
      (total, row) => total + row.amountDue,
      0,
    );

    const aging = { d1_30: 0, d31_60: 0, d61plus: 0 };
    for (const row of overdueRowsWithBalance) {
      const days = Math.round(
        (Date.parse(`${todayDate}T00:00:00Z`) - Date.parse(`${row.dueDate}T00:00:00Z`)) /
          86_400_000,
      );
      if (days <= 30) aging.d1_30 += row.amountDue;
      else if (days <= 60) aging.d31_60 += row.amountDue;
      else aging.d61plus += row.amountDue;
    }

    // MRR: every ACTIVE subscription's plan price normalised to a month.
    const active = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .take(5000);
    let mrr = 0;
    const planCache = new Map<string, Doc<"plans">>();
    for (const subscription of active) {
      let plan = planCache.get(subscription.planId);
      if (!plan) {
        const fetched = await ctx.db.get(subscription.planId);
        if (fetched) {
          planCache.set(subscription.planId, fetched);
          plan = fetched;
        }
      }
      if (!plan) continue;
      mrr += monthlyEquivalent(plan.price, plan.billingPeriod);
    }

    const [draftInvoices, runningRuns] = await Promise.all([
      ctx.db
        .query("invoices")
        .withIndex("by_status", (q) => q.eq("status", "DRAFT"))
        .take(1000),
      ctx.db
        .query("jobRuns")
        .withIndex("by_job", (q) => q.eq("jobName", "billing"))
        .order("desc")
        .take(1),
    ]);

    return {
      today: todayDate,
      billedThisMonth: billedThisMonth.total,
      invoiceCountThisMonth: billedThisMonth.count,
      collectedThisMonth,
      overdueAmount,
      overdueCount: overdueRowsWithBalance.length,
      mrr,
      activeSubscriptions: active.length,
      draftInvoices: draftInvoices.length,
      aging,
      series,
      lastRun: runningRuns[0] ?? null,
      dunningQueue: overdueRowsWithBalance
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 20)
        .map((row) => ({
          _id: row._id,
          number: row.number ?? "—",
          customerId: row.customerId,
          dueDate: row.dueDate,
          amountDue: row.amountDue,
          daysOverdue: Math.round(
            (Date.parse(`${todayDate}T00:00:00Z`) -
              Date.parse(`${row.dueDate}T00:00:00Z`)) /
              86_400_000,
          ),
        })),
    };
  },
});

/** Invoices issued in a month, for the drill-down table under the chart. */
export const monthlyInvoices = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    await requireStaff(ctx);
    const rows = await ctx.db
      .query("invoices")
      .withIndex("by_issue_date", (q) => q.gte("issueDate", from).lte("issueDate", to))
      .order("desc")
      .take(200);
    const out = [];
    for (const row of rows) {
      const customer = await ctx.db.get(row.customerId);
      out.push({
        _id: row._id,
        number: row.number ?? "—",
        status: row.status,
        total: row.total,
        amountDue: row.amountDue,
        issueDate: row.issueDate,
        customerName: customer?.name ?? "Unknown",
      });
    }
    return out;
  },
});

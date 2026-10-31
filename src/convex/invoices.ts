import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, nextSequenceValue, requireStaff, requireUser, today } from "./lib/authz";
import { ROLES } from "../shared/enums";
import { assertInvoiceTransition } from "../shared/stateMachine";

const optional = v.optional(v.string());

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: optional,
    customerId: optional,
    q: optional,
    overdue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const search = args.q?.trim();
    const status = args.status || undefined;
    const todayDate = today();

    let result;
    if (args.overdue) {
      result = await ctx.db
        .query("invoices")
        .withIndex("by_status_due", (q) =>
          q.eq("status", "CONFIRMED").lt("dueDate", todayDate),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (search) {
      result = await ctx.db
        .query("invoices")
        .withSearchIndex("search_invoices", (s) => {
          const filtered = s.search("searchText", search);
          return status
            ? filtered.eq("status", status as Doc<"invoices">["status"])
            : filtered;
        })
        .paginate(args.paginationOpts);
    } else if (status) {
      result = await ctx.db
        .query("invoices")
        .withIndex("by_status", (q) => q.eq("status", status as Doc<"invoices">["status"]))
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.customerId) {
      result = await ctx.db
        .query("invoices")
        .withIndex("by_customer", (q) =>
          q.eq("customerId", args.customerId as Id<"customers">),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("invoices")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    const page = [];
    for (const invoice of result.page) {
      const [customer, subscription] = await Promise.all([
        ctx.db.get(invoice.customerId),
        invoice.subscriptionId ? ctx.db.get(invoice.subscriptionId) : Promise.resolve(null),
      ]);
      page.push({
        ...invoice,
        customerName: customer?.name ?? "Unknown",
        subscriptionNumber: subscription?.number ?? "—",
        overdue:
          invoice.status === "CONFIRMED" &&
          invoice.amountDue > 0 &&
          invoice.dueDate < todayDate,
      });
    }
    return { ...result, page };
  },
});

export const detail = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const invoice = await ctx.db.get(id);
    if (!invoice) return null;

    const isStaff = user.role === ROLES.ADMIN || user.role === ROLES.INTERNAL;
    if (!isStaff) {
      const customer = await ctx.db.get(invoice.customerId);
      if (!customer || customer.userId !== user._id) throw new Error("Invoice not found.");
    }

    const [lines, payments, subscription, customer] = await Promise.all([
      ctx.db
        .query("invoiceLines")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", id))
        .collect(),
      ctx.db
        .query("payments")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", id))
        .collect(),
      invoice.subscriptionId ? ctx.db.get(invoice.subscriptionId) : Promise.resolve(null),
      ctx.db.get(invoice.customerId),
    ]);

    const todayDate = today();
    const canConfirm = isStaff && invoice.status === "DRAFT";
    const canCancel =
      isStaff &&
      (invoice.status === "DRAFT" ||
        (invoice.status === "CONFIRMED" && payments.length === 0 && invoice.amountPaid === 0));
    const canPay = isStaff && invoice.status === "CONFIRMED" && invoice.amountDue > 0;

    return {
      invoice,
      lines: lines.sort((a, b) => a.description.localeCompare(b.description)),
      payments: payments.sort((a, b) => b.createdAt - a.createdAt),
      subscription,
      customer: customer ?? null,
      isStaff,
      canConfirm,
      canCancel,
      canPay,
      overdue:
        invoice.status === "CONFIRMED" &&
        invoice.amountDue > 0 &&
        invoice.dueDate < todayDate,
      daysOverdue:
        invoice.status === "CONFIRMED" && invoice.amountDue > 0 && invoice.dueDate < todayDate
          ? Math.round(
              (Date.parse(`${todayDate}T00:00:00Z`) - Date.parse(`${invoice.dueDate}T00:00:00Z`)) /
                86_400_000,
            )
          : 0,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export const confirm = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    const actor = await requireStaff(ctx);
    const invoice = await ctx.db.get(id);
    if (!invoice) throw new Error("Invoice not found.");
    assertInvoiceTransition(invoice.status, "CONFIRMED");
    if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be confirmed.");

    const { number } = await nextSequenceValue(ctx, "INV");
    await ctx.db.patch(id, {
      status: "CONFIRMED",
      number,
      confirmedAt: Date.now(),
    });
    await audit(ctx, {
      actor,
      action: "invoice.confirm",
      entityType: "invoices",
      entityId: id,
      before: { status: "DRAFT" },
      after: { status: "CONFIRMED", number },
    });
    return { id, number };
  },
});

export const cancel = mutation({
  args: { id: v.id("invoices"), reason: optional },
  handler: async (ctx, { id, reason }) => {
    const actor = await requireStaff(ctx);
    const invoice = await ctx.db.get(id);
    if (!invoice) throw new Error("Invoice not found.");
    assertInvoiceTransition(invoice.status, "CANCELLED");

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", id))
      .collect();
    if (payments.length > 0 || invoice.amountPaid > 0) {
      throw new Error(
        "This invoice has payments recorded. Paid invoices cannot be cancelled.",
      );
    }

    // Free the (subscription, period) slot so billing may regenerate it.
    const periodKey = `${invoice.subscriptionId ?? "ad-hoc"}|${invoice.periodStart ?? ""}|cancelled|${id}`;
    await ctx.db.patch(id, {
      status: "CANCELLED",
      cancelledAt: Date.now(),
      periodKey,
    });

    // Reverse any discount redemptions this invoice consumed.
    const redemptions = await ctx.db
      .query("discountRedemptions")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", id))
      .collect();
    for (const redemption of redemptions) {
      if (redemption.reversedAt) continue;
      await ctx.db.patch(redemption._id, { reversedAt: Date.now() });
      const discount = await ctx.db.get(redemption.discountId);
      if (discount && discount.usedCount > 0) {
        await ctx.db.patch(discount._id, { usedCount: discount.usedCount - 1 });
      }
    }

    await audit(ctx, {
      actor,
      action: "invoice.cancel",
      entityType: "invoices",
      entityId: id,
      before: { status: invoice.status, total: invoice.total },
      after: { status: "CANCELLED", reason: reason ?? null },
    });
    return { id, status: "CANCELLED" as const };
  },
});

/** Aging buckets for the finance dashboard. */
export const aging = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const todayDate = today();
    const rows = await ctx.db
      .query("invoices")
      .withIndex("by_status_due", (q) =>
        q.eq("status", "CONFIRMED").lt("dueDate", todayDate),
      )
      .take(5000);

    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61plus: 0 } as Record<string, number>;
    for (const row of rows) {
      if (row.amountDue <= 0) continue;
      const days = Math.round(
        (Date.parse(`${todayDate}T00:00:00Z`) - Date.parse(`${row.dueDate}T00:00:00Z`)) /
          86_400_000,
      );
      if (days <= 0) buckets.current += row.amountDue;
      else if (days <= 30) buckets.d1_30 += row.amountDue;
      else if (days <= 60) buckets.d31_60 += row.amountDue;
      else buckets.d61plus += row.amountDue;
    }
    return buckets;
  },
});

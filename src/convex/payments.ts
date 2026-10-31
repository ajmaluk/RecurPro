import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { audit, requireStaff, today } from "./lib/authz";
import { parseRupeesToPaise } from "../shared/money";
import { parseOrThrow, paymentSchema } from "../shared/validation";

const optional = v.optional(v.string());

/**
 * Record a payment against a CONFIRMED invoice.
 *
 * Rules (documented in docs/DECISIONS.md):
 *  - partial payments and multiple payments per invoice are allowed
 *  - overpayment is **rejected** (no silent customer credit in v1)
 *  - `${method}|${reference}` has a unique index, so the same bank
 *    transaction cannot be entered twice
 *  - `amount_paid` / `amount_due` are recalculated in the same transaction,
 *    and the invoice flips to PAID the moment due hits zero
 *  - payments are append-only; corrections are a new reversing flow later
 */
export const record = mutation({
  args: {
    invoiceId: v.id("invoices"),
    method: v.string(),
    amount: v.string(),
    paidOn: v.string(),
    reference: optional,
    note: optional,
  },
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    const data = parseOrThrow(paymentSchema, args);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status === "DRAFT") {
      throw new Error("Confirm the invoice before recording payments against it.");
    }
    if (invoice.status === "CANCELLED") {
      throw new Error("Cancelled invoices cannot receive payments.");
    }

    const amount = parseRupeesToPaise(data.amount);
    if (amount === null || amount <= 0) throw new Error("Enter a valid payment amount.");
    if (amount > invoice.amountDue) {
      throw new Error(
        `That is more than the ₹${(invoice.amountDue / 100).toFixed(2)} still due on this invoice.`,
      );
    }

    const reference = data.reference?.trim();
    const referenceKey = reference ? `${data.method}|${reference}` : undefined;
    if (referenceKey) {
      const duplicate = await ctx.db
        .query("payments")
        .withIndex("by_reference", (q) => q.eq("referenceKey", referenceKey))
        .first();
      if (duplicate) {
        throw new Error(
          `A ${data.method} payment with reference "${reference}" has already been recorded.`,
        );
      }
    }

    const now = Date.now();
    const paymentId = await ctx.db.insert("payments", {
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      method: data.method as Doc<"payments">["method"],
      amount,
      paidOn: data.paidOn,
      reference: reference || undefined,
      referenceKey,
      note: data.note?.trim() || undefined,
      recordedBy: actor._id,
      createdAt: now,
    });

    const amountPaid = invoice.amountPaid + amount;
    const amountDue = invoice.total - amountPaid;
    const patch: Partial<Doc<"invoices">> = { amountPaid, amountDue };
    if (amountDue === 0) {
      patch.status = "PAID";
    }
    await ctx.db.patch(invoice._id, patch);

    await audit(ctx, {
      actor,
      action: "payment.record",
      entityType: "payments",
      entityId: paymentId,
      after: {
        invoiceNumber: invoice.number,
        method: data.method,
        amount,
        paidOn: data.paidOn,
        reference: reference ?? null,
      },
    });

    return { paymentId, amountPaid, amountDue, status: amountDue === 0 ? "PAID" : invoice.status };
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    invoiceId: optional,
    customerId: optional,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    if (args.invoiceId) {
      const rows = await ctx.db
        .query("payments")
        .withIndex("by_invoice", (q) =>
          q.eq("invoiceId", args.invoiceId as Doc<"payments">["invoiceId"]),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return await enrich(ctx, rows);
    }
    if (args.customerId) {
      const rows = await ctx.db
        .query("payments")
        .withIndex("by_customer", (q) =>
          q.eq("customerId", args.customerId as Doc<"payments">["customerId"]),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return await enrich(ctx, rows);
    }
    const rows = await ctx.db.query("payments").order("desc").paginate(args.paginationOpts);
    return await enrich(ctx, rows);
  },
});

async function enrich(
  ctx: QueryCtx,
  result: PaginationResult<Doc<"payments">>,
): Promise<
  PaginationResult<
    Doc<"payments"> & { invoiceNumber: string; customerName: string }
  >
> {
  const page = [];
  for (const row of result.page) {
    const [invoice, customer] = await Promise.all([
      ctx.db.get(row.invoiceId),
      ctx.db.get(row.customerId),
    ]);
    page.push({
      ...row,
      invoiceNumber: invoice?.number ?? "Draft",
      customerName: customer?.name ?? "Unknown",
    });
  }
  return { ...result, page };
}

export const totalsFor = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, { invoiceId }) => {
    await requireStaff(ctx);
    const rows = await ctx.db
      .query("payments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
      .collect();
    const paidOnDates = rows.map((row) => row.paidOn).sort();
    return {
      count: rows.length,
      paid: rows.reduce((total, row) => total + row.amount, 0),
      lastPaidOn:
        paidOnDates.length > 0 ? paidOnDates[paidOnDates.length - 1] : null,
      today: today(),
    };
  },
});

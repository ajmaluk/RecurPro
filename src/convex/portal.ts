/**
 * Customer portal: every query here is scoped to the signed-in user's own
 * customer row. There is no `customerId` argument to tamper with — ownership
 * is resolved server-side from the session.
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ROLES } from "../shared/enums";
import { customerForUser, requireUser } from "./lib/authz";

async function myCustomer(ctx: QueryCtx) {
  const user = await requireUser(ctx);
  if (user.role !== ROLES.CUSTOMER) {
    throw new Error("This area is for customer accounts only.");
  }
  const customer = await customerForUser(ctx, user);
  if (!customer) {
    throw new Error("No customer profile is linked to this account yet.");
  }
  return { user, customer };
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    const { user, customer } = await myCustomer(ctx);
    return {
      name: user.name ?? customer.name,
      email: user.email ?? customer.email,
      company: customer.company ?? null,
      phone: customer.phone ?? null,
      address: customer.address ?? null,
      taxId: customer.taxId ?? null,
      customerId: customer._id,
    };
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { customer } = await myCustomer(ctx);
    const [subscriptions, invoices] = await Promise.all([
      ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
        .order("desc")
        .take(50),
    ]);

    const live = subscriptions.filter(
      (row) => row.status === "ACTIVE" || row.status === "PAUSED" || row.status === "CONFIRMED",
    );
    const outstanding = invoices
      .filter((row) => row.status === "CONFIRMED" && row.amountDue > 0)
      .reduce((total, row) => total + row.amountDue, 0);
    const upcoming = live
      .filter((row) => row.nextInvoiceDate)
      .sort((a, b) => (a.nextInvoiceDate ?? "").localeCompare(b.nextInvoiceDate ?? ""))[0];

    return {
      activeCount: live.length,
      totalSubscriptions: subscriptions.length,
      outstanding,
      upcomingInvoiceDate: upcoming?.nextInvoiceDate ?? null,
      upcomingPlanName: upcoming ? (await ctx.db.get(upcoming.planId))?.name ?? null : null,
      recentInvoices: await Promise.all(
        invoices.slice(0, 5).map(async (invoice) => ({
          _id: invoice._id,
          number: invoice.number ?? "—",
          status: invoice.status,
          total: invoice.total,
          amountDue: invoice.amountDue,
          issueDate: invoice.issueDate,
        })),
      ),
    };
  },
});

export const subscriptions = query({
  args: {},
  handler: async (ctx) => {
    const { customer } = await myCustomer(ctx);
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const out = [];
    for (const row of rows) {
      const [plan, lines] = await Promise.all([
        ctx.db.get(row.planId),
        ctx.db
          .query("subscriptionLines")
          .withIndex("by_subscription", (q) => q.eq("subscriptionId", row._id))
          .collect(),
      ]);
      out.push({
        ...row,
        planName: plan?.name ?? "—",
        planPeriod: plan?.billingPeriod ?? "MONTHLY",
        planPrice: plan?.price ?? 0,
        lines: lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const invoices = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { customer } = await myCustomer(ctx);
    const status = args.status ?? undefined;
    const result = status
      ? await ctx.db
          .query("invoices")
          .withIndex("by_customer_status", (q) =>
            q
              .eq("customerId", customer._id)
              .eq("status", status as Doc<"invoices">["status"]),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("invoices")
          .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
          .order("desc")
          .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.map((invoice) => ({
        _id: invoice._id,
        number: invoice.number ?? "—",
        status: invoice.status,
        total: invoice.total,
        amountDue: invoice.amountDue,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
      })),
    };
  },
});

export const invoiceDetail = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, { id }) => {
    const { customer } = await myCustomer(ctx);
    const invoice = await ctx.db.get(id);
    if (!invoice || invoice.customerId !== customer._id) {
      throw new Error("Invoice not found.");
    }
    const lines = await ctx.db
      .query("invoiceLines")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", id))
      .collect();
    return {
      invoice,
      lines: lines.sort((a, b) => a.description.localeCompare(b.description)),
    };
  },
});

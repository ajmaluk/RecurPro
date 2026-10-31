import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireStaff } from "./lib/authz";
import { customerSchema, parseOrThrow } from "../shared/validation";

const optional = v.optional(v.string());

/** Empty form fields are stored as absent, never as "" placeholders. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function searchTextFor(args: {
  name: string;
  email: string;
  company?: string;
}): Promise<string> {
  return `${args.name} ${args.email} ${args.company ?? ""}`.toLowerCase();
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    q: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, q }) => {
    await requireStaff(ctx);
    const search = q?.trim();
    if (search) {
      return await ctx.db
        .query("customers")
        .withSearchIndex("search_customers", (s) =>
          s.search("searchText", search).eq("isActive", true),
        )
        .paginate(paginationOpts);
    }
    return await ctx.db
      .query("customers")
      .withIndex("by_name")
      .paginate(paginationOpts);
  },
});

/** Compact picker list for the subscription wizard. */
export const options = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("customers")
      .withIndex("by_name")
      .filter((f) => f.eq(f.field("isActive"), true))
      .take(500)
      .then((rows) =>
        rows.map((row) => ({
          _id: row._id,
          name: row.name,
          email: row.email,
          company: row.company,
        })),
      );
  },
});

export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: optional,
    company: optional,
    taxId: optional,
    addressLine: optional,
    city: optional,
    state: optional,
    pincode: optional,
  },
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    const data = parseOrThrow(customerSchema, args);

    const existing = await ctx.db
      .query("customers")
      .withIndex("by_email", (q) => q.eq("email", data.email))
      .first();
    if (existing) {
      throw new Error(`A customer with the email ${data.email} already exists.`);
    }

    const id = await ctx.db.insert("customers", {
      name: data.name,
      email: data.email,
      phone: clean(data.phone),
      company: clean(data.company),
      taxId: clean(data.taxId),
      address: {
        line1: clean(data.addressLine),
        city: clean(data.city),
        state: clean(data.state),
        pincode: clean(data.pincode),
      },
      isActive: true,
      searchText: await searchTextFor(data),
      createdBy: actor._id,
      createdAt: Date.now(),
    });
    await audit(ctx, {
      actor,
      action: "customer.create",
      entityType: "customers",
      entityId: id,
      after: { name: data.name, email: data.email },
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("customers"),
    name: v.string(),
    email: v.string(),
    phone: optional,
    company: optional,
    taxId: optional,
    addressLine: optional,
    city: optional,
    state: optional,
    pincode: optional,
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    const data = parseOrThrow(customerSchema, args);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Customer not found.");

    if (data.email !== before.email) {
      const clash = await ctx.db
        .query("customers")
        .withIndex("by_email", (q) => q.eq("email", data.email))
        .first();
      if (clash && clash._id !== args.id) {
        throw new Error(`A customer with the email ${data.email} already exists.`);
      }
    }

    await ctx.db.patch(args.id, {
      name: data.name,
      email: data.email,
      phone: clean(data.phone),
      company: clean(data.company),
      taxId: clean(data.taxId),
      address: {
        line1: clean(data.addressLine),
        city: clean(data.city),
        state: clean(data.state),
        pincode: clean(data.pincode),
      },
      isActive: args.isActive ?? before.isActive,
      searchText: await searchTextFor(data),
    });
    await audit(ctx, {
      actor,
      action: "customer.update",
      entityType: "customers",
      entityId: args.id,
      before: { name: before.name, email: before.email, isActive: before.isActive },
      after: { name: data.name, email: data.email },
    });
    return args.id;
  },
});

/** Detail view with the numbers finance asks for on every customer page. */
export const detail = query({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }): Promise<{
    customer: Doc<"customers">;
    activeSubscriptions: number;
    openInvoices: number;
    outstanding: number;
  } | null> => {
    await requireStaff(ctx);
    const customer = await ctx.db.get(id);
    if (!customer) return null;

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", id))
      .collect();
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", id))
      .collect();

    let outstanding = 0;
    let openInvoices = 0;
    for (const invoice of invoices) {
      if (invoice.status === "CANCELLED") continue;
      outstanding += invoice.amountDue;
      if (invoice.amountDue > 0 && invoice.status !== "PAID") openInvoices += 1;
    }

    return {
      customer,
      activeSubscriptions: subscriptions.filter(
        (subscription) =>
          subscription.status === "ACTIVE" || subscription.status === "PAUSED",
      ).length,
      openInvoices,
      outstanding,
    };
  },
});

/**
 * Portal bootstrap: make sure the signed-in user has exactly one customer row,
 * adopting an existing row with the same email (staff-created before signup).
 */
export const ensureForUser = mutation({
  args: {},
  handler: async (ctx): Promise<Id<"customers">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("You need to sign in to do that.");
    const user = await ctx.db.get(userId);
    if (!user?.email) throw new Error("Your account has no email address.");

    const linked = await ctx.db
      .query("customers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (linked) return linked._id;

    const email = user.email.toLowerCase();
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { userId });
      return existing._id;
    }

    const name = user.name?.trim() || email.split("@")[0];
    return await ctx.db.insert("customers", {
      userId,
      name,
      email,
      isActive: true,
      searchText: `${name} ${email}`.toLowerCase(),
      createdAt: Date.now(),
    });
  },
});

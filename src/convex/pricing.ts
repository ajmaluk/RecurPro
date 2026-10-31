import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireAdmin, requireStaff } from "./lib/authz";
import { parseRupeesToPaise } from "../shared/money";
import { percentToBps } from "../shared/pricing";
import { discountSchema, parseOrThrow, taxSchema } from "../shared/validation";

const optional = v.optional(v.string());

/* ------------------------------------------------------------------ */
/* Taxes — admin writes, staff reads                                   */
/* ------------------------------------------------------------------ */

export const listTaxes = query({
  args: {},
  handler: async (ctx): Promise<Doc<"taxes">[]> => {
    await requireStaff(ctx);
    return await ctx.db.query("taxes").collect();
  },
});

export const createTax = mutation({
  args: {
    name: v.string(),
    type: v.string(),
    value: v.string(),
    isInclusive: v.boolean(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(taxSchema, args);
    const value =
      data.type === "PERCENT"
        ? percentToBps(Number(data.value))
        : parseRupeesToPaise(data.value);
    if (value === null || value === undefined) throw new Error("Enter a valid tax value.");

    const id = await ctx.db.insert("taxes", {
      name: data.name,
      type: data.type,
      value,
      isInclusive: data.isInclusive,
      isActive: data.isActive,
      createdBy: actor._id,
    });
    await audit(ctx, {
      actor,
      action: "tax.create",
      entityType: "taxes",
      entityId: id,
      after: { name: data.name, type: data.type, value, isInclusive: data.isInclusive },
    });
    return id;
  },
});

export const updateTax = mutation({
  args: {
    id: v.id("taxes"),
    name: v.string(),
    type: v.string(),
    value: v.string(),
    isInclusive: v.boolean(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(taxSchema, args);
    const value =
      data.type === "PERCENT"
        ? percentToBps(Number(data.value))
        : parseRupeesToPaise(data.value);
    if (value === null || value === undefined) throw new Error("Enter a valid tax value.");
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Tax not found.");

    await ctx.db.patch(args.id, {
      name: data.name,
      type: data.type,
      value,
      isInclusive: data.isInclusive,
      isActive: data.isActive,
    });
    await audit(ctx, {
      actor,
      action: "tax.update",
      entityType: "taxes",
      entityId: args.id,
      before: { name: before.name, value: before.value, isActive: before.isActive },
      after: { name: data.name, value, isActive: data.isActive },
    });
    return args.id;
  },
});

/* ------------------------------------------------------------------ */
/* Discounts — admin only                                              */
/* ------------------------------------------------------------------ */

export const listDiscounts = query({
  args: {},
  handler: async (ctx): Promise<Doc<"discounts">[]> => {
    await requireStaff(ctx);
    return await ctx.db.query("discounts").collect();
  },
});

const discountArgs = {
  name: v.string(),
  type: v.string(),
  value: v.string(),
  minPurchase: optional,
  minQuantity: optional,
  startDate: optional,
  endDate: optional,
  usageLimit: optional,
  perCustomerLimit: optional,
  appliesTo: v.string(),
  productIds: v.array(v.string()),
  isActive: v.boolean(),
};

function numberOrUndefined(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function validateProductIds(
  ctx: { db: { get: (id: Id<"products">) => Promise<Doc<"products"> | null> } },
  ids: string[],
): Promise<Id<"products">[]> {
  const productIds: Id<"products">[] = [];
  for (const id of ids) {
    const product = await ctx.db.get(id as Id<"products">);
    if (!product) throw new Error("One of the selected products no longer exists.");
    productIds.push(product._id);
  }
  return productIds;
}

export const createDiscount = mutation({
  args: discountArgs,
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(discountSchema, args);
    const value =
      data.type === "PERCENTAGE"
        ? percentToBps(Number(data.value))
        : parseRupeesToPaise(data.value);
    if (value === null || value === undefined) throw new Error("Enter a valid discount value.");
    const productIds = await validateProductIds(ctx, data.productIds);

    const id = await ctx.db.insert("discounts", {
      name: data.name,
      type: data.type,
      value,
      minPurchase: data.minPurchase ? parseRupeesToPaise(data.minPurchase) ?? undefined : undefined,
      minQuantity: numberOrUndefined(data.minQuantity),
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      usageLimit: numberOrUndefined(data.usageLimit),
      perCustomerLimit: numberOrUndefined(data.perCustomerLimit),
      usedCount: 0,
      appliesTo: data.appliesTo,
      productIds,
      isActive: data.isActive,
      createdBy: actor._id,
    });
    await audit(ctx, {
      actor,
      action: "discount.create",
      entityType: "discounts",
      entityId: id,
      after: { name: data.name, type: data.type, value, usageLimit: data.usageLimit },
    });
    return id;
  },
});

export const updateDiscount = mutation({
  args: { id: v.id("discounts"), ...discountArgs },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(discountSchema, args);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Discount not found.");
    const value =
      data.type === "PERCENTAGE"
        ? percentToBps(Number(data.value))
        : parseRupeesToPaise(data.value);
    if (value === null || value === undefined) throw new Error("Enter a valid discount value.");
    const productIds = await validateProductIds(ctx, data.productIds);

    // usedCount is never lowered: redemptions already spent stay spent.
    const usageLimit = numberOrUndefined(data.usageLimit);
    if (usageLimit != null && before.usedCount > usageLimit) {
      throw new Error(
        `Already used ${before.usedCount} times, so the limit cannot be lowered below that.`,
      );
    }

    await ctx.db.patch(args.id, {
      name: data.name,
      type: data.type,
      value,
      minPurchase: data.minPurchase ? parseRupeesToPaise(data.minPurchase) ?? undefined : undefined,
      minQuantity: numberOrUndefined(data.minQuantity),
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      usageLimit: numberOrUndefined(data.usageLimit),
      perCustomerLimit: numberOrUndefined(data.perCustomerLimit),
      appliesTo: data.appliesTo,
      productIds,
      isActive: data.isActive,
    });
    await audit(ctx, {
      actor,
      action: "discount.update",
      entityType: "discounts",
      entityId: args.id,
      before: { name: before.name, value: before.value, isActive: before.isActive },
      after: { name: data.name, value, isActive: data.isActive },
    });
    return args.id;
  },
});

/** Redemption history shown on the discount screen. */
export const redemptions = query({
  args: { discountId: v.id("discounts") },
  handler: async (ctx, { discountId }) => {
    await requireStaff(ctx);
    const rows = await ctx.db
      .query("discountRedemptions")
      .withIndex("by_discount", (q) => q.eq("discountId", discountId))
      .collect();
    const invoices = await ctx.db.query("invoices").collect();
    const customers = await ctx.db.query("customers").collect();
    const invoiceNumbers = new Map(invoices.map((i) => [i._id, i.number ?? "Draft"]));
    const customerNames = new Map(customers.map((c) => [c._id, c.name]));
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        ...row,
        invoiceNumber: invoiceNumbers.get(row.invoiceId) ?? "—",
        customerName: customerNames.get(row.customerId) ?? "—",
      }));
  },
});

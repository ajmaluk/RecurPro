import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireAdmin, requireStaff } from "./lib/authz";
import { parseRupeesToPaise } from "../shared/money";
import { planSchema, parseOrThrow } from "../shared/validation";

const optional = v.optional(v.string());

function dayOrNull(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function planArgs() {
  return {
    name: v.string(),
    price: v.string(),
    billingPeriod: v.string(),
    minQuantity: v.number(),
    availableFrom: optional,
    availableTo: optional,
    autoCloseOnEnd: v.boolean(),
    closable: v.boolean(),
    pausable: v.boolean(),
    renewable: v.boolean(),
    isActive: v.boolean(),
  };
}

/** Every plan, including inactive ones (history must stay explainable). */
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<"plans">[]> => {
    await requireStaff(ctx);
    return await ctx.db.query("plans").collect();
  },
});

/** Only plans a new subscription may pick today (availability window honoured). */
export const selectable = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    await requireStaff(ctx);
    const plans = await ctx.db.query("plans").collect();
    return plans.filter(
      (plan) =>
        plan.isActive &&
        (!plan.availableFrom || plan.availableFrom <= today) &&
        (!plan.availableTo || plan.availableTo >= today),
    );
  },
});

export const paymentTerms = query({
  args: {},
  handler: async (ctx): Promise<Doc<"paymentTerms">[]> => {
    await requireStaff(ctx);
    return await ctx.db
      .query("paymentTerms")
      .withIndex("by_active")
      .collect();
  },
});

export const create = mutation({
  args: planArgs(),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(planSchema, args);
    const price = parseRupeesToPaise(data.price);
    if (price === null) throw new Error("Enter a valid price.");

    const id = await ctx.db.insert("plans", {
      name: data.name,
      price,
      billingPeriod: data.billingPeriod,
      minQuantity: data.minQuantity,
      availableFrom: dayOrNull(data.availableFrom),
      availableTo: dayOrNull(data.availableTo),
      autoCloseOnEnd: data.autoCloseOnEnd,
      closable: data.closable,
      pausable: data.pausable,
      renewable: data.renewable,
      isActive: data.isActive,
      createdBy: actor._id,
    });
    await audit(ctx, {
      actor,
      action: "plan.create",
      entityType: "plans",
      entityId: id,
      after: { name: data.name, price, billingPeriod: data.billingPeriod },
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("plans"), ...planArgs() },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(planSchema, args);
    const price = parseRupeesToPaise(data.price);
    if (price === null) throw new Error("Enter a valid price.");
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Plan not found.");

    await ctx.db.patch(args.id, {
      name: data.name,
      price,
      billingPeriod: data.billingPeriod,
      minQuantity: data.minQuantity,
      availableFrom: dayOrNull(data.availableFrom),
      availableTo: dayOrNull(data.availableTo),
      autoCloseOnEnd: data.autoCloseOnEnd,
      closable: data.closable,
      pausable: data.pausable,
      renewable: data.renewable,
      isActive: data.isActive,
    });
    await audit(ctx, {
      actor,
      action: "plan.update",
      entityType: "plans",
      entityId: args.id,
      before: { price: before.price, isActive: before.isActive, name: before.name },
      after: { price, isActive: data.isActive, name: data.name },
    });
    return args.id;
  },
});

export async function planById(
  ctx: { db: { get: (id: Id<"plans">) => Promise<Doc<"plans"> | null> } },
  id: Id<"plans">,
): Promise<Doc<"plans">> {
  const plan = await ctx.db.get(id);
  if (!plan) throw new Error("Plan not found.");
  return plan;
}

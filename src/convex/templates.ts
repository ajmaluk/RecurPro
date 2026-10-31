import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireAdmin, requireStaff } from "./lib/authz";
import { parseOrThrow, templateSchema } from "../shared/validation";

const lineValidator = v.object({
  productId: v.id("products"),
  variantId: v.string(),
  quantity: v.number(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const templates = await ctx.db.query("quotationTemplates").collect();
    const plans = await ctx.db.query("plans").collect();
    const planNames = new Map(plans.map((plan) => [plan._id, plan.name]));
    const lines = await ctx.db.query("templateLines").collect();
    const counts = new Map<Id<"quotationTemplates">, number>();
    for (const line of lines) {
      counts.set(line.templateId, (counts.get(line.templateId) ?? 0) + 1);
    }
    return templates
      .map((template) => ({
        ...template,
        planName: planNames.get(template.planId) ?? "Unknown plan",
        lineCount: counts.get(template._id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const detail = query({
  args: { id: v.id("quotationTemplates") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    const template = await ctx.db.get(id);
    if (!template) return null;
    const lines = await ctx.db
      .query("templateLines")
      .withIndex("by_template", (q) => q.eq("templateId", id))
      .collect();
    const products = await ctx.db.query("products").collect();
    const variants = await ctx.db.query("variants").collect();
    const productNames = new Map(products.map((p) => [p._id, p.name]));
    const variantNames = new Map(variants.map((v2) => [v2._id, v2.name]));

    return {
      template,
      lines: lines
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((line) => ({
          ...line,
          productName: productNames.get(line.productId) ?? "Unknown product",
          variantName: line.variantId
            ? variantNames.get(line.variantId) ?? null
            : null,
        })),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    validityDays: v.number(),
    planId: v.id("plans"),
    isActive: v.boolean(),
    lines: v.array(lineValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(templateSchema, args);
    const plan = await ctx.db.get(data.planId as Id<"plans">);
    if (!plan) throw new Error("Choose a valid plan.");

    const templateId = await ctx.db.insert("quotationTemplates", {
      name: data.name,
      validityDays: data.validityDays,
      planId: data.planId as Id<"plans">,
      isActive: data.isActive,
      createdBy: actor._id,
    });
    await insertLines(ctx, templateId, args.lines);
    await audit(ctx, {
      actor,
      action: "template.create",
      entityType: "quotationTemplates",
      entityId: templateId,
      after: { name: data.name, planId: data.planId, lines: args.lines.length },
    });
    return templateId;
  },
});

export const update = mutation({
  args: {
    id: v.id("quotationTemplates"),
    name: v.string(),
    validityDays: v.number(),
    planId: v.id("plans"),
    isActive: v.boolean(),
    lines: v.array(lineValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(templateSchema, args);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Template not found.");
    const plan = await ctx.db.get(data.planId as Id<"plans">);
    if (!plan) throw new Error("Choose a valid plan.");

    await ctx.db.patch(args.id, {
      name: data.name,
      validityDays: data.validityDays,
      planId: data.planId as Id<"plans">,
      isActive: data.isActive,
    });
    const existing = await ctx.db
      .query("templateLines")
      .withIndex("by_template", (q) => q.eq("templateId", args.id))
      .collect();
    for (const line of existing) await ctx.db.delete(line._id);
    await insertLines(ctx, args.id, args.lines);

    await audit(ctx, {
      actor,
      action: "template.update",
      entityType: "quotationTemplates",
      entityId: args.id,
      before: { name: before.name, validityDays: before.validityDays },
      after: { name: data.name, validityDays: data.validityDays },
    });
    return args.id;
  },
});

async function insertLines(
  ctx: { db: { insert: (table: "templateLines", value: any) => Promise<Id<"templateLines">> } },
  templateId: Id<"quotationTemplates">,
  lines: { productId: Id<"products">; variantId: string; quantity: number }[],
): Promise<void> {
  for (const [index, line] of lines.entries()) {
    await ctx.db.insert("templateLines", {
      templateId,
      productId: line.productId,
      variantId: line.variantId ? (line.variantId as Id<"variants">) : undefined,
      quantity: line.quantity,
      sortOrder: index,
    });
  }
}

/** Used by the subscription wizard to prefill a new quotation. */
export const linesFor = query({
  args: { id: v.id("quotationTemplates") },
  handler: async (ctx, { id }): Promise<Doc<"templateLines">[]> => {
    await requireStaff(ctx);
    return await ctx.db
      .query("templateLines")
      .withIndex("by_template", (q) => q.eq("templateId", id))
      .collect();
  },
});

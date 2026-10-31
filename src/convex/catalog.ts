import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, requireAdmin, requireStaff } from "./lib/authz";
import { ROLES } from "../shared/enums";
import { parseRupeesToPaise } from "../shared/money";
import { attributeSchema, parseOrThrow, productSchema, variantSchema } from "../shared/validation";

const optional = v.optional(v.string());

type Ctx = QueryCtx | MutationCtx;

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const listProducts = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireStaff(ctx);
    const isAdmin = actor.role === ROLES.ADMIN;

    const [products, variants, variantValues, attributeValues, attributes, productTaxes, taxes] =
      await Promise.all([
        ctx.db.query("products").collect(),
        ctx.db.query("variants").collect(),
        ctx.db.query("variantValues").collect(),
        ctx.db.query("attributeValues").collect(),
        ctx.db.query("attributes").collect(),
        ctx.db.query("productTaxes").collect(),
        ctx.db.query("taxes").collect(),
      ]);

    const extraByValue = new Map(attributeValues.map((row) => [row._id, row]));
    const attributeNames = new Map(attributes.map((row) => [row._id, row.name]));
    const taxNames = new Map(taxes.map((row) => [row._id, row.name]));
    const valuesByVariant = new Map<Id<"variants">, Id<"attributeValues">[]>();
    for (const row of variantValues) {
      const list = valuesByVariant.get(row.variantId) ?? [];
      list.push(row.attributeValueId);
      valuesByVariant.set(row.variantId, list);
    }

    return products
      .map((product) => {
        const ownVariants = variants.filter((variant) => variant.productId === product._id);

        return {
          ...product,
          // Cost price and margin are admin-only data.
          costPrice: isAdmin ? product.costPrice : null,
          margin: isAdmin ? product.salesPrice - product.costPrice : null,
          taxIds: productTaxes
            .filter((row) => row.productId === product._id)
            .map((row) => row.taxId),
          taxNames: productTaxes
            .filter((row) => row.productId === product._id)
            .map((row) => taxNames.get(row.taxId) ?? "Tax"),
          attributes: product.attributeIds.map((attributeId) => ({
            id: attributeId,
            name: attributeNames.get(attributeId) ?? "Attribute",
          })),
          variants: ownVariants.map((variant) => {
            const valueIds = valuesByVariant.get(variant._id) ?? [];
            const rows = valueIds
              .map((valueId) => extraByValue.get(valueId))
              .filter((row): row is NonNullable<typeof row> => Boolean(row));
            const extra = rows.reduce((total, row) => total + row.extraPrice, 0);
            const effectivePrice =
              variant.priceOverride ?? product.salesPrice + extra;
            return {
              ...variant,
              effectivePrice,
              attributeTotal: extra,
              values: rows.map((row) => ({
                attributeValueId: row._id,
                attributeId: row.attributeId,
                value: row.value,
                extraPrice: row.extraPrice,
                attributeName: attributeNames.get(row.attributeId) ?? "",
              })),
            };
          }),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listAttributes = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const attributes = await ctx.db.query("attributes").collect();
    const values = await ctx.db.query("attributeValues").collect();
    return attributes
      .map((attribute) => ({
        ...attribute,
        values: values
          .filter((row) => row.attributeId === attribute._id)
          .sort((a, b) => a.value.localeCompare(b.value)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Minimal catalogue for pickers (subscription wizard, invoice builder). */
export const productOptions = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const [products, variants, variantValues, attributeValues] = await Promise.all([
      ctx.db.query("products").collect(),
      ctx.db.query("variants").collect(),
      ctx.db.query("variantValues").collect(),
      ctx.db.query("attributeValues").collect(),
    ]);
    const extraByValue = new Map(attributeValues.map((row) => [row._id, row.extraPrice]));

    return products
      .filter((product) => product.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((product) => ({
        _id: product._id,
        name: product.name,
        basePrice: product.salesPrice,
        variants: variants
          .filter((variant) => variant.productId === product._id && variant.isActive)
          .map((variant) => {
            const rows = variantValues.filter((row) => row.variantId === variant._id);
            const extra = rows.reduce(
              (total, row) => total + (extraByValue.get(row.attributeValueId) ?? 0),
              0,
            );
            return {
              _id: variant._id,
              name: variant.name,
              sku: variant.sku,
              effectivePrice: variant.priceOverride ?? product.salesPrice + extra,
            };
          }),
      }));
  },
});

/* ------------------------------------------------------------------ */
/* Writes — admin only                                                 */
/* ------------------------------------------------------------------ */

function paise(value: string, label: string): number {
  const parsed = parseRupeesToPaise(value);
  if (parsed === null) throw new Error(`Enter a valid ${label}.`);
  return parsed;
}

export const createProduct = mutation({
  args: {
    name: v.string(),
    type: v.string(),
    salesPrice: v.string(),
    costPrice: v.string(),
    notes: optional,
    isActive: v.boolean(),
    attributeIds: v.array(v.string()),
    taxIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(productSchema, {
      name: args.name,
      type: args.type,
      salesPrice: args.salesPrice,
      costPrice: args.costPrice,
      notes: args.notes ?? "",
      isActive: args.isActive,
    });

    const id = await ctx.db.insert("products", {
      name: data.name,
      type: data.type,
      salesPrice: paise(data.salesPrice, "price"),
      costPrice: paise(data.costPrice, "cost price"),
      notes: args.notes?.trim() || undefined,
      isActive: data.isActive,
      attributeIds: args.attributeIds as Id<"attributes">[],
      createdBy: actor._id,
      createdAt: Date.now(),
    });
    await replaceProductTaxes(ctx, id, args.taxIds as Id<"taxes">[]);
    await audit(ctx, {
      actor,
      action: "product.create",
      entityType: "products",
      entityId: id,
      after: { name: data.name, salesPrice: data.salesPrice },
    });
    return id;
  },
});

export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.string(),
    type: v.string(),
    salesPrice: v.string(),
    costPrice: v.string(),
    notes: optional,
    isActive: v.boolean(),
    attributeIds: v.array(v.string()),
    taxIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Product not found.");
    const data = parseOrThrow(productSchema, {
      name: args.name,
      type: args.type,
      salesPrice: args.salesPrice,
      costPrice: args.costPrice,
      notes: args.notes ?? "",
      isActive: args.isActive,
    });

    await ctx.db.patch(args.id, {
      name: data.name,
      type: data.type,
      salesPrice: paise(data.salesPrice, "price"),
      costPrice: paise(data.costPrice, "cost price"),
      notes: args.notes?.trim() || undefined,
      isActive: data.isActive,
      attributeIds: args.attributeIds as Id<"attributes">[],
    });
    await replaceProductTaxes(ctx, args.id, args.taxIds as Id<"taxes">[]);
    await audit(ctx, {
      actor,
      action: "product.update",
      entityType: "products",
      entityId: args.id,
      before: { name: before.name, salesPrice: before.salesPrice, isActive: before.isActive },
      after: { name: data.name, isActive: data.isActive },
    });
    return args.id;
  },
});

export const createAttribute = mutation({
  args: {
    name: v.string(),
    values: v.array(v.object({ value: v.string(), extraPrice: v.string() })),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(attributeSchema, args);
    const attributeId = await ctx.db.insert("attributes", {
      name: data.name,
      createdBy: actor._id,
    });
    for (const value of data.values) {
      await ctx.db.insert("attributeValues", {
        attributeId,
        value: value.value,
        extraPrice: paise(value.extraPrice, "extra price"),
      });
    }
    await audit(ctx, {
      actor,
      action: "attribute.create",
      entityType: "attributes",
      entityId: attributeId,
      after: { name: data.name, values: data.values.length },
    });
    return attributeId;
  },
});

export const updateAttribute = mutation({
  args: {
    id: v.id("attributes"),
    name: v.string(),
    values: v.array(
      v.object({ id: optional, value: v.string(), extraPrice: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Attribute not found.");
    const data = parseOrThrow(attributeSchema, {
      name: args.name,
      values: args.values.map((row) => ({
        value: row.value,
        extraPrice: row.extraPrice,
      })),
    });

    await ctx.db.patch(args.id, { name: data.name });
    const existing = await ctx.db
      .query("attributeValues")
      .withIndex("by_attribute", (q) => q.eq("attributeId", args.id))
      .collect();
    const keptIds = new Set<string>();

    for (const value of data.values) {
      const match = args.values.find(
        (row) => row.value === value.value && row.id && !keptIds.has(row.id),
      );
      if (match?.id) {
        keptIds.add(match.id);
        await ctx.db.patch(match.id as Id<"attributeValues">, {
          value: value.value,
          extraPrice: paise(value.extraPrice, "extra price"),
        });
      } else {
        const created = await ctx.db.insert("attributeValues", {
          attributeId: args.id,
          value: value.value,
          extraPrice: paise(value.extraPrice, "extra price"),
        });
        keptIds.add(created);
      }
    }

    // Values removed by the admin are detached from variants (values stay
    // intact in history on any line that already priced them).
    for (const row of existing) {
      if (keptIds.has(row._id)) continue;
      const links = await ctx.db
        .query("variantValues")
        .filter((q) => q.eq(q.field("attributeValueId"), row._id))
        .collect();
      for (const link of links) await ctx.db.delete(link._id);
      await ctx.db.delete(row._id);
    }

    await audit(ctx, {
      actor,
      action: "attribute.update",
      entityType: "attributes",
      entityId: args.id,
      before: { name: before.name },
      after: { name: data.name, values: data.values.length },
    });
    return args.id;
  },
});

export const createVariant = mutation({
  args: {
    productId: v.id("products"),
    sku: v.string(),
    name: v.string(),
    priceOverride: optional,
    valueIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const data = parseOrThrow(variantSchema, args);
    await assertSkuFree(ctx, data.sku);

    const variantId = await ctx.db.insert("variants", {
      productId: args.productId,
      sku: data.sku,
      name: data.name,
      priceOverride: data.priceOverride
        ? paise(data.priceOverride, "price")
        : undefined,
      isActive: true,
      createdBy: actor._id,
    });
    await linkVariantValues(ctx, variantId, data.valueIds);
    await audit(ctx, {
      actor,
      action: "variant.create",
      entityType: "variants",
      entityId: variantId,
      after: { sku: data.sku, name: data.name, productId: args.productId },
    });
    return variantId;
  },
});

export const updateVariant = mutation({
  args: {
    id: v.id("variants"),
    sku: v.string(),
    name: v.string(),
    priceOverride: optional,
    valueIds: v.array(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new Error("Variant not found.");
    const data = parseOrThrow(variantSchema, args);
    if (data.sku !== before.sku) await assertSkuFree(ctx, data.sku);

    await ctx.db.patch(args.id, {
      sku: data.sku,
      name: data.name,
      priceOverride: data.priceOverride
        ? paise(data.priceOverride, "price")
        : undefined,
      isActive: args.isActive,
    });
    const existing = await ctx.db
      .query("variantValues")
      .withIndex("by_variant", (q) => q.eq("variantId", args.id))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    await linkVariantValues(ctx, args.id, data.valueIds);

    await audit(ctx, {
      actor,
      action: "variant.update",
      entityType: "variants",
      entityId: args.id,
      before: { sku: before.sku, name: before.name, isActive: before.isActive },
      after: { sku: data.sku, name: data.name, isActive: args.isActive },
    });
    return args.id;
  },
});

/* ------------------------------------------------------------------ */
/* Helpers used by subscriptions and the billing engine               */
/* ------------------------------------------------------------------ */

/**
 * Effective unit price: product sales price + the extra price of each
 * attribute value on the variant, unless the variant overrides it outright.
 * The Odoo brand (+₹560) is exactly this rule.
 */
export async function effectiveUnitPrice(
  ctx: Ctx,
  productId: Id<"products">,
  variantId?: Id<"variants"> | null,
): Promise<number> {
  const product = await ctx.db.get(productId);
  if (!product) throw new Error("Product not found.");
  if (!variantId) return product.salesPrice;

  const variant = await ctx.db.get(variantId);
  if (!variant) throw new Error("Variant not found.");
  if (variant.priceOverride !== undefined) return variant.priceOverride;

  const rows = await ctx.db
    .query("variantValues")
    .withIndex("by_variant", (q) => q.eq("variantId", variantId))
    .collect();
  let extra = 0;
  for (const row of rows) {
    const value = await ctx.db.get(row.attributeValueId);
    if (value) extra += value.extraPrice;
  }
  return product.salesPrice + extra;
}

/** Tax rules attached to a product, ready for the pricing engine. */
export async function taxRulesForProduct(
  ctx: Ctx,
  productId: Id<"products">,
): Promise<
  {
    id: string;
    name: string;
    type: "PERCENT" | "FIXED";
    rateBps?: number;
    amount?: number;
    isInclusive: boolean;
  }[]
> {
  const links = await ctx.db
    .query("productTaxes")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  const rules = [];
  for (const link of links) {
    const tax = await ctx.db.get(link.taxId);
    if (!tax || !tax.isActive) continue;
    rules.push({
      id: tax._id,
      name: tax.name,
      type: tax.type,
      rateBps: tax.type === "PERCENT" ? tax.value : undefined,
      amount: tax.type === "FIXED" ? tax.value : undefined,
      isInclusive: tax.isInclusive,
    });
  }
  return rules;
}

/* ------------------------------------------------------------------ */

async function assertSkuFree(ctx: Ctx, sku: string): Promise<void> {
  const existing = await ctx.db
    .query("variants")
    .withIndex("by_sku", (q) => q.eq("sku", sku))
    .first();
  if (existing) throw new Error(`The SKU "${sku}" is already used by another variant.`);
}

async function linkVariantValues(
  ctx: MutationCtx,
  variantId: Id<"variants">,
  valueIds: string[],
): Promise<void> {
  const seen = new Set<string>();
  for (const valueId of valueIds) {
    if (seen.has(valueId)) continue;
    seen.add(valueId);
    const value = await ctx.db.get(valueId as Id<"attributeValues">);
    if (!value) throw new Error("One of the selected attribute values is missing.");
    await ctx.db.insert("variantValues", {
      variantId,
      attributeValueId: value._id,
    });
  }
}

async function replaceProductTaxes(
  ctx: MutationCtx,
  productId: Id<"products">,
  taxIds: Id<"taxes">[],
): Promise<void> {
  const existing = await ctx.db
    .query("productTaxes")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  const keep = new Set(taxIds);
  for (const row of existing) {
    if (!keep.has(row.taxId)) await ctx.db.delete(row._id);
  }
  for (const taxId of taxIds) {
    if (existing.some((row) => row.taxId === taxId)) continue;
    const tax = await ctx.db.get(taxId);
    if (!tax) throw new Error("One of the selected taxes no longer exists.");
    await ctx.db.insert("productTaxes", { productId, taxId });
  }
}

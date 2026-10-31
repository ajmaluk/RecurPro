import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc as DocType, Id as IdType } from "./_generated/dataModel";
import {
  audit,
  nextSequenceValue,
  requireOwnCustomer,
  requireStaff,
  requireUser,
  today,
} from "./lib/authz";
import { ROLES } from "../shared/enums";
import {
  assertSubscriptionPrecondition,
  allowedSubscriptionTransitions,
} from "../shared/stateMachine";
import { addPeriod, isValidDay, periodEnd } from "../shared/periods";
import { parseRupeesToPaise } from "../shared/money";
import {
  computeInvoiceTotals,
  evaluateDiscount,
  type TaxRule,
} from "../shared/pricing";
import { parseOrThrow, daySchema, subscriptionSchema } from "../shared/validation";
import { effectiveUnitPrice, taxRulesForProduct } from "./catalog";
import { toDiscountRule } from "./lib/rules";

type Ctx = QueryCtx | MutationCtx;

const optional = v.optional(v.string());

const lineArgs = v.object({
  productId: v.id("products"),
  variantId: v.string(),
  description: v.string(),
  quantity: v.number(),
  unitPrice: v.string(), // rupees, as typed in the form
});

async function planOf(ctx: Ctx, planId: IdType<"plans">): Promise<DocType<"plans">> {
  const plan = await ctx.db.get(planId);
  if (!plan) throw new Error("Plan not found.");
  return plan;
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export const createFromTemplate = mutation({
  args: {
    templateId: v.id("quotationTemplates"),
    customerId: v.id("customers"),
    startDate: v.string(),
    expiryDate: v.string(),
    paymentTermId: v.id("paymentTerms"),
    discountId: optional,
  },
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    const startDate = parseOrThrow(daySchema, args.startDate);
    const expiryDate = parseOrThrow(daySchema, args.expiryDate);
    if (expiryDate < startDate) throw new Error("Expiry must be on or after the start date.");

    const customer = await ctx.db.get(args.customerId);
    if (!customer || !customer.isActive) throw new Error("Choose an active customer.");

    const template = await ctx.db.get(args.templateId);
    if (!template || !template.isActive) throw new Error("Choose an active quotation template.");

    const plan = await planOf(ctx, template.planId);
    const todayDate = today();
    if (plan.availableFrom && todayDate < plan.availableFrom) {
      throw new Error(`${plan.name} is only available from ${plan.availableFrom}.`);
    }
    if (plan.availableTo && todayDate > plan.availableTo) {
      throw new Error(`${plan.name} stopped being available on ${plan.availableTo}.`);
    }

    const paymentTerm = await ctx.db.get(args.paymentTermId);
    if (!paymentTerm) throw new Error("Choose payment terms.");

    if (args.discountId) {
      const discount = await ctx.db.get(args.discountId as IdType<"discounts">);
      if (!discount || !discount.isActive) throw new Error("That discount is no longer available.");
    }

    const templateLines = await ctx.db
      .query("templateLines")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();
    if (templateLines.length === 0) throw new Error("That template has no lines.");

    const { number } = await nextSequenceValue(ctx, "SUB");
    const now = Date.now();
    const subscriptionId = await ctx.db.insert("subscriptions", {
      number,
      customerId: customer._id,
      planId: plan._id,
      templateId: template._id,
      status: "DRAFT",
      startDate,
      expiryDate,
      nextInvoiceDate: startDate,
      paymentTermId: paymentTerm._id,
      discountId: args.discountId
        ? (args.discountId as IdType<"discounts">)
        : undefined,
      searchText: `${number} ${customer.name}`.toLowerCase(),
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, line] of templateLines.sort((a, b) => a.sortOrder - b.sortOrder).entries()) {
      const product = await ctx.db.get(line.productId);
      if (!product || !product.isActive) {
        throw new Error(`"${product?.name ?? "A template product"}" is no longer sold.`);
      }
      if (line.quantity < plan.minQuantity) {
        throw new Error(
          `${product.name} must be billed in quantities of at least ${plan.minQuantity} on ${plan.name}.`,
        );
      }
      const unitPrice = await effectiveUnitPrice(ctx, line.productId, line.variantId ?? null);
      const taxIds = (await taxRulesForProduct(ctx, line.productId)).map((tax) => tax.id);
      const variantLabel = line.variantId
        ? await variantName(ctx, line.variantId)
        : "";
      await ctx.db.insert("subscriptionLines", {
        subscriptionId,
        productId: line.productId,
        variantId: line.variantId ?? undefined,
        description: line.variantId
          ? `${product.name} — ${variantLabel}`
          : product.name,
        quantity: line.quantity,
        unitPrice,
        taxIds: taxIds as IdType<"taxes">[],
        sortOrder: index,
      });
    }

    await ctx.db.insert("subscriptionStatusHistory", {
      subscriptionId,
      fromStatus: undefined,
      toStatus: "DRAFT",
      changedBy: actor._id,
      changedByName: actor.name ?? actor.email,
      changedAt: now,
      reason: `Created from template “${template.name}”`,
    });
    await audit(ctx, {
      actor,
      action: "subscription.create",
      entityType: "subscriptions",
      entityId: subscriptionId,
      after: { number, customerId: customer._id, planId: plan._id, startDate, expiryDate },
    });
    return subscriptionId;
  },
});

async function variantName(ctx: Ctx, variantId: string): Promise<string> {
  const variant = await ctx.db.get(variantId as IdType<"variants">);
  return variant?.name ?? "";
}

/* ------------------------------------------------------------------ */
/* Draft editing                                                       */
/* ------------------------------------------------------------------ */

export const updateDraft = mutation({
  args: {
    id: v.id("subscriptions"),
    startDate: v.string(),
    expiryDate: v.string(),
    paymentTermId: v.id("paymentTerms"),
    discountId: optional,
    lines: v.array(lineArgs),
  },
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    const subscription = await ctx.db.get(args.id);
    if (!subscription) throw new Error("Subscription not found.");
    if (subscription.status !== "DRAFT" && subscription.status !== "QUOTATION") {
      throw new Error("Only drafts and quotations can be edited.");
    }

    const data = parseOrThrow(subscriptionSchema, {
      customerId: subscription.customerId,
      planId: subscription.planId,
      templateId: subscription.templateId ?? "",
      paymentTermId: args.paymentTermId,
      startDate: args.startDate,
      expiryDate: args.expiryDate,
      discountId: args.discountId ?? "",
      lines: args.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId ?? "",
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    });

    const plan = await planOf(ctx, subscription.planId);
    for (const line of data.lines) {
      if (line.quantity < plan.minQuantity) {
        const product = await ctx.db.get(line.productId as IdType<"products">);
        throw new Error(
          `${product?.name ?? "Every line"} must be billed in quantities of at least ${plan.minQuantity} on ${plan.name}.`,
        );
      }
    }
    if (args.discountId) {
      const discount = await ctx.db.get(args.discountId as IdType<"discounts">);
      if (!discount || !discount.isActive) throw new Error("That discount is no longer available.");
    }

    const existing = await ctx.db
      .query("subscriptionLines")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.id))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const [index, line] of data.lines.entries()) {
      const unitPrice = parseRupeesToPaise(line.unitPrice);
      if (unitPrice === null) throw new Error(`Invalid price for ${line.description}.`);
      const taxIds = (await taxRulesForProduct(ctx, line.productId as IdType<"products">)).map(
        (tax) => tax.id,
      );
      await ctx.db.insert("subscriptionLines", {
        subscriptionId: args.id,
        productId: line.productId as IdType<"products">,
        variantId: line.variantId ? (line.variantId as IdType<"variants">) : undefined,
        description: line.description,
        quantity: line.quantity,
        unitPrice,
        taxIds: taxIds as IdType<"taxes">[],
        sortOrder: index,
      });
    }

    await ctx.db.patch(args.id, {
      startDate: data.startDate,
      expiryDate: data.expiryDate,
      nextInvoiceDate: data.startDate,
      paymentTermId: data.paymentTermId as IdType<"paymentTerms">,
      discountId: data.discountId ? (data.discountId as IdType<"discounts">) : undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      actor,
      action: "subscription.update",
      entityType: "subscriptions",
      entityId: args.id,
      after: { startDate: data.startDate, expiryDate: data.expiryDate, lines: data.lines.length },
    });
    return args.id;
  },
});

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

export const transition = mutation({
  args: {
    id: v.id("subscriptions"),
    to: v.string(),
    reason: optional,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const subscription = await ctx.db.get(args.id);
    if (!subscription) throw new Error("Subscription not found.");

    const isStaff = user.role === ROLES.ADMIN || user.role === ROLES.INTERNAL;
    if (!isStaff) {
      // Customers may only ever move their own subscription.
      const { customer } = await requireOwnCustomer(ctx, subscription.customerId);
      if (customer.userId !== user._id) throw new Error("Subscription not found.");
    }

    const plan = await planOf(ctx, subscription.planId);
    const to = args.to as DocType<"subscriptions">["status"];
    const from = subscription.status;

    if (!isStaff) {
      const customerAllowed = new Set(
        ["PAUSED", "ACTIVE", "CLOSED"].filter((target) =>
          allowedSubscriptionTransitions(from).includes(target as typeof from),
        ),
      );
      if (!customerAllowed.has(to)) {
        throw new Error("The team has to make that change for you. Contact support.");
      }
    }

    assertSubscriptionPrecondition(from, to, {
      pausable: plan.pausable,
      closable: plan.closable,
      renewable: plan.renewable,
    });

    const now = Date.now();
    const patch: Partial<DocType<"subscriptions">> = { status: to, updatedAt: now };

    if (to === "ACTIVE") {
      if (subscription.startDate > today()) {
        throw new Error(
          `This subscription starts on ${subscription.startDate}; it can only activate on or after that date.`,
        );
      }
      patch.nextInvoiceDate = subscription.nextInvoiceDate ?? subscription.startDate;
      patch.pausedAt = undefined;
    }
    if (to === "PAUSED") patch.pausedAt = now;
    if (to === "CLOSED") {
      patch.closedAt = now;
      patch.closeReason = args.reason ?? undefined;
    }

    await ctx.db.patch(args.id, patch);
    await ctx.db.insert("subscriptionStatusHistory", {
      subscriptionId: args.id,
      fromStatus: from,
      toStatus: to,
      changedBy: user._id,
      changedByName: user.name ?? user.email,
      changedAt: now,
      reason: args.reason,
    });
    await audit(ctx, {
      actor: user,
      action: "subscription.transition",
      entityType: "subscriptions",
      entityId: args.id,
      before: { status: from },
      after: { status: to, reason: args.reason },
    });
    return { from, to };
  },
});

/* ------------------------------------------------------------------ */
/* Renewal                                                             */
/* ------------------------------------------------------------------ */

async function renewalPlan(
  ctx: Ctx,
  id: IdType<"subscriptions">,
  startDate: string,
) {
  const subscription = await ctx.db.get(id);
  if (!subscription) throw new Error("Subscription not found.");
  const plan = await planOf(ctx, subscription.planId);
  if (!plan.renewable) throw new Error(`${plan.name} does not support renewals.`);
  if (subscription.status !== "ACTIVE" && subscription.status !== "PAUSED") {
    throw new Error("Only active subscriptions can be renewed.");
  }
  const start = isValidDay(startDate) ? startDate : subscription.expiryDate;
  const customer = await ctx.db.get(subscription.customerId);
  const lines = await ctx.db
    .query("subscriptionLines")
    .withIndex("by_subscription", (q) => q.eq("subscriptionId", id))
    .collect();

  const proposedLines = [];
  for (const line of lines.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const product = await ctx.db.get(line.productId);
    // Renewals carry lines forward at *current* prices, not the old snapshot.
    const unitPrice = await effectiveUnitPrice(ctx, line.productId, line.variantId ?? null);
    const taxIds = (await taxRulesForProduct(ctx, line.productId)).map((tax) => tax.id);
    proposedLines.push({
      productId: line.productId,
      variantId: line.variantId ?? null,
      description: product?.name ?? line.description,
      quantity: line.quantity,
      unitPrice,
      taxIds,
      taxes: taxIds,
    });
  }

  return {
    subscription,
    plan,
    customer,
    startDate: start,
    expiryDate: addPeriod(start, plan.billingPeriod, 1),
    lines: proposedLines,
    templateId: subscription.templateId,
    paymentTermId: subscription.paymentTermId,
    discountId: subscription.discountId,
  };
}

/** Preview shown before a renewal is confirmed. */
export const renewalPreview = query({
  args: { id: v.id("subscriptions"), startDate: optional },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const plan = await renewalPlan(ctx, args.id, args.startDate ?? "");
    const taxRules: TaxRule[] = [];
    const pricedLines = [];
    for (const line of plan.lines) {
      const rules = await taxRulesForProduct(ctx, line.productId as IdType<"products">);
      taxRules.push(...rules);
      pricedLines.push({
        productId: line.productId as IdType<"products"> | null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxes: rules,
      });
    }
    const totals = computeInvoiceTotals(pricedLines, 0);
    return {
      startDate: plan.startDate,
      expiryDate: plan.expiryDate,
      planName: plan.plan.name,
      billingPeriod: plan.plan.billingPeriod,
      customerName: plan.customer?.name ?? "",
      lines: plan.lines.map((line) => ({
        ...line,
        taxIds: line.taxIds as IdType<"taxes">[],
        lineTotal: line.quantity * line.unitPrice,
      })),
      totals,
    };
  },
});

export const renew = mutation({
  args: { id: v.id("subscriptions"), startDate: optional },
  handler: async (ctx, args) => {
    const actor = await requireStaff(ctx);
    const plan = await renewalPlan(ctx, args.id, args.startDate ?? "");
    const { number } = await nextSequenceValue(ctx, "SUB");
    const now = Date.now();
    const customer = plan.customer;
    if (!customer) throw new Error("Customer not found.");

    const subscriptionId = await ctx.db.insert("subscriptions", {
      number,
      customerId: customer._id,
      planId: plan.plan._id,
      templateId: plan.templateId,
      status: "DRAFT",
      startDate: plan.startDate,
      expiryDate: plan.expiryDate,
      nextInvoiceDate: plan.startDate,
      paymentTermId: plan.paymentTermId,
      renewedFromId: plan.subscription._id,
      discountId: plan.discountId,
      searchText: `${number} ${customer.name}`.toLowerCase(),
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, line] of plan.lines.entries()) {
      await ctx.db.insert("subscriptionLines", {
        subscriptionId,
        productId: line.productId as IdType<"products">,
        variantId: line.variantId ? (line.variantId as IdType<"variants">) : undefined,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxIds: line.taxIds as IdType<"taxes">[],
        sortOrder: index,
      });
    }

    await ctx.db.insert("subscriptionStatusHistory", {
      subscriptionId,
      fromStatus: undefined,
      toStatus: "DRAFT",
      changedBy: actor._id,
      changedByName: actor.name ?? actor.email,
      changedAt: now,
      reason: `Renewal of ${plan.subscription.number}`,
    });
    await audit(ctx, {
      actor,
      action: "subscription.renew",
      entityType: "subscriptions",
      entityId: subscriptionId,
      after: { renewedFromId: plan.subscription._id, number },
    });
    return subscriptionId;
  },
});

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: optional,
    customerId: optional,
    q: optional,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const search = args.q?.trim();
    const status = args.status || undefined;

    if (search) {
      return await ctx.db
        .query("subscriptions")
        .withSearchIndex("search_subscriptions", (s) => {
          const filtered = s.search("searchText", search);
          return status
            ? filtered.eq("status", status as DocType<"subscriptions">["status"])
            : filtered;
        })
        .paginate(args.paginationOpts);
    }
    if (status) {
      return await ctx.db
        .query("subscriptions")
        .withIndex("by_status", (q) => q.eq("status", status as DocType<"subscriptions">["status"]))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    if (args.customerId) {
      return await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId as IdType<"customers">))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db.query("subscriptions").order("desc").paginate(args.paginationOpts);
  },
});

export const detail = query({
  args: { id: v.id("subscriptions") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const subscription = await ctx.db.get(id);
    if (!subscription) return null;

    const isStaff = user.role === ROLES.ADMIN || user.role === ROLES.INTERNAL;
    if (!isStaff) {
      const customer = await ctx.db.get(subscription.customerId);
      if (!customer || customer.userId !== user._id) throw new Error("Subscription not found.");
    }

    const [customer, plan, paymentTerm, history, invoices, discounts] = await Promise.all([
      ctx.db.get(subscription.customerId),
      ctx.db.get(subscription.planId),
      ctx.db.get(subscription.paymentTermId),
      ctx.db
        .query("subscriptionStatusHistory")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", id))
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", id))
        .collect(),
      ctx.db.query("discounts").collect(),
    ]);

    const rows = await ctx.db
      .query("subscriptionLines")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", id))
      .collect();

    const pricedLines = [];
    const lines = [];
    for (const line of rows.sort((a, b) => a.sortOrder - b.sortOrder)) {
      const [product, variant] = await Promise.all([
        ctx.db.get(line.productId),
        line.variantId ? ctx.db.get(line.variantId) : Promise.resolve(null),
      ]);
      const rules = await taxRulesForProduct(ctx, line.productId);
      pricedLines.push({
        productId: line.productId as IdType<"products"> | null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxes: rules,
      });
      lines.push({
        ...line,
        productName: product?.name ?? "Unknown product",
        variantName: variant?.name ?? null,
        lineTotal: line.quantity * line.unitPrice,
        currentPrice: await effectiveUnitPrice(ctx, line.productId, line.variantId ?? null),
      });
    }

    const todayDate = today();
    const attachedDiscount = subscription.discountId
      ? discounts.find((row) => row._id === subscription.discountId)
      : undefined;
    const lineGross = pricedLines.map((line) => line.quantity * line.unitPrice);
    const evaluation = attachedDiscount
      ? evaluateDiscount(toDiscountRule(attachedDiscount), {
          today: todayDate,
          subtotal: lineGross.reduce((total, gross) => total + gross, 0),
          totalQuantity: pricedLines.reduce((total, line) => total + line.quantity, 0),
          lineGross,
          lineProductIds: pricedLines.map((line) => line.productId),
        })
      : null;
    const totals = computeInvoiceTotals(
      pricedLines,
      evaluation?.eligible ? evaluation.amount : 0,
    );
    const transitions = (plan ? allowedSubscriptionTransitions(subscription.status) : []).map(
      (target) => {
        let allowed = true;
        let reason = "";
        if (!plan) allowed = false;
        if (target === "PAUSED" && !plan?.pausable) {
          allowed = false;
          reason = "This plan cannot be paused.";
        }
        if (target === "CLOSED" && subscription.status === "ACTIVE" && !plan?.closable) {
          allowed = false;
          reason = "This plan only closes at expiry.";
        }
        if (target === "ACTIVE" && subscription.startDate > todayDate) {
          allowed = false;
          reason = `Starts on ${subscription.startDate}.`;
        }
        if (!isStaff && !["PAUSED", "ACTIVE", "CLOSED"].includes(target)) allowed = false;
        if (isStaff && target === "CLOSED" && !plan?.closable && subscription.status === "ACTIVE") {
          allowed = false;
          reason = "This plan only closes at expiry.";
        }
        return { to: target, allowed, reason };
      },
    );

    return {
      subscription,
      customer: customer ?? null,
      plan: plan ?? null,
      paymentTerm: paymentTerm ?? null,
      lines,
      history: history.sort((a, b) => b.changedAt - a.changedAt),
      invoices: invoices
        .filter((invoice) => invoice.status !== "CANCELLED")
        .sort((a, b) => (b.periodStart ?? "").localeCompare(a.periodStart ?? "")),
      totals,
      transitions,
      isStaff,
      canRenew: Boolean(
        plan?.renewable &&
          isStaff &&
          (subscription.status === "ACTIVE" || subscription.status === "PAUSED"),
      ),
      periodEnd: plan ? periodEnd(subscription.startDate, plan.billingPeriod) : null,
      discountApplied: evaluation?.eligible
        ? { name: evaluation.discount.name, amount: evaluation.amount }
        : null,
    };
  },
});

/** Which subscriptions are due right now — powers the billing preview. */
export const dueForBilling = query({
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
    return due.map((subscription) => ({
      _id: subscription._id,
      number: subscription.number,
      nextInvoiceDate: subscription.nextInvoiceDate,
      customerId: subscription.customerId,
    }));
  },
});

export const historyFor = query({
  args: { id: v.id("subscriptions") },
  handler: async (ctx, { id }) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("subscriptionStatusHistory")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", id))
      .order("desc")
      .collect();
  },
});

/** Small helper used by the wizard to validate a raw date field. */
export const validateDate = query({
  args: { value: v.string() },
  handler: async (_ctx, { value }) => isValidDay(value),
});

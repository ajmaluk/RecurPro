import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { ROLES } from "../shared/enums";

/**
 * Exact validator unions, so document fields infer as literal unions rather
 * than plain `string` (these keep the shared enums as their single source).
 */
const productTypeValidator = v.union(
  v.literal("SERVICE"),
  v.literal("SOFTWARE"),
  v.literal("ADD_ON"),
  v.literal("PHYSICAL"),
);
const billingPeriodValidator = v.union(
  v.literal("DAILY"),
  v.literal("WEEKLY"),
  v.literal("MONTHLY"),
  v.literal("YEARLY"),
);
const taxTypeValidator = v.union(v.literal("PERCENT"), v.literal("FIXED"));
const discountTypeValidator = v.union(
  v.literal("FIXED"),
  v.literal("PERCENTAGE"),
);
const discountScopeValidator = v.union(
  v.literal("SUBSCRIPTION"),
  v.literal("PRODUCTS"),
);
const subscriptionStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("QUOTATION"),
  v.literal("CONFIRMED"),
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("CLOSED"),
);
const invoiceStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("CONFIRMED"),
  v.literal("PAID"),
  v.literal("CANCELLED"),
);
const paymentMethodValidator = v.union(
  v.literal("CASH"),
  v.literal("BANK_TRANSFER"),
  v.literal("UPI"),
  v.literal("CARD"),
  v.literal("CHEQUE"),
  v.literal("ONLINE"),
);

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.INTERNAL),
  v.literal(ROLES.CUSTOMER),
);
export type Role = Infer<typeof roleValidator>;

/**
 * Conventions
 * - Money: integer **paise** (never floats). Rupees only ever exist in forms.
 * - Calendar dates (billing days): `YYYY-MM-DD` strings in Asia/Kolkata.
 * - Timestamps: UTC epoch milliseconds.
 * - Anything referenced by financial records is deactivated, never deleted.
 */
const day = v.string(); // YYYY-MM-DD
const money = v.number(); // integer paise
const bps = v.number(); // basis points, e.g. 1800 = 18%

const address = v.optional(
  v.object({
    line1: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    pincode: v.optional(v.string()),
  }),
);

const schema = defineSchema(
  {
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),

      role: v.optional(roleValidator),
      /** Staff deactivated by an admin can no longer sign in or act. */
      isActive: v.optional(v.boolean()),
      phone: v.optional(v.string()),
      failedLoginCount: v.optional(v.number()),
      lockedUntil: v.optional(v.number()),
    }).index("email", ["email"]),

    customers: defineTable({
      userId: v.optional(v.id("users")),
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
      company: v.optional(v.string()),
      address: address,
      taxId: v.optional(v.string()),
      isActive: v.boolean(),
      /** Lowercased `name email company` for search-as-you-type. */
      searchText: v.string(),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_name", ["name"])
      .index("by_email", ["email"])
      .searchIndex("search_customers", {
        searchField: "searchText",
        filterFields: ["isActive"],
      }),

    /* ----------------------------- Catalog ----------------------------- */

    products: defineTable({
      name: v.string(),
      type: productTypeValidator,
      salesPrice: money,
      costPrice: money,
      notes: v.optional(v.string()),
      isActive: v.boolean(),
      /** Attributes this product can be configured with (e.g. Brand). */
      attributeIds: v.array(v.id("attributes")),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
    }).index("by_active", ["isActive"]),

    attributes: defineTable({
      name: v.string(),
      createdBy: v.optional(v.id("users")),
    }).index("by_name", ["name"]),

    attributeValues: defineTable({
      attributeId: v.id("attributes"),
      value: v.string(),
      /** Added to the product's sales price when a variant picks this value. */
      extraPrice: money,
    }).index("by_attribute", ["attributeId"]),

    variants: defineTable({
      productId: v.id("products"),
      sku: v.string(),
      name: v.string(),
      /** Overrides product price + attribute extra prices when set. */
      priceOverride: v.optional(money),
      isActive: v.boolean(),
      createdBy: v.optional(v.id("users")),
    })
      .index("by_product", ["productId"])
      .index("by_sku", ["sku"]),

    variantValues: defineTable({
      variantId: v.id("variants"),
      attributeValueId: v.id("attributeValues"),
    })
      .index("by_variant", ["variantId"])
      .index("by_variant_value", ["variantId", "attributeValueId"]),

    plans: defineTable({
      name: v.string(),
      price: money,
      billingPeriod: billingPeriodValidator,
      minQuantity: v.number(),
      availableFrom: v.optional(day),
      availableTo: v.optional(day),
      autoCloseOnEnd: v.boolean(),
      closable: v.boolean(),
      pausable: v.boolean(),
      renewable: v.boolean(),
      isActive: v.boolean(),
      createdBy: v.optional(v.id("users")),
    }).index("by_active", ["isActive"]),

    paymentTerms: defineTable({
      name: v.string(),
      dueDays: v.number(),
      isActive: v.boolean(),
    }).index("by_active", ["isActive"]),

    quotationTemplates: defineTable({
      name: v.string(),
      validityDays: v.number(),
      planId: v.id("plans"),
      isActive: v.boolean(),
      createdBy: v.optional(v.id("users")),
    }).index("by_plan", ["planId"]),

    templateLines: defineTable({
      templateId: v.id("quotationTemplates"),
      productId: v.id("products"),
      variantId: v.optional(v.id("variants")),
      quantity: v.number(),
      sortOrder: v.number(),
    }).index("by_template", ["templateId"]),

    /* --------------------------- Pricing rules -------------------------- */

    taxes: defineTable({
      name: v.string(),
      type: taxTypeValidator,
      /** PERCENT => basis points (900 = 9%). FIXED => paise. */
      value: v.number(),
      isInclusive: v.boolean(),
      isActive: v.boolean(),
      createdBy: v.optional(v.id("users")),
    }).index("by_active", ["isActive"]),

    productTaxes: defineTable({
      productId: v.id("products"),
      taxId: v.id("taxes"),
    })
      .index("by_product", ["productId"])
      .index("by_tax", ["taxId"])
      .index("by_product_tax", ["productId", "taxId"]),

    discounts: defineTable({
      name: v.string(),
      type: discountTypeValidator,
      /** FIXED => paise. PERCENTAGE => basis points (1000 = 10%). */
      value: v.number(),
      minPurchase: v.optional(money),
      minQuantity: v.optional(v.number()),
      startDate: v.optional(day),
      endDate: v.optional(day),
      usageLimit: v.optional(v.number()),
      perCustomerLimit: v.optional(v.number()),
      usedCount: v.number(),
      appliesTo: discountScopeValidator,
      productIds: v.array(v.id("products")),
      isActive: v.boolean(),
      createdBy: v.optional(v.id("users")),
    }).index("by_active", ["isActive"]),

    discountRedemptions: defineTable({
      discountId: v.id("discounts"),
      invoiceId: v.id("invoices"),
      customerId: v.id("customers"),
      amount: money,
      createdAt: v.number(),
      reversedAt: v.optional(v.number()),
    })
      .index("by_discount", ["discountId"])
      .index("by_invoice", ["invoiceId"])
      .index("by_customer_discount", ["customerId", "discountId"]),

    /* --------------------------- Subscriptions -------------------------- */

    subscriptions: defineTable({
      number: v.string(),
      customerId: v.id("customers"),
      planId: v.id("plans"),
      templateId: v.optional(v.id("quotationTemplates")),
      status: subscriptionStatusValidator,
      startDate: day,
      expiryDate: day,
      nextInvoiceDate: v.optional(day),
      paymentTermId: v.id("paymentTerms"),
      renewedFromId: v.optional(v.id("subscriptions")),
      discountId: v.optional(v.id("discounts")),
      pausedAt: v.optional(v.number()),
      closedAt: v.optional(v.number()),
      closeReason: v.optional(v.string()),
      /** Denormalised `${number} ${customer name}` for list search. */
      searchText: v.string(),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_number", ["number"])
      .searchIndex("search_subscriptions", {
        searchField: "searchText",
        filterFields: ["status"],
      })
      .index("by_status_next", ["status", "nextInvoiceDate"])
      .index("by_status", ["status"])
      .index("by_customer", ["customerId"])
      .index("by_plan", ["planId"])
      .index("by_expiry", ["expiryDate"]),

    subscriptionLines: defineTable({
      subscriptionId: v.id("subscriptions"),
      productId: v.id("products"),
      variantId: v.optional(v.id("variants")),
      description: v.string(),
      quantity: v.number(),
      /** Price snapshot: later catalog edits never rewrite history. */
      unitPrice: money,
      taxIds: v.array(v.id("taxes")),
      sortOrder: v.number(),
    }).index("by_subscription", ["subscriptionId"]),

    subscriptionStatusHistory: defineTable({
      subscriptionId: v.id("subscriptions"),
      fromStatus: v.optional(v.string()),
      toStatus: v.string(),
      changedBy: v.optional(v.id("users")),
      changedByName: v.optional(v.string()),
      changedAt: v.number(),
      reason: v.optional(v.string()),
    }).index("by_subscription", ["subscriptionId", "changedAt"]),

    /* ------------------------------ Billing ----------------------------- */

    invoices: defineTable({
      number: v.optional(v.string()),
      subscriptionId: v.optional(v.id("subscriptions")),
      customerId: v.id("customers"),
      status: invoiceStatusValidator,
      periodStart: v.optional(day),
      periodEnd: v.optional(day),
      /**
       * Idempotency key: `${subscriptionId}|${periodStart}` while the invoice
       * is live. On cancellation it is rewritten with a `|cancelled|` suffix
       * so the same period can be regenerated (mirrors the partial unique
       * constraint `UNIQUE (subscription_id, period_start) WHERE status <>
       * 'CANCELLED'` from the spec).
       */
      periodKey: v.string(),
      issueDate: day,
      dueDate: day,
      subtotal: money,
      discountTotal: money,
      taxTotal: money,
      total: money,
      amountPaid: money,
      amountDue: money,
      customerSnapshot: v.object({
        name: v.string(),
        email: v.string(),
        company: v.optional(v.string()),
        taxId: v.optional(v.string()),
        address: address,
      }),
      confirmedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      /** Denormalised `${number} ${customer name}` for list search. */
      searchText: v.string(),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
    })
      .index("by_period_key", ["periodKey"])
      .searchIndex("search_invoices", {
        searchField: "searchText",
        filterFields: ["status"],
      })
      .index("by_number", ["number"])
      .index("by_status", ["status"])
      .index("by_customer", ["customerId"])
      .index("by_customer_status", ["customerId", "status"])
      .index("by_status_due", ["status", "dueDate"])
      .index("by_issue_date", ["issueDate"])
      .index("by_subscription", ["subscriptionId"]),

    invoiceLines: defineTable({
      invoiceId: v.id("invoices"),
      productId: v.optional(v.id("products")),
      description: v.string(),
      quantity: v.number(),
      unitPrice: money,
      discountAmount: money,
      taxAmount: money,
      lineTotal: money,
      /** Frozen tax breakdown at the moment of generation. */
      taxes: v.array(
        v.object({
          taxId: v.optional(v.id("taxes")),
          name: v.string(),
          rateBps: bps,
          isInclusive: v.boolean(),
          amount: money,
        }),
      ),
    }).index("by_invoice", ["invoiceId"]),

    payments: defineTable({
      invoiceId: v.id("invoices"),
      customerId: v.id("customers"),
      method: paymentMethodValidator,
      amount: money,
      paidOn: day,
      reference: v.optional(v.string()),
      /** Unique when present: `${method}|${reference}`. */
      referenceKey: v.optional(v.string()),
      note: v.optional(v.string()),
      recordedBy: v.optional(v.id("users")),
      createdAt: v.number(),
    })
      .index("by_invoice", ["invoiceId"])
      .index("by_paid_on", ["paidOn"])
      .index("by_customer", ["customerId"])
      .index("by_reference", ["referenceKey"]),

    /* ------------------------------ Platform ---------------------------- */

    sequences: defineTable({
      key: v.string(),
      value: v.number(),
    }).index("by_key", ["key"]),

    auditLogs: defineTable({
      actorId: v.optional(v.id("users")),
      actorName: v.optional(v.string()),
      action: v.string(),
      entityType: v.string(),
      entityId: v.optional(v.string()),
      before: v.optional(v.any()),
      after: v.optional(v.any()),
      at: v.number(),
    })
      .index("by_entity", ["entityType", "entityId"])
      .index("by_at", ["at"]),

    jobRuns: defineTable({
      jobName: v.string(),
      status: v.union(v.literal("RUNNING"), v.literal("SUCCEEDED"), v.literal("FAILED")),
      runDate: day,
      dryRun: v.boolean(),
      triggeredBy: v.string(),
      processed: v.number(),
      created: v.number(),
      failed: v.number(),
      /** Subscriptions that could not advance, so batches never loop forever. */
      stuckIds: v.array(v.string()),
      /** Retry counter per subscription id; three failures makes it stuck. */
      attempts: v.optional(v.record(v.string(), v.number())),
      error: v.optional(v.string()),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
    }).index("by_job", ["jobName", "startedAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;

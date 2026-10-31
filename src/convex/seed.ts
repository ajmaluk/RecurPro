/**
 * Demo seed.
 *
 * Creates a realistic tenant: taxes, discounts, payment terms, plans, a
 * product catalog with attribute-based variants (₹5,000 + ₹560 = ₹5,560),
 * four customers, four subscriptions in different states, and several months
 * of history — real invoices produced by the *real* billing engine, some
 * confirmed and paid, one overdue, one still draft.
 *
 * Safety:
 *  - if any user exists, only an admin may run it
 *  - if the deployment is empty, the caller supplies the first admin credentials
 *  - it is a no-op if products already exist (never double-seeds)
 */
import { z } from "zod";
import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { nextSequenceValue, today } from "./lib/authz";
import { nextPeriodStart } from "../shared/periods";
import { ROLES } from "../shared/enums";
import { emailSchema, parseOrThrow, passwordSchema } from "../shared/validation";

const seedArgsSchema = z.object({
  adminName: z.string().trim().min(2, "Enter a name").max(80),
  adminEmail: emailSchema,
  adminPassword: passwordSchema,
});

const DEMO_CUSTOMER_PASSWORD = "Portal@2026";

/* ------------------------------- dates ------------------------------ */

function shiftDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

function shiftMonths(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + delta, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.toISOString().slice(0, 8)}${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/* ------------------------------- state ------------------------------ */

/**
 * Public, unauthenticated status used by the sign-in screen to decide whether
 * this deployment still needs its first account. Deliberately reveals no
 * counts and no emails.
 */
export const publicStatus = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(8);
    const hasAccount = users.some((row) => !row.isAnonymous);
    const products = await ctx.db.query("products").take(1);
    return { needsBootstrap: !hasAccount, seeded: products.length > 0 };
  },
});

export const seedState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(1000);
    const real = users.filter((row) => !row.isAnonymous);
    const admins = real.filter(
      (row) => row.role === ROLES.ADMIN && row.isActive !== false,
    );
    const products = await ctx.db.query("products").take(1);
    return {
      userCount: real.length,
      adminCount: admins.length,
      alreadySeeded: products.length > 0,
    };
  },
});

/* ------------------------------ the action -------------------------- */

export const seedDemo = action({
  args: {
    adminName: v.optional(v.string()),
    adminEmail: v.optional(v.string()),
    adminPassword: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    seeded: boolean;
    reason?: string;
    customers?: number;
    subscriptions?: number;
    invoices?: number;
    portalEmail?: string;
    portalPassword?: string;
  }> => {
    const state = await ctx.runQuery(internal.seed.seedState);

    if (state.userCount > 0) {
      // An existing account may only seed if it is an admin.
      await ctx.runQuery(internal.staff.requireAdminSelf);
    } else {
      const credentials = parseOrThrow(seedArgsSchema, {
        adminName: args.adminName?.trim() || "RecurPro Admin",
        adminEmail: args.adminEmail || "admin@recurpro.io",
        adminPassword: args.adminPassword || "Admin@2026",
      });
      await createAccount(ctx, {
        provider: "password",
        account: { id: credentials.adminEmail, secret: credentials.adminPassword },
        profile: {
          email: credentials.adminEmail,
          name: credentials.adminName,
          role: ROLES.ADMIN,
          isActive: true,
        },
      });
    }

    if (state.alreadySeeded) {
      return { seeded: false, reason: "Demo data already exists." };
    }

    // Demo portal logins (created here because only an action may call it).
    for (const customer of DEMO_CUSTOMERS) {
      const taken = await ctx.runQuery(internal.staff.emailTaken, { email: customer.email });
      if (taken) continue;
      await createAccount(ctx, {
        provider: "password",
        account: { id: customer.email, secret: DEMO_CUSTOMER_PASSWORD },
        profile: {
          email: customer.email,
          name: customer.name,
          role: ROLES.CUSTOMER,
          isActive: true,
        },
      });
    }

    const summary = await ctx.runMutation(internal.seed.apply, {});
    return {
      seeded: summary.seeded === true,
      reason: summary.reason,
      customers: summary.customers,
      subscriptions: summary.subscriptions,
      invoices: summary.invoices,
      portalEmail: summary.portalEmail,
      portalPassword: DEMO_CUSTOMER_PASSWORD,
    };
  },
});

/* ---------------------------- the data writes ------------------------ */

export const apply = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("products").take(1);
    if (existing.length > 0) return { seeded: false, reason: "already seeded" };

    const now = Date.now();
    const todayDate = today();

    /* --------------------------- pricing rules -------------------------- */

    const gst18 = await ctx.db.insert("taxes", {
      name: "GST 18%",
      type: "PERCENT",
      value: 1800,
      isInclusive: false,
      isActive: true,
    });
    const gstInclusive = await ctx.db.insert("taxes", {
      name: "GST 10% (price inclusive)",
      type: "PERCENT",
      value: 1000,
      isInclusive: true,
      isActive: true,
    });

    const loyalty = await ctx.db.insert("discounts", {
      name: "Loyalty ₹500 off",
      type: "FIXED",
      value: 50000,
      usedCount: 0,
      appliesTo: "SUBSCRIPTION",
      productIds: [],
      isActive: true,
      createdBy: undefined,
    });
    await ctx.db.insert("discounts", {
      name: "Monsoon 10%",
      type: "PERCENTAGE",
      value: 1000,
      minPurchase: 1500000,
      startDate: shiftMonths(todayDate, -1),
      endDate: shiftMonths(todayDate, 3),
      usedCount: 0,
      appliesTo: "SUBSCRIPTION",
      productIds: [],
      isActive: true,
    });

    const net0 = await ctx.db.insert("paymentTerms", {
      name: "Due on receipt",
      dueDays: 0,
      isActive: true,
    });
    const net7 = await ctx.db.insert("paymentTerms", {
      name: "Net 7",
      dueDays: 7,
      isActive: true,
    });
    await ctx.db.insert("paymentTerms", {
      name: "Net 15",
      dueDays: 15,
      isActive: true,
    });

    /* -------------------------------- plans ----------------------------- */

    const _dailyPlan = await ctx.db.insert("plans", {
      name: "Daily Pass",
      price: 4900,
      billingPeriod: "DAILY",
      minQuantity: 1,
      autoCloseOnEnd: true,
      closable: true,
      pausable: false,
      renewable: true,
      isActive: true,
    });
    const weeklyPlan = await ctx.db.insert("plans", {
      name: "Weekly Standard",
      price: 29900,
      billingPeriod: "WEEKLY",
      minQuantity: 1,
      autoCloseOnEnd: true,
      closable: true,
      pausable: true,
      renewable: true,
      isActive: true,
    });
    const monthlyPlan = await ctx.db.insert("plans", {
      name: "Monthly Standard",
      price: 149900,
      billingPeriod: "MONTHLY",
      minQuantity: 1,
      autoCloseOnEnd: false,
      closable: true,
      pausable: true,
      renewable: true,
      isActive: true,
    });
    const yearlyPlan = await ctx.db.insert("plans", {
      name: "Annual Growth",
      price: 1499900,
      billingPeriod: "YEARLY",
      minQuantity: 1,
      autoCloseOnEnd: true,
      closable: true,
      pausable: false,
      renewable: true,
      isActive: true,
    });

    /* ------------------------------ catalog ----------------------------- */

    const coverage = await ctx.db.insert("attributes", { name: "Coverage" });
    const standardValue = await ctx.db.insert("attributeValues", {
      attributeId: coverage,
      value: "Standard",
      extraPrice: 0,
    });
    const priorityValue = await ctx.db.insert("attributeValues", {
      attributeId: coverage,
      value: "Priority",
      extraPrice: 56000, // the ₹560 add-on from the spec
    });

    const retainer = await ctx.db.insert("products", {
      name: "Retainer Support Hours",
      type: "SERVICE",
      salesPrice: 500000, // ₹5,000
      costPrice: 250000,
      notes: "10 hours of support each billing period.",
      isActive: true,
      attributeIds: [coverage],
      createdAt: now,
    });
    await ctx.db.insert("productTaxes", { productId: retainer, taxId: gst18 });

    const retainerStandard = await ctx.db.insert("variants", {
      productId: retainer,
      sku: "RET-STD",
      name: "Standard",
      isActive: true,
    });
    const retainerPriority = await ctx.db.insert("variants", {
      productId: retainer,
      sku: "RET-PRI",
      name: "Priority",
      isActive: true,
    });
    await ctx.db.insert("variantValues", {
      variantId: retainerStandard,
      attributeValueId: standardValue,
    });
    await ctx.db.insert("variantValues", {
      variantId: retainerPriority,
      attributeValueId: priorityValue,
    });

    const workspace = await ctx.db.insert("products", {
      name: "Analytics Workspace",
      type: "SOFTWARE",
      salesPrice: 120000, // ₹1,200
      costPrice: 40000,
      notes: "Seat-based analytics workspace; price is tax-inclusive.",
      isActive: true,
      attributeIds: [],
      createdAt: now,
    });
    await ctx.db.insert("productTaxes", { productId: workspace, taxId: gstInclusive });

    const workspaceStandard = await ctx.db.insert("variants", {
      productId: workspace,
      sku: "WS-STD",
      name: "Standard",
      priceOverride: 120000,
      isActive: true,
    });
    const workspacePro = await ctx.db.insert("variants", {
      productId: workspace,
      sku: "WS-PRO",
      name: "Pro",
      priceOverride: 249000, // ₹2,490
      isActive: true,
    });

    await ctx.db.insert("products", {
      name: "Onboarding Workshop",
      type: "ADD_ON",
      salesPrice: 99000, // ₹990
      costPrice: 40000,
      isActive: true,
      attributeIds: [],
      createdAt: now,
    });

    /* --------------------------- quote template ------------------------- */

    const template = await ctx.db.insert("quotationTemplates", {
      name: "Standard Monthly Retainer",
      validityDays: 15,
      planId: monthlyPlan,
      isActive: true,
      createdBy: undefined,
    });
    await ctx.db.insert("templateLines", {
      templateId: template,
      productId: retainer,
      variantId: retainerPriority,
      quantity: 1,
      sortOrder: 0,
    });
    await ctx.db.insert("templateLines", {
      templateId: template,
      productId: workspace,
      variantId: workspacePro,
      quantity: 1,
      sortOrder: 1,
    });

    /* ------------------------------ customers --------------------------- */

    const customerIds: Record<string, Id<"customers">> = {};
    for (const entry of DEMO_CUSTOMERS) {
      const userId = await findUserIdByEmail(ctx, entry.email);
      const id = await ctx.db.insert("customers", {
        userId: userId ?? undefined,
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        company: entry.company,
        address: entry.address,
        taxId: entry.taxId,
        isActive: true,
        searchText: `${entry.name} ${entry.email} ${entry.company}`.toLowerCase(),
        createdAt: now,
      });
      customerIds[entry.key] = id;
    }

    /* --------------------------- subscriptions -------------------------- */

    // 1. Monthly, active for three months, attached loyalty discount, history.
    const sub1Start = shiftMonths(todayDate, -3);
    const sub1 = await createSubscription(ctx, {
      customerId: customerIds.ananya,
      planId: monthlyPlan,
      paymentTermId: net7,
      startDate: sub1Start,
      expiryDate: shiftMonths(todayDate, 9),
      status: "ACTIVE",
      discountId: loyalty,
      createdBy: undefined,
      lines: [
        {
          productId: retainer,
          variantId: retainerPriority,
          description: "Retainer Support Hours — Priority",
          quantity: 1,
          unitPrice: 556000, // 5,000 + 560
          taxIds: [gst18],
        },
        {
          productId: workspace,
          variantId: workspacePro,
          description: "Analytics Workspace — Pro",
          quantity: 1,
          unitPrice: 249000,
          taxIds: [gstInclusive],
        },
      ],
      now,
    });

    // 2. Weekly, active for eight weeks.
    const sub2 = await createSubscription(ctx, {
      customerId: customerIds.rahul,
      planId: weeklyPlan,
      paymentTermId: net7,
      startDate: shiftDays(todayDate, -56),
      expiryDate: shiftDays(todayDate, 309),
      status: "ACTIVE",
      createdBy: undefined,
      lines: [
        {
          productId: retainer,
          variantId: retainerStandard,
          description: "Retainer Support Hours — Standard",
          quantity: 1,
          unitPrice: 500000,
          taxIds: [gst18],
        },
        {
          productId: workspace,
          variantId: workspaceStandard,
          description: "Analytics Workspace — Standard",
          quantity: 2,
          unitPrice: 120000,
          taxIds: [gstInclusive],
        },
      ],
      now,
    });

    // 3. Annual, confirmed and starts in five days (activation is scheduled).
    const sub3Start = shiftDays(todayDate, 5);
    await createSubscription(ctx, {
      customerId: customerIds.priya,
      planId: yearlyPlan,
      paymentTermId: net0,
      startDate: sub3Start,
      expiryDate: shiftMonths(sub3Start, 12),
      status: "CONFIRMED",
      createdBy: undefined,
      lines: [
        {
          productId: retainer,
          variantId: retainerPriority,
          description: "Retainer Support Hours — Priority",
          quantity: 3,
          unitPrice: 556000,
          taxIds: [gst18],
        },
      ],
      now,
    });

    // 4. Still a quotation (from the template) awaiting approval.
    await createSubscription(ctx, {
      customerId: customerIds.vikram,
      planId: monthlyPlan,
      paymentTermId: net7,
      startDate: shiftDays(todayDate, 14),
      expiryDate: shiftMonths(todayDate, 13),
      status: "QUOTATION",
      templateId: template,
      createdBy: undefined,
      lines: [
        {
          productId: retainer,
          variantId: retainerStandard,
          description: "Retainer Support Hours — Standard",
          quantity: 1,
          unitPrice: 500000,
          taxIds: [gst18],
        },
      ],
      now,
    });

    /* ----------------------------- invoices ----------------------------- */

    const sub1Invoices = await generateHistory(ctx, sub1, todayDate, true);
    const sub2Invoices = await generateHistory(ctx, sub2, todayDate, false);
    await finishHistory(ctx, sub1Invoices, now);
    await finishHistory(ctx, sub2Invoices, now);

    // sub1: advance nextInvoiceDate to the next unbilled period.
    let cursor1 = sub1Start;
    while (cursor1 <= todayDate) cursor1 = nextPeriodStart(cursor1, "MONTHLY");
    await ctx.db.patch(sub1._id, { nextInvoiceDate: cursor1 });

    let cursor2 = sub2.startDate;
    while (cursor2 <= todayDate) cursor2 = nextPeriodStart(cursor2, "WEEKLY");
    await ctx.db.patch(sub2._id, { nextInvoiceDate: cursor2 });

    return {
      seeded: true,
      customers: DEMO_CUSTOMERS.length,
      subscriptions: 4,
      invoices: sub1Invoices.length + sub2Invoices.length,
      portalEmail: DEMO_CUSTOMERS[0].email,
    };
  },
});

/* ------------------------------- helpers ----------------------------- */

async function findUserIdByEmail(
  ctx: MutationCtx,
  email: string,
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return user?._id ?? null;
}

type NewSubscription = {
  customerId: Id<"customers">;
  planId: Id<"plans">;
  paymentTermId: Id<"paymentTerms">;
  startDate: string;
  expiryDate: string;
  status: Doc<"subscriptions">["status"];
  discountId?: Id<"discounts">;
  templateId?: Id<"quotationTemplates">;
  createdBy?: Id<"users">;
  lines: Array<{
    productId: Id<"products">;
    variantId?: Id<"variants">;
    description: string;
    quantity: number;
    unitPrice: number;
    taxIds: Id<"taxes">[];
  }>;
  now: number;
};

async function createSubscription(
  ctx: MutationCtx,
  input: NewSubscription,
): Promise<Doc<"subscriptions">> {
  const { number } = await nextSequenceValue(ctx, "SUB");
  const customer = await ctx.db.get(input.customerId);
  const subscriptionId = await ctx.db.insert("subscriptions", {
    number,
    customerId: input.customerId,
    planId: input.planId,
    templateId: input.templateId,
    status: input.status,
    startDate: input.startDate,
    expiryDate: input.expiryDate,
    nextInvoiceDate:
      input.status === "ACTIVE" || input.status === "CONFIRMED"
        ? input.startDate
        : undefined,
    paymentTermId: input.paymentTermId,
    discountId: input.discountId,
    searchText: `${number} ${customer?.name ?? ""}`.toLowerCase(),
    createdBy: input.createdBy,
    createdAt: input.now,
    updatedAt: input.now,
  });

  for (const [index, line] of input.lines.entries()) {
    await ctx.db.insert("subscriptionLines", {
      subscriptionId,
      productId: line.productId,
      variantId: line.variantId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxIds: line.taxIds,
      sortOrder: index,
    });
  }

  const history: Array<[Doc<"subscriptions">["status"] | undefined, Doc<"subscriptions">["status"]]> =
    [
      [undefined, "DRAFT"],
      ["DRAFT", "QUOTATION"],
    ];
  if (input.status === "CONFIRMED" || input.status === "ACTIVE") {
    history.push(["QUOTATION", "CONFIRMED"]);
  }
  if (input.status === "ACTIVE") history.push(["CONFIRMED", "ACTIVE"]);
  for (const [from, to] of history) {
    await ctx.db.insert("subscriptionStatusHistory", {
      subscriptionId,
      fromStatus: from,
      toStatus: to,
      changedByName: "Seed data",
      changedAt: input.now,
      reason: "Demo history",
    });
  }

  const subscription = await ctx.db.get(subscriptionId);
  return subscription!;
}

/**
 * Bill every period up to `until` using the real billing engine.
 * `includeUntil: false` leaves today's period unbilled so the billing screen
 * has something due when you open the demo.
 */
async function generateHistory(
  ctx: MutationCtx,
  subscription: Doc<"subscriptions">,
  until: string,
  includeUntil: boolean,
): Promise<Id<"invoices">[]> {
  const invoiceIds: Id<"invoices">[] = [];
  let cursor = subscription.startDate;
  let guard = 0;
  const withinPeriod = (day: string) => (includeUntil ? day <= until : day < until);
  while (withinPeriod(cursor) && guard < 60) {
    guard += 1;
    const result = await ctx.runMutation(internal.billing.billPeriod, {
      subscriptionId: subscription._id,
      periodStart: cursor,
    });
    if (result.created && result.invoiceId) invoiceIds.push(result.invoiceId);
    cursor = result.nextPeriodStart;
  }
  return invoiceIds;
}

/**
 * Confirm every generated invoice except the newest, pay all but the last two,
 * and leave the newest as a draft — so the demo shows paid, overdue and draft.
 */
async function finishHistory(
  ctx: MutationCtx,
  invoiceIds: Id<"invoices">[],
  now: number,
): Promise<void> {
  const methods = ["BANK_TRANSFER", "UPI", "CARD"] as const;
  for (let index = 0; index < invoiceIds.length; index += 1) {
    const invoice = await ctx.db.get(invoiceIds[index]);
    if (!invoice) continue;
    const isLast = index === invoiceIds.length - 1;
    const isUnpaid = index >= invoiceIds.length - 2;
    if (isLast) continue; // stays DRAFT

    const { number } = await nextSequenceValue(ctx, "INV");
    await ctx.db.patch(invoice._id, {
      status: "CONFIRMED",
      number,
      confirmedAt: now - (invoiceIds.length - index) * 86_400_000,
    });

    if (isUnpaid) continue; // second-newest is confirmed but unpaid (overdue)

    const method = methods[index % methods.length];
    await ctx.db.insert("payments", {
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      method,
      amount: invoice.total,
      paidOn: invoice.issueDate,
      reference: `${method === "UPI" ? "UPI" : "UTR"}${String(100000 + index * 7 + (now % 97))}`,
      referenceKey: `${method}|SEED-${invoice._id}`,
      createdAt: now,
    });
    await ctx.db.patch(invoice._id, {
      amountPaid: invoice.total,
      amountDue: 0,
      status: "PAID",
    });
  }
}

const DEMO_CUSTOMERS = [
  {
    key: "ananya",
    name: "Ananya Sharma",
    email: "ananya@nebulafoods.in",
    phone: "+91 98450 11223",
    company: "Nebula Foods Pvt Ltd",
    taxId: "29AABCN1234F1Z5",
    address: { line1: "12 Residency Road", city: "Bengaluru", state: "Karnataka", pincode: "560025" },
  },
  {
    key: "rahul",
    name: "Rahul Menon",
    email: "rahul@kochimarine.com",
    phone: "+91 99470 55667",
    company: "Kochi Marine Exports",
    taxId: "32AACCK9876L1Z2",
    address: { line1: "Willington Island", city: "Kochi", state: "Kerala", pincode: "682003" },
  },
  {
    key: "priya",
    name: "Priya Iyer",
    email: "priya@drivetrack.io",
    phone: "+91 98840 22331",
    company: "DriveTrack Labs",
    taxId: "33AAECD4455P1Z9",
    address: { line1: "OMR, Perungudi", city: "Chennai", state: "Tamil Nadu", pincode: "600096" },
  },
  {
    key: "vikram",
    name: "Vikram Singh",
    email: "vikram@aravallisteel.co.in",
    phone: "+91 94140 77889",
    company: "Aravalli Steel Works",
    taxId: "08AABCA7788Q1Z1",
    address: { line1: "RIICO Industrial Area", city: "Jaipur", state: "Rajasthan", pincode: "302013" },
  },
] as const;

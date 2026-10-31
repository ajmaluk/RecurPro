/**
 * Shared validation: one set of rules for the browser forms and the Convex
 * functions, so a form can never accept something the server rejects.
 *
 * Money fields are collected as strings ("1,234.50" style) and converted to
 * integer paise by the caller with `parseRupeesToPaise`.
 */
import { z } from "zod";
import {
  BILLING_PERIODS,
  DISCOUNT_SCOPES,
  DISCOUNT_TYPES,
  PAYMENT_METHODS,
  PRODUCT_TYPES,
  TAX_TYPES,
} from "./enums";
import { MONEY_INPUT_PATTERN } from "./money";
import { isValidDay } from "./periods";

/* ------------------------------------------------------------------ */
/* Password policy                                                     */
/* ------------------------------------------------------------------ */

export const PASSWORD_MIN_LENGTH = 9; // "more than eight characters"

export const PASSWORD_RULE_TEXT =
  "At least 9 characters, with one uppercase letter, one lowercase letter and one symbol. A digit is recommended.";

export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(password)) problems.push("Add an uppercase letter");
  if (!/[a-z]/.test(password)) problems.push("Add a lowercase letter");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("Add a symbol");
  return problems;
}

export function isValidPassword(password: string): boolean {
  return passwordProblems(password).length === 0;
}

/** Throwing variant used by the Convex Auth Password provider. */
export function assertPasswordPolicy(password: string): void {
  const problems = passwordProblems(password);
  if (problems.length > 0) throw new Error(problems.join(". "));
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Primitive field schemas                                             */
/* ------------------------------------------------------------------ */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .regex(EMAIL_PATTERN, "Enter a valid email address")
  .transform(normalizeEmail);

export const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .superRefine((value, ctx) => {
    const problems = passwordProblems(value);
    if (problems.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: problems.join(". "),
      });
    }
  });

export const daySchema = z
  .string()
  .refine(isValidDay, "Enter a valid date (YYYY-MM-DD)");

export const optionalDaySchema = z
  .string()
  .refine((value) => value === "" || isValidDay(value), "Enter a valid date");

/** Money exactly as a human types it: "0", "560", "1,234.50". */
export const moneySchema = z
  .string()
  .trim()
  .regex(MONEY_INPUT_PATTERN, "Enter an amount like 560 or 560.50");

export const optionalMoneySchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || MONEY_INPUT_PATTERN.test(value),
    "Enter an amount like 560 or 560.50",
  );

export const idSchema = z.string().min(1, "This field is required");

const optionalText = (max = 200) =>
  z.string().trim().max(max, `Keep it under ${max} characters`);

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  newPassword: passwordSchema,
});

/* ------------------------------------------------------------------ */
/* Users and customers                                                 */
/* ------------------------------------------------------------------ */

export const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter a customer name").max(120),
  email: emailSchema,
  phone: optionalText(30),
  company: optionalText(120),
  taxId: optionalText(40),
  addressLine: optionalText(160),
  city: optionalText(60),
  state: optionalText(60),
  pincode: optionalText(12),
});

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export const productSchema = z.object({
  name: z.string().trim().min(2, "Enter a product name").max(120),
  type: z.enum(PRODUCT_TYPES),
  salesPrice: moneySchema,
  costPrice: moneySchema,
  notes: optionalText(500),
  isActive: z.boolean(),
});

export const attributeSchema = z.object({
  name: z.string().trim().min(2, "Enter an attribute name").max(60),
  values: z
    .array(
      z.object({
        value: z.string().trim().min(1, "Enter a value").max(60),
        extraPrice: moneySchema,
      }),
    )
    .min(1, "Add at least one value"),
});

export const variantSchema = z.object({
  sku: z.string().trim().min(1, "Enter a SKU").max(40),
  name: z.string().trim().min(1, "Enter a variant name").max(80),
  priceOverride: optionalMoneySchema,
  valueIds: z.array(z.string()).default([]),
});

export const planSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a plan name").max(80),
    price: moneySchema,
    billingPeriod: z.enum(BILLING_PERIODS),
    minQuantity: z.coerce.number().int().min(1, "Minimum quantity is 1"),
    availableFrom: optionalDaySchema,
    availableTo: optionalDaySchema,
    autoCloseOnEnd: z.boolean(),
    closable: z.boolean(),
    pausable: z.boolean(),
    renewable: z.boolean(),
    isActive: z.boolean(),
  })
  .refine(
    (plan) =>
      !plan.availableFrom ||
      !plan.availableTo ||
      plan.availableFrom <= plan.availableTo,
    { message: "Availability end must be on or after the start", path: ["availableTo"] },
  );

export const templateLineSchema = z.object({
  productId: idSchema,
  variantId: z.string().default(""),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Enter a template name").max(80),
  validityDays: z.coerce.number().int().min(1, "Validity must be at least 1 day"),
  planId: idSchema,
  isActive: z.boolean(),
  lines: z.array(templateLineSchema).min(1, "Add at least one line"),
});

/* ------------------------------------------------------------------ */
/* Pricing rules                                                       */
/* ------------------------------------------------------------------ */

export const taxSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a tax name").max(60),
    type: z.enum(TAX_TYPES),
    /** Percentage: "18" or "9.5". Fixed: rupees. */
    value: z.string().trim().min(1, "Enter a value"),
    isInclusive: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((tax, ctx) => {
    if (tax.type === "PERCENT") {
      const parsed = Number(tax.value);
      if (!/^\d+(\.\d{1,2})?$/.test(tax.value) || parsed <= 0 || parsed > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Percentage must be between 0 and 100",
          path: ["value"],
        });
      }
    } else if (!MONEY_INPUT_PATTERN.test(tax.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter an amount like 99 or 99.50",
        path: ["value"],
      });
    }
  });

export const discountSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a discount name").max(80),
    type: z.enum(DISCOUNT_TYPES),
    /** Percentage: basis-point-free percent ("10"). Fixed: rupees ("500"). */
    value: z.string().trim().min(1, "Enter a value"),
    minPurchase: optionalMoneySchema,
    minQuantity: z.string().trim(),
    startDate: optionalDaySchema,
    endDate: optionalDaySchema,
    usageLimit: z.string().trim(),
    perCustomerLimit: z.string().trim(),
    appliesTo: z.enum(DISCOUNT_SCOPES),
    productIds: z.array(z.string()).default([]),
    isActive: z.boolean(),
  })
  .superRefine((discount, ctx) => {
    if (discount.type === "PERCENTAGE") {
      const parsed = Number(discount.value);
      if (!/^\d+(\.\d{1,2})?$/.test(discount.value) || parsed <= 0 || parsed > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Percentage must be between 0 and 100",
          path: ["value"],
        });
      }
    } else if (!MONEY_INPUT_PATTERN.test(discount.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter an amount like 500 or 500.50",
        path: ["value"],
      });
    }
    if (discount.startDate && discount.endDate && discount.startDate > discount.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after the start date",
        path: ["endDate"],
      });
    }
    for (const field of ["minQuantity", "usageLimit", "perCustomerLimit"] as const) {
      const raw = discount[field];
      if (raw !== "" && (!/^\d+$/.test(raw) || Number(raw) < 1)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a whole number of 1 or more",
          path: [field],
        });
      }
    }
    if (discount.appliesTo === "PRODUCTS" && discount.productIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose at least one product",
        path: ["productIds"],
      });
    }
  });

/* ------------------------------------------------------------------ */
/* Subscriptions and payments                                          */
/* ------------------------------------------------------------------ */

export const subscriptionLineSchema = z.object({
  productId: idSchema,
  variantId: z.string().default(""),
  description: z.string().trim().min(1, "Enter a description").max(200),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  unitPrice: moneySchema,
});

export const subscriptionSchema = z
  .object({
    customerId: idSchema,
    planId: idSchema,
    templateId: z.string().default(""),
    paymentTermId: idSchema,
    startDate: daySchema,
    expiryDate: daySchema,
    discountId: z.string().default(""),
    lines: z.array(subscriptionLineSchema).min(1, "Add at least one line"),
  })
  .refine((sub) => sub.expiryDate >= sub.startDate, {
    message: "Expiry must be on or after the start date",
    path: ["expiryDate"],
  });

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: moneySchema,
  paidOn: daySchema,
  reference: optionalText(60),
  note: optionalText(240),
});

export const closeReasonSchema = z.object({
  reason: z.string().trim().min(2, "Tell the team why").max(240),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export type FieldErrors = Record<string, string>;

/** Flatten a ZodError into `field -> first message`, for inline form errors. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Parse or throw a readable error whose `details` carry field messages. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = fieldErrors(result.error);
    const first = Object.entries(details)[0];
    throw new Error(
      first ? `${first[1]}${first[0] !== "_" ? ` (${first[0]})` : ""}` : "Invalid input",
    );
  }
  return result.data;
}

/**
 * Single source of truth for the enums used by both the browser and Convex.
 * Values are plain strings so they can be stored, indexed and compared directly.
 */

export const ROLES = {
  ADMIN: "admin",
  INTERNAL: "internal",
  STAFF: "staff",
  CUSTOMER: "customer",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  internal: "Staff",
  staff: "Staff",
  customer: "Customer",
};

/** Staff roles may work in the back office; customers only see the portal. */
export const STAFF_ROLES: Role[] = [ROLES.ADMIN, ROLES.INTERNAL, ROLES.STAFF];

export const SUBSCRIPTION_STATUSES = [
  "DRAFT",
  "QUOTATION",
  "CONFIRMED",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "PAID",
  "CANCELLED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const BILLING_PERIODS = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export const PRODUCT_TYPES = [
  "SERVICE",
  "SOFTWARE",
  "ADD_ON",
  "PHYSICAL",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "UPI",
  "CARD",
  "CHEQUE",
  "ONLINE",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CARD: "Card",
  CHEQUE: "Cheque",
  ONLINE: "Online",
};

export const DISCOUNT_TYPES = ["FIXED", "PERCENTAGE"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_SCOPES = ["SUBSCRIPTION", "PRODUCTS"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

export const TAX_TYPES = ["PERCENT", "FIXED"] as const;
export type TaxType = (typeof TAX_TYPES)[number];

/**
 * Authorization, auditing and numbering helpers shared by every Convex
 * function. Authorization happens here, on the server, never in the UI.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ROLES, type Role } from "../../shared/enums";
import { todayInBusinessTz } from "../../shared/periods";

type Ctx = QueryCtx | MutationCtx;

/** Current user document, or a clear 401-style error. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("You need to sign in to do that.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("You need to sign in to do that.");
  if (user.isActive === false) {
    throw new Error("This account has been deactivated. Contact an admin.");
  }
  return user;
}

export async function requireRole<R extends Role>(
  ctx: Ctx,
  ...roles: R[]
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  const role = user.role ?? ROLES.CUSTOMER;
  if (!roles.includes(role as R)) {
    throw new Error(
      `This action requires the ${roles.join(" or ")} role; you are signed in as ${role}.`,
    );
  }
  return user;
}

export async function requireStaff(ctx: Ctx): Promise<Doc<"users">> {
  return requireRole(ctx, ROLES.ADMIN, ROLES.INTERNAL);
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  return requireRole(ctx, ROLES.ADMIN);
}

/** Customers may only ever act on rows that carry their own customerId. */
export async function requireOwnCustomer(
  ctx: Ctx,
  customerId: Id<"customers">,
): Promise<{ user: Doc<"users">; customer: Doc<"customers"> }> {
  const user = await requireUser(ctx);
  const customer = await ctx.db.get(customerId);
  if (!customer) throw new Error("Not found.");
  if (user.role === ROLES.CUSTOMER) {
    if (customer.userId !== user._id) throw new Error("Not found.");
  } else if (user.role !== ROLES.ADMIN && user.role !== ROLES.INTERNAL) {
    throw new Error("Not found.");
  }
  return { user, customer };
}

/** The customer row owned by the signed-in portal user (or null). */
export async function customerForUser(
  ctx: Ctx,
  user: Doc<"users">,
): Promise<Doc<"customers"> | null> {
  const customer = await ctx.db
    .query("customers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  return customer;
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export type AuditEntry = {
  actor?: Doc<"users"> | null;
  /** For system actions (billing run) that have no signed-in actor. */
  actorId?: Id<"users">;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

export async function audit(ctx: MutationCtx, entry: AuditEntry): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorId: entry.actor?._id ?? entry.actorId,
    actorName: entry.actor?.name ?? entry.actor?.email,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    at: Date.now(),
  });
}

/* ------------------------------------------------------------------ */
/* Sequences                                                           */
/* ------------------------------------------------------------------ */

/**
 * Gapless-per-year counter, e.g. SUB-2026-000123 / INV-2026-000456.
 * Convex serializes mutations on the same document, so increments are safe.
 */
export async function nextSequenceValue(
  ctx: MutationCtx,
  prefix: "SUB" | "INV",
): Promise<{ number: string; value: number }> {
  const year = new Date().getUTCFullYear();
  const key = `${prefix}-${year}`;
  const existing = await ctx.db
    .query("sequences")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  let value: number;
  if (existing) {
    value = existing.value + 1;
    await ctx.db.patch(existing._id, { value });
  } else {
    value = 1;
    await ctx.db.insert("sequences", { key, value });
  }
  const padded = value.toString().padStart(6, "0");
  return { number: `${prefix}-${year}-${padded}`, value };
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

/** Today's billing date in the business timezone (Asia/Kolkata). */
export function today(): string {
  return todayInBusinessTz();
}

/** Convert a rupee amount typed in a form to integer paise. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

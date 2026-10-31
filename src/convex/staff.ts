/**
 * Staff administration (admin-only).
 *
 * Staff accounts are created by an **action** because `createAccount` from
 * Convex Auth is action-only. The public Password-provider `profile` hard-codes
 * `role: customer`, so the staff role is set explicitly here instead of being
 * reachable from the signup form.
 */
import { z } from "zod";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { audit, errorMessage, requireAdmin } from "./lib/authz";
import { ROLES } from "../shared/enums";
import { roleValidator } from "./schema";
import { emailSchema, parseOrThrow, passwordSchema } from "../shared/validation";

const staffCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["admin", "internal"]),
});

const optional = v.optional(v.string());

/* ------------------------------------------------------------------ */
/* Internal helpers used by the actions                                */
/* ------------------------------------------------------------------ */

export const requireAdminSelf = internalQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAdmin(ctx);
    return { userId: actor._id };
  },
});

export const emailTaken = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    return existing !== null;
  },
});

export const emailFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("That account no longer exists.");
    if (!user.email) throw new Error("That account has no email address.");
    if (user.isAnonymous) throw new Error("Guest accounts cannot have a password.");
    return { email: user.email, name: user.name ?? user.email };
  },
});

export const afterCreate = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    name: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.userId);
    await audit(ctx, {
      actor,
      action: "staff.create",
      entityType: "users",
      entityId: args.userId,
      after: { email: args.email, name: args.name, role: args.role },
    });
  },
});

export const afterPasswordReset = internalMutation({
  args: { userId: v.id("users"), byUserId: v.optional(v.id("users")) },
  handler: async (ctx, { userId, byUserId }) => {
    const target = await ctx.db.get(userId);
    const actor = byUserId ? await ctx.db.get(byUserId) : target;
    await audit(ctx, {
      actor,
      action: "user.password_reset",
      entityType: "users",
      entityId: userId,
      after: { email: target?.email },
    });
  },
});

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAdmin(ctx);
    const rows = await ctx.db.query("users").take(1000);
    const people = rows.filter((row) => !row.isAnonymous);
    people.sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
    return people.map((row) => ({
      _id: row._id,
      name: row.name ?? "—",
      email: row.email ?? "—",
      role: row.role ?? ROLES.CUSTOMER,
      isActive: row.isActive !== false,
      phone: row.phone ?? null,
      isSelf: row._id === actor._id,
    }));
  },
});

export const adminCount = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("users").take(1000);
    return rows.filter(
      (row) => row.role === ROLES.ADMIN && row.isActive !== false && !row.isAnonymous,
    ).length;
  },
});

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export const update = mutation({
  args: {
    userId: v.id("users"),
    name: optional,
    phone: optional,
    role: v.optional(roleValidator),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target || target.isAnonymous) throw new Error("Account not found.");

    const isSelf = target._id === actor._id;
    const targetIsAdmin = (target.role ?? ROLES.CUSTOMER) === ROLES.ADMIN;
    const changesAdmin =
      (args.role !== undefined && args.role !== ROLES.ADMIN) ||
      args.isActive === false;

    if (isSelf && (args.role !== undefined || args.isActive === false)) {
      throw new Error("You can't change your own role or access.");
    }
    if (targetIsAdmin && changesAdmin) {
      const admins = (await ctx.db.query("users").take(1000)).filter(
        (row) =>
          row.role === ROLES.ADMIN && row.isActive !== false && !row.isAnonymous,
      );
      if (admins.length <= 1) {
        throw new Error("At least one admin account must stay active.");
      }
    }

    const before = {
      name: target.name,
      phone: target.phone,
      role: target.role ?? ROLES.CUSTOMER,
      isActive: target.isActive !== false,
    };
    const patch: Partial<Doc<"users">> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.role !== undefined) patch.role = args.role;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    await ctx.db.patch(target._id, patch);

    await audit(ctx, {
      actor,
      action: "staff.update",
      entityType: "users",
      entityId: target._id,
      before,
      after: { ...before, ...patch },
    });
    return { ok: true };
  },
});

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export const create = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.union(v.literal("admin"), v.literal("internal")),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.staff.requireAdminSelf);
    const data = parseOrThrow(staffCreateSchema, args);

    const taken = await ctx.runQuery(internal.staff.emailTaken, { email: data.email });
    if (taken) {
      throw new Error(`An account already exists for ${data.email}.`);
    }

    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: data.email, secret: data.password },
      profile: {
        email: data.email,
        name: data.name,
        role: data.role,
        isActive: true,
      },
    });

    await ctx.runMutation(internal.staff.afterCreate, {
      userId: user._id,
      email: data.email,
      name: data.name,
      role: data.role,
    });
    return { userId: user._id };
  },
});

export const resetPassword = action({
  args: { userId: v.id("users"), newPassword: v.string() },
  handler: async (ctx, args) => {
    const { userId: byUserId } = await ctx.runQuery(internal.staff.requireAdminSelf);
    const { newPassword } = parseOrThrow(
      z.object({ newPassword: passwordSchema }),
      { newPassword: args.newPassword },
    );
    const { email } = await ctx.runQuery(internal.staff.emailFor, { userId: args.userId });

    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: newPassword },
      });
    } catch (error) {
      throw new Error(`Could not update that password: ${errorMessage(error)}`);
    }

    await ctx.runMutation(internal.staff.afterPasswordReset, {
      userId: args.userId,
      byUserId,
    });
    return { ok: true };
  },
});

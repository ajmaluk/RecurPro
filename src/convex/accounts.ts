/**
 * Self-service account security.
 *
 * There is no outbound email transport in this deployment, so V1 recovery is:
 *  - users change their own password here (current password required), and
 *  - admins issue a one-time replacement password (see `staff.resetPassword`).
 * This is recorded in docs/DECISIONS.md.
 */
import { z } from "zod";
import { modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { audit, errorMessage, requireUser } from "./lib/authz";
import { assertPasswordPolicy, parseOrThrow, passwordSchema } from "../shared/validation";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
});

export const me = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return {
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  },
});

export const afterChange = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    await audit(ctx, {
      actor: user,
      action: "user.password_change",
      entityType: "users",
      entityId: userId,
    });
  },
});

export const changePassword = action({
  args: { currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const { userId, email } = await ctx.runQuery(internal.accounts.me);
    if (!email) throw new Error("Your account has no email address.");

    const data = parseOrThrow(changePasswordSchema, args);
    if (data.newPassword === data.currentPassword) {
      throw new Error("The new password must be different from the current one.");
    }
    assertPasswordPolicy(data.newPassword);

    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: email, secret: data.currentPassword },
      });
    } catch {
      throw new Error("Your current password is not correct.");
    }

    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: data.newPassword },
      });
    } catch (error) {
      throw new Error(`Could not update your password: ${errorMessage(error)}`);
    }

    await ctx.runMutation(internal.accounts.afterChange, { userId });
    return { ok: true };
  },
});

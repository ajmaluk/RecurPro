import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";

const optional = v.optional(v.string());

/** Admin-only activity trail (every state change writes an audit row). */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    entityType: optional,
    action: optional,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const entityType = args.entityType ?? undefined;
    const actionPrefix = args.action ?? undefined;

    const result = entityType
      ? await ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entityType", entityType))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("auditLogs")
          .withIndex("by_at", (q) => q)
          .order("desc")
          .paginate(args.paginationOpts);

    const page = [];
    for (const row of result.page) {
      if (actionPrefix && !row.action.startsWith(actionPrefix)) continue;
      const actor = row.actorId ? await ctx.db.get(row.actorId) : null;
      page.push({
        ...row,
        actorLabel: actor?.name ?? actor?.email ?? "System",
      });
    }
    return { ...result, page };
  },
});

export const forEntity = query({
  args: { entityType: v.string(), entityId: v.string() },
  handler: async (ctx, { entityType, entityId }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) => q.eq("entityType", entityType).eq("entityId", entityId))
      .order("desc")
      .take(100);
    const out = [];
    for (const row of rows) {
      const actor = row.actorId ? await ctx.db.get(row.actorId) : null;
      out.push({
        ...row,
        actorLabel: actor?.name ?? actor?.email ?? "System",
      });
    }
    return out;
  },
});

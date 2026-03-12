import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const syncUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = identity.subject;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        imageUrl: args.imageUrl,
      });

      // Resolve any pending workspace invites for this email
      const pendingInvites = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .filter((q) => q.eq(q.field("isPending"), true))
        .collect();

      for (const invite of pendingInvites) {
        await ctx.db.patch(invite._id, {
          userId: clerkId,
          isPending: false,
        });
      }

      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkId,
      name: args.name,
      email: args.email,
      imageUrl: args.imageUrl,
    });

    // Resolve pending invites for new user
    const pendingInvites = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("isPending"), true))
      .collect();

    for (const invite of pendingInvites) {
      await ctx.db.patch(invite._id, {
        userId: clerkId,
        isPending: false,
      });
    }

    return userId;
  },
});

export const searchUsers = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    if (args.query.length < 2) return [];

    const allUsers = await ctx.db.query("users").collect();

    const q = args.query.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.clerkId !== identity.subject &&
        (u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)),
    );
  },
});

export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

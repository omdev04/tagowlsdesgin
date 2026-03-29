import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

async function requireWorkspaceAdmin(ctx: any, workspaceId: any, userId: string) {
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q: any) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .first();
  if (!member || member.isPending) throw new Error("Not a workspace member");
  if (member.role !== "admin") throw new Error("Only admins can perform this action");
  return member;
}

async function requireWorkspaceMember(ctx: any, workspaceId: any, userId: string) {
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q: any) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .first();
  if (!member || member.isPending) throw new Error("Not a workspace member");
  return member;
}

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);

    const existing = await ctx.db
      .query("labels")
      .withIndex("by_name", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("name", args.name),
      )
      .first();

    if (existing) throw new Error("Label with this name already exists");

    return await ctx.db.insert("labels", {
      workspaceId: args.workspaceId,
      name: args.name,
      color: args.color,
      createdBy: identity.subject,
      createdAt: Date.now(),
    });
  },
});

export const getAll = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);

    return await ctx.db
      .query("labels")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const update = mutation({
  args: {
    labelId: v.id("labels"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const label = await ctx.db.get(args.labelId);
    if (!label) throw new Error("Label not found");

    await requireWorkspaceMember(ctx, label.workspaceId, identity.subject);

    if (args.name && args.name !== label.name) {
      const newName = args.name;
      const existing = await ctx.db
        .query("labels")
        .withIndex("by_name", (q) =>
          q.eq("workspaceId", label.workspaceId).eq("name", newName),
        )
        .first();
      if (existing) throw new Error("Label with this name already exists");
    }

    const { labelId, ...updates } = args;
    return await ctx.db.patch(labelId, updates);
  },
});

export const remove = mutation({
  args: { labelId: v.id("labels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const label = await ctx.db.get(args.labelId);
    if (!label) throw new Error("Label not found");

    await requireWorkspaceAdmin(ctx, label.workspaceId, identity.subject);

    const issueLabels = await ctx.db
      .query("issueLabels")
      .withIndex("by_label", (q) => q.eq("labelId", args.labelId))
      .collect();

    for (const il of issueLabels) {
      await ctx.db.delete(il._id);
    }

    return await ctx.db.delete(args.labelId);
  },
});

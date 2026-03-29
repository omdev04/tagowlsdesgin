import { ConvexError, v } from "convex/values";
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
    description: v.optional(v.string()),
    key: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireWorkspaceAdmin(ctx, args.workspaceId, identity.subject);

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", args.key.toUpperCase()),
      )
      .first();
    if (existing) throw new ConvexError("Project key already exists");

    const now = Date.now();
    return await ctx.db.insert("projects", {
      workspaceId: args.workspaceId,
      name: args.name,
      description: args.description,
      key: args.key.toUpperCase(),
      icon: args.icon,
      createdBy: identity.subject,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
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
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.neq(q.field("isArchived"), true))
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: {
    projectId: v.id("projects"),
    workspaceContextId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    if (args.workspaceContextId !== undefined) {
      if (project.workspaceId !== args.workspaceContextId) {
        return null;
      }
    } else {
      // Personal context should not expose workspace projects.
      return null;
    }

    try {
      await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);
    } catch {
      return null;
    }

    return project;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    await requireWorkspaceAdmin(ctx, project.workspaceId, identity.subject);

    const { projectId, ...updates } = args;
    return await ctx.db.patch(projectId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    await requireWorkspaceAdmin(ctx, project.workspaceId, identity.subject);

    return await ctx.db.patch(args.projectId, { isArchived: true, updatedAt: Date.now() });
  },
});

export const getStats = query({
  args: {
    projectId: v.id("projects"),
    workspaceContextId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    if (args.workspaceContextId !== undefined) {
      if (project.workspaceId !== args.workspaceContextId) {
        return null;
      }
    } else {
      return null;
    }

    try {
      await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);
    } catch {
      return null;
    }

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    return {
      total: issues.length,
      todo: issues.filter((i) => i.status === "TODO").length,
      inProgress: issues.filter((i) => i.status === "IN_PROGRESS").length,
      done: issues.filter((i) => i.status === "DONE").length,
    };
  },
});

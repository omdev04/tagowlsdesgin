import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

async function requireAdmin(ctx: any, workspaceId: any, userId: string) {
  const member = await requireWorkspaceMember(ctx, workspaceId, userId);
  if (member.role !== "admin") throw new Error("Only admins can manage columns");
  return member;
}

async function requireProjectView(ctx: any, projectId: any, userId: string) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");

  const member = await requireWorkspaceMember(ctx, project.workspaceId, userId);
  if (member.role === "admin") {
    return project;
  }

  if (!project.isAccessRestricted) {
    return project;
  }

  const access = await ctx.db
    .query("projectAccess")
    .withIndex("by_project_user", (q: any) =>
      q.eq("projectId", projectId).eq("userId", userId),
    )
    .first();

  if (!access || (access.permission !== "view" && access.permission !== "edit")) {
    throw new Error("No project access");
  }

  return project;
}

/** List all custom columns for a project, sorted by `order`. */
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireProjectView(ctx, args.projectId, identity.subject);

    const cols = await ctx.db
      .query("projectColumns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return cols.sort((a, b) => a.order - b.order);
  },
});

/** Create a new column (admin only). */
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    label: v.string(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    await requireAdmin(ctx, project.workspaceId, identity.subject);

    // Determine next order index
    const existing = await ctx.db
      .query("projectColumns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), -1);

    return await ctx.db.insert("projectColumns", {
      projectId: args.projectId,
      workspaceId: project.workspaceId,
      label: args.label.trim(),
      color: args.color ?? "bg-sky-500",
      order: maxOrder + 1,
      createdBy: identity.subject,
      createdAt: Date.now(),
    });
  },
});

/** Rename or recolor a column (admin only). */
export const update = mutation({
  args: {
    columnId: v.id("projectColumns"),
    label: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const col = await ctx.db.get(args.columnId);
    if (!col) throw new Error("Column not found");

    await requireAdmin(ctx, col.workspaceId, identity.subject);

    const { columnId, ...patch } = args;
    if (patch.label) patch.label = patch.label.trim();
    return await ctx.db.patch(columnId, patch);
  },
});

/** Delete a column (admin only).  Issues in that column keep their status string intact. */
export const remove = mutation({
  args: { columnId: v.id("projectColumns") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const col = await ctx.db.get(args.columnId);
    if (!col) throw new Error("Column not found");

    await requireAdmin(ctx, col.workspaceId, identity.subject);

    return await ctx.db.delete(args.columnId);
  },
});

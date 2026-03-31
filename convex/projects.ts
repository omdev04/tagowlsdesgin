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

async function hasProjectPermission(
  ctx: any,
  project: any,
  workspaceMember: any,
  needed: "view" | "edit",
) {
  if (workspaceMember.role === "admin") {
    return true;
  }

  if (!project.isAccessRestricted) {
    return true;
  }

  const access = await ctx.db
    .query("projectAccess")
    .withIndex("by_project_user", (q: any) =>
      q.eq("projectId", project._id).eq("userId", workspaceMember.userId),
    )
    .first();

  if (!access) {
    return false;
  }

  if (needed === "view") {
    return access.permission === "view" || access.permission === "edit";
  }

  return access.permission === "edit";
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
      isAccessRestricted: false,
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

    const member = await requireWorkspaceMember(ctx, args.workspaceId, identity.subject);

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.neq(q.field("isArchived"), true))
      .order("desc")
      .collect();

    if (member.role === "admin") {
      return allProjects;
    }

    const explicitAccessRows = await ctx.db
      .query("projectAccess")
      .withIndex("by_user_workspace", (q: any) =>
        q.eq("userId", identity.subject).eq("workspaceId", args.workspaceId),
      )
      .collect();

    const accessByProject = new Map(
      explicitAccessRows.map((row: any) => [row.projectId, row.permission]),
    );

    return allProjects.filter((project: any) => {
      if (!project.isAccessRestricted) {
        return true;
      }
      const perm = accessByProject.get(project._id);
      return perm === "view" || perm === "edit";
    });
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

    let member;
    try {
      member = await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);
    } catch {
      return null;
    }

    const canView = await hasProjectPermission(ctx, project, member, "view");
    if (!canView) {
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

    let member;
    try {
      member = await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);
    } catch {
      return null;
    }

    const canView = await hasProjectPermission(ctx, project, member, "view");
    if (!canView) {
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

export const getAccessList = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const me = await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);

    if (me.role !== "admin") {
      throw new Error("Only admins can manage project access");
    }

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q: any) => q.eq("workspaceId", project.workspaceId))
      .collect();

    const accessRows = await ctx.db
      .query("projectAccess")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();

    const isRestricted = !!project.isAccessRestricted;
    const accessByUser = new Map(accessRows.map((row: any) => [row.userId, row]));

    const enriched = await Promise.all(
      members
        .filter((m: any) => !m.isPending)
        .map(async (member: any) => {
          const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", member.userId))
            .first();

          const access = accessByUser.get(member.userId);
          const effectivePermission =
            member.role === "admin"
              ? "admin"
              : isRestricted
                ? (access?.permission ?? "none")
                : "edit";

          return {
            member,
            user,
            permission: access?.permission,
            effectivePermission,
          };
        }),
    );

    return {
      isRestricted,
      members: enriched,
    };
  },
});

export const setMemberAccess = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    permission: v.union(v.literal("none"), v.literal("view"), v.literal("edit")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    await requireWorkspaceAdmin(ctx, project.workspaceId, identity.subject);

    const targetMember = await requireWorkspaceMember(ctx, project.workspaceId, args.userId);
    if (targetMember.role === "admin") {
      throw new Error("Workspace admins always have full access");
    }

    if (!project.isAccessRestricted) {
      const workspaceMembers = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", project.workspaceId))
        .collect();

      const existingRows = await ctx.db
        .query("projectAccess")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
        .collect();

      const hasRow = new Set(existingRows.map((row: any) => row.userId));
      const now = Date.now();

      for (const member of workspaceMembers) {
        if (member.isPending || member.role === "admin") {
          continue;
        }

        if (hasRow.has(member.userId)) {
          continue;
        }

        await ctx.db.insert("projectAccess", {
          projectId: args.projectId,
          workspaceId: project.workspaceId,
          userId: member.userId,
          permission: "edit",
          grantedBy: identity.subject,
          grantedAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.patch(args.projectId, {
        isAccessRestricted: true,
        updatedAt: Date.now(),
      });
    }

    const existing = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_user", (q: any) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId),
      )
      .first();

    if (args.permission === "none") {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return { ok: true };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        permission: args.permission,
        grantedBy: identity.subject,
        updatedAt: Date.now(),
      });
    } else {
      const now = Date.now();
      await ctx.db.insert("projectAccess", {
        projectId: args.projectId,
        workspaceId: project.workspaceId,
        userId: args.userId,
        permission: args.permission,
        grantedBy: identity.subject,
        grantedAt: now,
        updatedAt: now,
      });
    }

    return { ok: true };
  },
});

export const getMyAccess = query({
  args: {
    projectId: v.id("projects"),
    workspaceContextId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { canView: false, canEdit: false };

    const project = await ctx.db.get(args.projectId);
    if (!project) return { canView: false, canEdit: false };

    if (args.workspaceContextId !== undefined) {
      if (project.workspaceId !== args.workspaceContextId) {
        return { canView: false, canEdit: false };
      }
    } else {
      return { canView: false, canEdit: false };
    }

    let member;
    try {
      member = await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);
    } catch {
      return { canView: false, canEdit: false };
    }

    if (member.role === "admin") {
      return { canView: true, canEdit: true };
    }

    if (!project.isAccessRestricted) {
      return { canView: true, canEdit: true };
    }

    const access = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_user", (q: any) =>
        q.eq("projectId", args.projectId).eq("userId", identity.subject),
      )
      .first();
    if (!access) {
      return { canView: false, canEdit: false };
    }

    return {
      canView: access.permission === "view" || access.permission === "edit",
      canEdit: access.permission === "edit",
    };
  },
});

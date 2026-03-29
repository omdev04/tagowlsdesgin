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

async function logActivity(
  ctx: any,
  issueId: any,
  userId: string,
  action: string,
  field?: string,
  oldValue?: string,
  newValue?: string,
) {
  await ctx.db.insert("activityLogs", {
    issueId,
    userId,
    action,
    field,
    oldValue,
    newValue,
    createdAt: Date.now(),
  });
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.string(),
    assigneeIds: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);

    const lastIssue = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .first();

    const issueNumber = (lastIssue?.issueNumber ?? 0) + 1;
    const now = Date.now();

    const issueId = await ctx.db.insert("issues", {
      projectId: args.projectId,
      workspaceId: project.workspaceId,
      title: args.title,
      description: args.description,
      status: "TODO",
      priority: args.priority,
      issueNumber,
      reporterId: identity.subject,
      dueDate: args.dueDate,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    if (args.assigneeIds && args.assigneeIds.length > 0) {
      for (const userId of args.assigneeIds) {
        await ctx.db.insert("issueAssignees", {
          issueId,
          userId,
          assignedBy: identity.subject,
          assignedAt: now,
        });
      }
    }

    await logActivity(ctx, issueId, identity.subject, "issue_created");

    return issueId;
  },
});

export const getByProject = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    priority: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    await requireWorkspaceMember(ctx, project.workspaceId, identity.subject);

    let issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    if (args.status) {
      issues = issues.filter((i) => i.status === args.status);
    }
    if (args.priority) {
      issues = issues.filter((i) => i.priority === args.priority);
    }

    let enriched = await Promise.all(
      issues.map(async (issue) => {
        const assignees = await ctx.db
          .query("issueAssignees")
          .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
          .collect();

        const assigneeUsers = await Promise.all(
          assignees.map(async (a) => {
            const user = await ctx.db
              .query("users")
              .withIndex("by_clerk_id", (q) => q.eq("clerkId", a.userId))
              .first();
            return user;
          }),
        );

        const labels = await ctx.db
          .query("issueLabels")
          .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
          .collect();

        const labelData = await Promise.all(
          labels.map(async (il) => await ctx.db.get(il.labelId)),
        );

        const reporter = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", issue.reporterId))
          .first();

        return {
          ...issue,
          assignees: assigneeUsers.filter(Boolean),
          labels: labelData.filter(Boolean),
          reporter,
        };
      }),
    );

    if (args.assigneeId) {
      enriched = enriched.filter((issue) =>
        issue.assignees.some((a) => a?.clerkId === args.assigneeId),
      );
    }

    enriched.sort((a, b) => b.createdAt - a.createdAt);

    const limit = args.limit ?? enriched.length;
    const offset = args.offset ?? 0;

    return {
      issues: enriched.slice(offset, offset + limit),
      total: enriched.length,
    };
  },
});

export const getById = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const assignees = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    const assigneeUsers = await Promise.all(
      assignees.map(async (a) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", a.userId))
          .first();
        return user;
      }),
    );

    const labels = await ctx.db
      .query("issueLabels")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    const labelData = await Promise.all(
      labels.map(async (il) => await ctx.db.get(il.labelId)),
    );

    const reporter = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", issue.reporterId))
      .first();

    const project = await ctx.db.get(issue.projectId);

    return {
      ...issue,
      assignees: assigneeUsers.filter(Boolean),
      labels: labelData.filter(Boolean),
      reporter,
      project,
    };
  },
});

export const update = mutation({
  args: {
    issueId: v.id("issues"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    const member = await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const assignees = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    const isAssigned = assignees.some((a) => a.userId === identity.subject);

    if (member.role !== "admin" && !isAssigned) {
      throw new Error("Only assigned users or admins can edit this issue");
    }

    const { issueId, ...updates } = args;

    if (args.status && args.status !== issue.status) {
      await logActivity(ctx, issueId, identity.subject, "status_changed", "status", issue.status, args.status);
    }

    if (args.priority && args.priority !== issue.priority) {
      await logActivity(ctx, issueId, identity.subject, "priority_changed", "priority", issue.priority, args.priority);
    }

    return await ctx.db.patch(issueId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    const member = await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const assignees = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    const isAssigned = assignees.some((a) => a.userId === identity.subject);

    if (member.role !== "admin" && !isAssigned) {
      throw new Error("Only assigned users or admins can delete this issue");
    }

    await logActivity(ctx, args.issueId, identity.subject, "issue_deleted");

    return await ctx.db.patch(args.issueId, {
      isDeleted: true,
      updatedAt: Date.now(),
    });
  },
});

export const addAssignee = mutation({
  args: {
    issueId: v.id("issues"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    const member = await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const targetMember = await requireWorkspaceMember(ctx, issue.workspaceId, args.userId);

    const existing = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue_user", (q) =>
        q.eq("issueId", args.issueId).eq("userId", args.userId),
      )
      .first();

    if (existing) throw new Error("User already assigned");

    const assigneeId = await ctx.db.insert("issueAssignees", {
      issueId: args.issueId,
      userId: args.userId,
      assignedBy: identity.subject,
      assignedAt: Date.now(),
    });

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.userId))
      .first();

    await logActivity(
      ctx,
      args.issueId,
      identity.subject,
      "assignee_added",
      "assignee",
      undefined,
      user?.name ?? args.userId,
    );

    return assigneeId;
  },
});

export const removeAssignee = mutation({
  args: {
    issueId: v.id("issues"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const assignee = await ctx.db
      .query("issueAssignees")
      .withIndex("by_issue_user", (q) =>
        q.eq("issueId", args.issueId).eq("userId", args.userId),
      )
      .first();

    if (!assignee) throw new Error("User not assigned");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.userId))
      .first();

    await logActivity(
      ctx,
      args.issueId,
      identity.subject,
      "assignee_removed",
      "assignee",
      user?.name ?? args.userId,
      undefined,
    );

    return await ctx.db.delete(assignee._id);
  },
});

export const addLabel = mutation({
  args: {
    issueId: v.id("issues"),
    labelId: v.id("labels"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const existing = await ctx.db
      .query("issueLabels")
      .withIndex("by_issue_label", (q) =>
        q.eq("issueId", args.issueId).eq("labelId", args.labelId),
      )
      .first();

    if (existing) throw new Error("Label already added");

    const label = await ctx.db.get(args.labelId);

    const issueLabelId = await ctx.db.insert("issueLabels", {
      issueId: args.issueId,
      labelId: args.labelId,
      addedBy: identity.subject,
      addedAt: Date.now(),
    });

    await logActivity(
      ctx,
      args.issueId,
      identity.subject,
      "label_added",
      "label",
      undefined,
      label?.name ?? "unknown",
    );

    return issueLabelId;
  },
});

export const removeLabel = mutation({
  args: {
    issueId: v.id("issues"),
    labelId: v.id("labels"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const issueLabel = await ctx.db
      .query("issueLabels")
      .withIndex("by_issue_label", (q) =>
        q.eq("issueId", args.issueId).eq("labelId", args.labelId),
      )
      .first();

    if (!issueLabel) throw new Error("Label not found on issue");

    const label = await ctx.db.get(args.labelId);

    await logActivity(
      ctx,
      args.issueId,
      identity.subject,
      "label_removed",
      "label",
      label?.name ?? "unknown",
      undefined,
    );

    return await ctx.db.delete(issueLabel._id);
  },
});

export const getActivities = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const activities = await ctx.db
      .query("activityLogs")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .order("desc")
      .collect();

    const enriched = await Promise.all(
      activities.map(async (activity) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", activity.userId))
          .first();
        return { ...activity, user };
      }),
    );

    return enriched;
  },
});

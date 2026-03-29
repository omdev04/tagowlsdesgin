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
    issueId: v.id("issues"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    if (!args.body.trim()) throw new Error("Comment cannot be empty");

    const now = Date.now();
    const commentId = await ctx.db.insert("issueComments", {
      issueId: args.issueId,
      userId: identity.subject,
      body: args.body.trim(),
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, args.issueId, identity.subject, "comment_added");

    return commentId;
  },
});

export const getComments = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Issue not found");

    await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    const comments = await ctx.db
      .query("issueComments")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .order("desc")
      .collect();

    const enriched = await Promise.all(
      comments.map(async (comment) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", comment.userId))
          .first();
        return { ...comment, user };
      }),
    );

    return enriched.reverse();
  },
});

export const updateComment = mutation({
  args: {
    commentId: v.id("issueComments"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    if (comment.userId !== identity.subject) {
      throw new Error("Can only edit your own comments");
    }

    return await ctx.db.patch(args.commentId, {
      body: args.body.trim(),
      isEdited: true,
      updatedAt: Date.now(),
    });
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("issueComments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    const issue = await ctx.db.get(comment.issueId);
    if (!issue) throw new Error("Issue not found");

    const member = await requireWorkspaceMember(ctx, issue.workspaceId, identity.subject);

    if (comment.userId !== identity.subject && member.role !== "admin") {
      throw new Error("Not authorized to delete this comment");
    }

    return await ctx.db.patch(args.commentId, {
      body: "[comment deleted]",
      isDeleted: true,
      updatedAt: Date.now(),
    });
  },
});

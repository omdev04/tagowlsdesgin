import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── Workspace CRUD ──

export const create = mutation({
  args: { name: v.string(), icon: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      ownerId: identity.subject,
      icon: args.icon,
    });

    // Owner is admin by default
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: identity.subject,
      role: "admin",
    });

    return workspaceId;
  },
});

export const getAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.neq(q.field("isPending"), true))
      .collect();

    const workspaces = await Promise.all(
      memberships.map((m) => ctx.db.get(m.workspaceId)),
    );

    return workspaces.filter(Boolean);
  },
});

export const getById = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.db.get(args.workspaceId);
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    if (workspace.ownerId !== identity.subject) throw new Error("Not authorized");

    const { workspaceId, ...rest } = args;
    return await ctx.db.patch(workspaceId, rest);
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    if (workspace.ownerId !== identity.subject) throw new Error("Not authorized");

    // Delete all members
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);

    // Delete all workspace docs
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const d of docs) {
      // Delete document access entries
      const accesses = await ctx.db
        .query("documentAccess")
        .withIndex("by_document", (q) => q.eq("documentId", d._id))
        .collect();
      for (const a of accesses) await ctx.db.delete(a._id);
      await ctx.db.delete(d._id);
    }

    return await ctx.db.delete(args.workspaceId);
  },
});

// ── Member management ──

export const addMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check requester is admin
    const requesterMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();
    if (!requesterMember || requesterMember.role !== "admin")
      throw new Error("Not authorized");

    // Check already a member
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .first();
    if (existing) throw new Error("Already a member");

    return await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: args.userId,
      role: args.role,
    });
  },
});

export const addMemberByEmail = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Check admin
    const requesterMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();
    if (!requesterMember || requesterMember.role !== "admin")
      throw new Error("Not authorized");

    // Check if user exists in DB
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (user) {
      // Check already a member
      const existing = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("userId", user.clerkId),
        )
        .first();
      if (existing) throw new Error("Already a member");

      return await ctx.db.insert("workspaceMembers", {
        workspaceId: args.workspaceId,
        userId: user.clerkId,
        role: args.role,
      });
    }

    // User not in DB yet → create pending invite
    const existingPending = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) =>
        q.and(
          q.eq(q.field("email"), args.email),
          q.eq(q.field("isPending"), true),
        ),
      )
      .first();
    if (existingPending) throw new Error("Invite already sent");

    return await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: `pending_${args.email}`,
      role: args.role,
      email: args.email,
      isPending: true,
    });
  },
});

export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const requesterMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();
    if (!requesterMember || requesterMember.role !== "admin")
      throw new Error("Not authorized");

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .first();
    if (!member) throw new Error("Member not found");

    // Remove all document access for this user in this workspace
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const doc of docs) {
      const access = await ctx.db
        .query("documentAccess")
        .withIndex("by_document_user", (q) =>
          q.eq("documentId", doc._id).eq("userId", args.userId),
        )
        .first();
      if (access) await ctx.db.delete(access._id);
    }

    return await ctx.db.delete(member._id);
  },
});

export const updateMemberRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const requesterMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();
    if (!requesterMember || requesterMember.role !== "admin")
      throw new Error("Not authorized");

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
      )
      .first();
    if (!member) throw new Error("Member not found");

    return await ctx.db.patch(member._id, { role: args.role });
  },
});

export const getMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const enriched = await Promise.all(
      members.map(async (m) => {
        if (m.isPending) {
          return { ...m, user: null };
        }
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", m.userId))
          .first();
        return { ...m, user };
      }),
    );

    return enriched;
  },
});

export const getMyRole = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();

    return member?.role ?? null;
  },
});

// ── Workspace documents ──

export const getDocuments = query({
  args: {
    workspaceId: v.id("workspaces"),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();
    if (!member) throw new Error("Not a member");

    const allDocs = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    // Filter by parent
    const docs = allDocs.filter((d) =>
      args.parentDocument
        ? d.parentDocument === args.parentDocument
        : !d.parentDocument,
    );

    // If admin → see all, otherwise filter by document access
    if (member.role === "admin") {
      return docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    const accessible = [];
    for (const doc of docs) {
      const access = await ctx.db
        .query("documentAccess")
        .withIndex("by_document_user", (q) =>
          q.eq("documentId", doc._id).eq("userId", identity.subject),
        )
        .first();
      if (access) accessible.push(doc);
    }

    return accessible.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
});

export const createDocument = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();
    if (!member || member.role === "viewer")
      throw new Error("Not authorized to create documents");

    return await ctx.db.insert("documents", {
      title: args.title,
      userId: identity.subject,
      isArchived: false,
      isPublished: false,
      workspaceId: args.workspaceId,
      parentDocument: args.parentDocument,
    });
  },
});

// ── Document access ──

export const grantDocumentAccess = mutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || !doc.workspaceId) throw new Error("Not a workspace document");

    // Check admin
    const requesterMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", doc.workspaceId!).eq("userId", identity.subject),
      )
      .first();
    if (!requesterMember || requesterMember.role !== "admin")
      throw new Error("Not authorized");

    // Upsert access
    const existing = await ctx.db
      .query("documentAccess")
      .withIndex("by_document_user", (q) =>
        q.eq("documentId", args.documentId).eq("userId", args.userId),
      )
      .first();

    if (existing) {
      return await ctx.db.patch(existing._id, { permission: args.permission });
    }

    return await ctx.db.insert("documentAccess", {
      documentId: args.documentId,
      userId: args.userId,
      permission: args.permission,
    });
  },
});

export const revokeDocumentAccess = mutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.documentId);
    if (!doc || !doc.workspaceId) throw new Error("Not a workspace document");

    const requesterMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", doc.workspaceId!).eq("userId", identity.subject),
      )
      .first();
    if (!requesterMember || requesterMember.role !== "admin")
      throw new Error("Not authorized");

    const access = await ctx.db
      .query("documentAccess")
      .withIndex("by_document_user", (q) =>
        q.eq("documentId", args.documentId).eq("userId", args.userId),
      )
      .first();

    if (access) await ctx.db.delete(access._id);
  },
});

export const getDocumentAccess = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const accesses = await ctx.db
      .query("documentAccess")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    const enriched = await Promise.all(
      accesses.map(async (a) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", a.userId))
          .first();
        return { ...a, user };
      }),
    );

    return enriched;
  },
});

export const canAccessDocument = query({
  args: {
    documentId: v.id("documents"),
    workspaceContextId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { canAccess: false, canEdit: false };

    const doc = await ctx.db.get(args.documentId);
    if (!doc) return { canAccess: false, canEdit: false };

    if (args.workspaceContextId !== undefined) {
      if (!doc.workspaceId || doc.workspaceId !== args.workspaceContextId) {
        return { canAccess: false, canEdit: false };
      }
    } else if (doc.workspaceId) {
      return { canAccess: false, canEdit: false };
    }

    // Personal doc
    if (!doc.workspaceId) {
      return {
        canAccess: doc.userId === identity.subject,
        canEdit: doc.userId === identity.subject,
      };
    }

    // Workspace doc – check membership
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", doc.workspaceId!).eq("userId", identity.subject),
      )
      .first();

    if (!member) return { canAccess: false, canEdit: false };
    if (member.role === "admin") return { canAccess: true, canEdit: true };

    // Check document-level access
    const access = await ctx.db
      .query("documentAccess")
      .withIndex("by_document_user", (q) =>
        q.eq("documentId", args.documentId).eq("userId", identity.subject),
      )
      .first();

    if (!access) return { canAccess: false, canEdit: false };

    return {
      canAccess: true,
      canEdit: access.permission === "edit",
    };
  },
});

export const searchDocuments = query({
  args: { workspaceId: v.id("workspaces"), query: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", identity.subject),
      )
      .first();
    if (!member) return [];

    const allDocs = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    const q = args.query.toLowerCase();
    const filtered = allDocs.filter((d) =>
      d.title.toLowerCase().includes(q),
    );

    if (member.role === "admin") return filtered;

    const accessible = [];
    for (const doc of filtered) {
      const access = await ctx.db
        .query("documentAccess")
        .withIndex("by_document_user", (q2) =>
          q2.eq("documentId", doc._id).eq("userId", identity.subject),
        )
        .first();
      if (access) accessible.push(doc);
    }
    return accessible;
  },
});

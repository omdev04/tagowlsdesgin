import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    userId: v.string(),
    isArchived: v.boolean(),
    parentDocument: v.optional(v.id("documents")),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.boolean(),
    allowEditing: v.optional(v.boolean()),
    order: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentDocument"])
    .index("by_workspace", ["workspaceId"]),

  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  workspaces: defineTable({
    name: v.string(),
    ownerId: v.string(),
    icon: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.string(), // "admin" | "editor" | "viewer"
    email: v.optional(v.string()),
    isPending: v.optional(v.boolean()),
    joinedAt: v.optional(v.number()),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userAvatar: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_email", ["email"]),

  documentAccess: defineTable({
    documentId: v.id("documents"),
    userId: v.string(),
    permission: v.string(), // "edit" | "view"
  })
    .index("by_document", ["documentId"])
    .index("by_document_user", ["documentId", "userId"]),

  chatChannels: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(),
    isDefault: v.optional(v.boolean()),
    accessType: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"]),

  chatChannelAccess: defineTable({
    channelId: v.id("chatChannels"),
    userId: v.string(),
    grantedBy: v.string(),
  })
    .index("by_channel", ["channelId"])
    .index("by_channel_user", ["channelId", "userId"])
    .index("by_user", ["userId"]),

  chatMessages: defineTable({
    channelId: v.id("chatChannels"),
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    body: v.string(),
    isEdited: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    replyTo: v.optional(v.id("chatMessages")),
  })
    .index("by_channel", ["channelId"])
    .index("by_workspace", ["workspaceId"]),

  chatTypingIndicators: defineTable({
    channelId: v.id("chatChannels"),
    userId: v.string(),
    expiresAt: v.number(),
  })
    .index("by_channel", ["channelId"])
    .index("by_channel_user", ["channelId", "userId"]),

  chatReadStatus: defineTable({
    channelId: v.id("chatChannels"),
    userId: v.string(),
    lastReadMessageId: v.optional(v.id("chatMessages")),
    lastReadAt: v.number(),
  })
    .index("by_channel_user", ["channelId", "userId"]),
});

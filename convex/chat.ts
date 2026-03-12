import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const TYPING_EXPIRY_MS = 4000;

// ── Helper: verify workspace membership ──

async function requireMember(
  ctx: any,
  workspaceId: any,
  userId: string,
) {
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q: any) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .first();
  if (!member || member.isPending) {
    throw new Error("Not a workspace member");
  }
  return member;
}

async function requireChannelAccess(
  ctx: any,
  channelId: any,
  userId: string,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel) {
    throw new Error("Channel not found");
  }

  const member = await requireMember(ctx, channel.workspaceId, userId);

  if (member.role === "admin") {
    return { channel, member };
  }

  if ((channel.accessType ?? "workspace") !== "restricted") {
    return { channel, member };
  }

  const access = await ctx.db
    .query("chatChannelAccess")
    .withIndex("by_channel_user", (q: any) =>
      q.eq("channelId", channelId).eq("userId", userId),
    )
    .first();

  if (!access) {
    throw new Error("You do not have access to this channel");
  }

  return { channel, member };
}

async function requireChannelAdmin(
  ctx: any,
  channelId: any,
  userId: string,
) {
  const channel = await ctx.db.get(channelId);
  if (!channel) {
    throw new Error("Channel not found");
  }

  const member = await requireMember(ctx, channel.workspaceId, userId);
  if (member.role !== "admin") {
    throw new Error("Only admins can manage channel access");
  }

  return { channel, member };
}

// ── Channels ──

export const getChannels = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const member = await requireMember(ctx, args.workspaceId, identity.subject);

    const channels = await ctx.db
      .query("chatChannels")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    if (member.role === "admin") {
      return channels;
    }

    const visibleChannels = await Promise.all(
      channels.map(async (channel) => {
        if ((channel.accessType ?? "workspace") !== "restricted") {
          return channel;
        }

        const access = await ctx.db
          .query("chatChannelAccess")
          .withIndex("by_channel_user", (q) =>
            q.eq("channelId", channel._id).eq("userId", identity.subject),
          )
          .first();

        return access ? channel : null;
      }),
    );

    return visibleChannels.filter(Boolean);
  },
});

export const createChannel = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.optional(v.string()),
    accessType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const member = await requireMember(ctx, args.workspaceId, identity.subject);
    if (member.role !== "admin") throw new Error("Only admins can create channels");

    const accessType = args.accessType === "restricted" ? "restricted" : "workspace";

    const channelId = await ctx.db.insert("chatChannels", {
      workspaceId: args.workspaceId,
      name: args.name.toLowerCase().replace(/\s+/g, "-"),
      description: args.description,
      createdBy: identity.subject,
      accessType,
    });

    if (accessType === "restricted") {
      await ctx.db.insert("chatChannelAccess", {
        channelId,
        userId: identity.subject,
        grantedBy: identity.subject,
      });
    }

    return channelId;
  },
});

export const deleteChannel = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error("Channel not found");

    const member = await requireMember(ctx, channel.workspaceId, identity.subject);
    if (member.role !== "admin") throw new Error("Only admins can delete channels");

    if (channel.isDefault) throw new Error("Cannot delete the default channel");

    // Delete all messages in channel
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
    for (const msg of messages) await ctx.db.delete(msg._id);

    // Delete typing indicators
    const typings = await ctx.db
      .query("chatTypingIndicators")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
    for (const t of typings) await ctx.db.delete(t._id);

    // Delete read statuses
    const statuses = await ctx.db
      .query("chatReadStatus")
      .withIndex("by_channel_user", (q) => q.eq("channelId", args.channelId))
      .collect();
    for (const s of statuses) await ctx.db.delete(s._id);

    const accessRows = await ctx.db
      .query("chatChannelAccess")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
    for (const accessRow of accessRows) await ctx.db.delete(accessRow._id);

    return await ctx.db.delete(args.channelId);
  },
});

// Auto-create "general" channel when workspace needs it
export const ensureDefaultChannel = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await requireMember(ctx, args.workspaceId, identity.subject);

    const existing = await ctx.db
      .query("chatChannels")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("chatChannels", {
      workspaceId: args.workspaceId,
      name: "general",
      description: "General workspace chat",
      createdBy: identity.subject,
      isDefault: true,
      accessType: "workspace",
    });
  },
});

export const getChannelAccess = query({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { channel, member } = await requireChannelAccess(
      ctx,
      args.channelId,
      identity.subject,
    );

    const workspaceMembers = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", channel.workspaceId))
      .collect();

    const accessRows = await ctx.db
      .query("chatChannelAccess")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();

    const accessUserIds = new Set(accessRows.map((row) => row.userId));

    const members = await Promise.all(
      workspaceMembers
        .filter((workspaceMember) => !workspaceMember.isPending)
        .map(async (workspaceMember) => {
          const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", workspaceMember.userId))
            .first();

          return {
            ...workspaceMember,
            user,
            hasAccess:
              (channel.accessType ?? "workspace") !== "restricted" ||
              workspaceMember.role === "admin" ||
              accessUserIds.has(workspaceMember.userId),
          };
        }),
    );

    return {
      channel,
      viewerRole: member.role,
      members,
    };
  },
});

export const updateChannelAccessType = mutation({
  args: {
    channelId: v.id("chatChannels"),
    accessType: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { channel } = await requireChannelAdmin(ctx, args.channelId, identity.subject);

    const accessType = args.accessType === "restricted" ? "restricted" : "workspace";
    if (channel.isDefault && accessType === "restricted") {
      throw new Error("Default channel must stay workspace-visible");
    }

    await ctx.db.patch(args.channelId, { accessType });

    if (accessType === "workspace") {
      const accessRows = await ctx.db
        .query("chatChannelAccess")
        .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
        .collect();
      for (const accessRow of accessRows) {
        await ctx.db.delete(accessRow._id);
      }
      return { accessType };
    }

    const existing = await ctx.db
      .query("chatChannelAccess")
      .withIndex("by_channel_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", identity.subject),
      )
      .first();

    if (!existing) {
      await ctx.db.insert("chatChannelAccess", {
        channelId: args.channelId,
        userId: identity.subject,
        grantedBy: identity.subject,
      });
    }

    return { accessType };
  },
});

export const updateChannelMemberAccess = mutation({
  args: {
    channelId: v.id("chatChannels"),
    userId: v.string(),
    hasAccess: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { channel } = await requireChannelAdmin(ctx, args.channelId, identity.subject);

    if ((channel.accessType ?? "workspace") !== "restricted") {
      throw new Error("Channel access can only be managed for restricted channels");
    }

    const workspaceMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", channel.workspaceId).eq("userId", args.userId),
      )
      .first();

    if (!workspaceMember || workspaceMember.isPending) {
      throw new Error("User is not an active workspace member");
    }

    if (workspaceMember.role === "admin") {
      throw new Error("Admins always have access to every channel");
    }

    const existing = await ctx.db
      .query("chatChannelAccess")
      .withIndex("by_channel_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", args.userId),
      )
      .first();

    if (args.hasAccess) {
      if (!existing) {
        await ctx.db.insert("chatChannelAccess", {
          channelId: args.channelId,
          userId: args.userId,
          grantedBy: identity.subject,
        });
      }
      return { hasAccess: true };
    }

    if (args.userId === identity.subject) {
      throw new Error("Admins cannot remove their own access here");
    }

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { hasAccess: false };
  },
});

// ── Messages ──

export const getMessages = query({
  args: {
    channelId: v.id("chatChannels"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireChannelAccess(ctx, args.channelId, identity.subject);

    const limit = args.limit ?? 50;

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(limit);

    // Enrich with user data
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", msg.userId))
          .first();

        let replyToMsg = null;
        if (msg.replyTo) {
          const reply = await ctx.db.get(msg.replyTo);
          if (reply) {
            const replyUser = await ctx.db
              .query("users")
              .withIndex("by_clerk_id", (q) => q.eq("clerkId", reply.userId))
              .first();
            replyToMsg = {
              ...reply,
              user: replyUser
                ? { name: replyUser.name, imageUrl: replyUser.imageUrl }
                : null,
            };
          }
        }

        return {
          ...msg,
          user: user
            ? { name: user.name, imageUrl: user.imageUrl, email: user.email }
            : null,
          replyToMessage: replyToMsg,
        };
      }),
    );

    return enriched.reverse();
  },
});

export const sendMessage = mutation({
  args: {
    channelId: v.id("chatChannels"),
    body: v.string(),
    replyTo: v.optional(v.id("chatMessages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { channel } = await requireChannelAccess(ctx, args.channelId, identity.subject);

    if (!args.body.trim()) throw new Error("Message cannot be empty");

    // Clear typing indicator
    const typing = await ctx.db
      .query("chatTypingIndicators")
      .withIndex("by_channel_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", identity.subject),
      )
      .first();
    if (typing) await ctx.db.delete(typing._id);

    const messageId = await ctx.db.insert("chatMessages", {
      channelId: args.channelId,
      workspaceId: channel.workspaceId,
      userId: identity.subject,
      body: args.body.trim(),
      replyTo: args.replyTo,
    });

    // Update read status for sender
    const readStatus = await ctx.db
      .query("chatReadStatus")
      .withIndex("by_channel_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", identity.subject),
      )
      .first();

    if (readStatus) {
      await ctx.db.patch(readStatus._id, {
        lastReadMessageId: messageId,
        lastReadAt: Date.now(),
      });
    } else {
      await ctx.db.insert("chatReadStatus", {
        channelId: args.channelId,
        userId: identity.subject,
        lastReadMessageId: messageId,
        lastReadAt: Date.now(),
      });
    }

    return messageId;
  },
});

export const editMessage = mutation({
  args: {
    messageId: v.id("chatMessages"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.userId !== identity.subject)
      throw new Error("Can only edit your own messages");

    return await ctx.db.patch(args.messageId, {
      body: args.body.trim(),
      isEdited: true,
    });
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Owner can delete their own, admin can delete any
    if (message.userId !== identity.subject) {
      const member = await requireMember(
        ctx,
        message.workspaceId,
        identity.subject,
      );
      if (member.role !== "admin")
        throw new Error("Not authorized to delete this message");
    }

    return await ctx.db.patch(args.messageId, {
      body: "[message deleted]",
      isDeleted: true,
    });
  },
});

// ── Typing indicators ──

export const setTyping = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireChannelAccess(ctx, args.channelId, identity.subject);

    const existing = await ctx.db
      .query("chatTypingIndicators")
      .withIndex("by_channel_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", identity.subject),
      )
      .first();

    const expiresAt = Date.now() + TYPING_EXPIRY_MS;

    if (existing) {
      return await ctx.db.patch(existing._id, { expiresAt });
    }

    return await ctx.db.insert("chatTypingIndicators", {
      channelId: args.channelId,
      userId: identity.subject,
      expiresAt,
    });
  },
});

export const clearTyping = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireChannelAccess(ctx, args.channelId, identity.subject);

    const existing = await ctx.db
      .query("chatTypingIndicators")
      .withIndex("by_channel_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", identity.subject),
      )
      .first();

    if (existing) await ctx.db.delete(existing._id);
  },
});

export const getTypingUsers = query({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireChannelAccess(ctx, args.channelId, identity.subject);

    const now = Date.now();

    const indicators = await ctx.db
      .query("chatTypingIndicators")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .filter((q) =>
        q.and(
          q.gt(q.field("expiresAt"), now),
          q.neq(q.field("userId"), identity.subject),
        ),
      )
      .collect();

    const users = await Promise.all(
      indicators.map(async (ind) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", ind.userId))
          .first();
        return user ? { name: user.name } : null;
      }),
    );

    return users.filter(Boolean);
  },
});

// ── Read status / Unread count ──

export const markAsRead = mutation({
  args: {
    channelId: v.id("chatChannels"),
    lastReadMessageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await requireChannelAccess(ctx, args.channelId, identity.subject);

    const existing = await ctx.db
      .query("chatReadStatus")
      .withIndex("by_channel_user", (q) =>
        q.eq("channelId", args.channelId).eq("userId", identity.subject),
      )
      .first();

    if (existing) {
      return await ctx.db.patch(existing._id, {
        lastReadMessageId: args.lastReadMessageId,
        lastReadAt: Date.now(),
      });
    }

    return await ctx.db.insert("chatReadStatus", {
      channelId: args.channelId,
      userId: identity.subject,
      lastReadMessageId: args.lastReadMessageId,
      lastReadAt: Date.now(),
    });
  },
});

export const getUnreadCounts = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const member = await requireMember(ctx, args.workspaceId, identity.subject);

    const channels = await ctx.db
      .query("chatChannels")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    const visibleChannels = member.role === "admin"
      ? channels
      : (
        await Promise.all(
          channels.map(async (channel) => {
            if ((channel.accessType ?? "workspace") !== "restricted") {
              return channel;
            }

            const access = await ctx.db
              .query("chatChannelAccess")
              .withIndex("by_channel_user", (q) =>
                q.eq("channelId", channel._id).eq("userId", identity.subject),
              )
              .first();

            return access ? channel : null;
          }),
        )
      ).filter((channel): channel is NonNullable<typeof channel> => channel !== null);

    const counts: Record<string, number> = {};

    for (const channel of visibleChannels) {
      const readStatus = await ctx.db
        .query("chatReadStatus")
        .withIndex("by_channel_user", (q) =>
          q.eq("channelId", channel._id).eq("userId", identity.subject),
        )
        .first();

      if (!readStatus) {
        // Never read → count all messages
        const allMsgs = await ctx.db
          .query("chatMessages")
          .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
          .collect();
        counts[channel._id] = allMsgs.filter(
          (m) => !m.isDeleted && m.userId !== identity.subject,
        ).length;
      } else if (readStatus.lastReadMessageId) {
        const lastReadMsg = await ctx.db.get(readStatus.lastReadMessageId);
        if (lastReadMsg) {
          const allMsgs = await ctx.db
            .query("chatMessages")
            .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
            .collect();
          const unread = allMsgs.filter(
            (m) =>
              !m.isDeleted &&
              m.userId !== identity.subject &&
              m._creationTime > lastReadMsg._creationTime,
          );
          counts[channel._id] = unread.length;
        }
      }
    }

    return counts;
  },
});

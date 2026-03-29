"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

import { useChat } from "@/hooks/useChat";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";

import { cn } from "@/lib/utils";
import {
  Hash,
  MessageCircle,
  Plus,
  Trash2,
  Users,
  ChevronDown,
  UserCog,
  Shield,
  Lock,
  Globe,
  Check,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export const ChatPanel = () => {
  const { user } = useUser();
  const { activeWorkspaceId } = useWorkspace();
  const { isChatOpen, activeChannelId, setActiveChannel } = useChat();

  const [creatingChannel, setCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const channels = useQuery(
    api.chat.getChannels,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );
  const visibleChannels = channels ?? [];
  const firstVisibleChannel = visibleChannels.find((channel) => channel !== null) ?? null;
  const resolvedChannelId = activeChannelId && visibleChannels.some((channel) => channel?._id === activeChannelId)
    ? activeChannelId
    : firstVisibleChannel?._id ?? null;

  const channelAccess = useQuery(
    api.chat.getChannelAccess,
    resolvedChannelId ? { channelId: resolvedChannelId } : "skip",
  );

  const messages = useQuery(
    api.chat.getMessages,
    resolvedChannelId ? { channelId: resolvedChannelId, limit: 100 } : "skip",
  );

  const typingUsers = useQuery(
    api.chat.getTypingUsers,
    resolvedChannelId ? { channelId: resolvedChannelId } : "skip",
  );

  const unreadCounts = useQuery(
    api.chat.getUnreadCounts,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const myRole = useQuery(
    api.workspaces.getMyRole,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const workspace = useQuery(
    api.workspaces.getById,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const members = useQuery(
    api.workspaces.getMembers,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const ensureDefault = useMutation(api.chat.ensureDefaultChannel);
  const createChannel = useMutation(api.chat.createChannel);
  const deleteChannel = useMutation(api.chat.deleteChannel);
  const markAsRead = useMutation(api.chat.markAsRead);
  const updateChannelAccessType = useMutation(api.chat.updateChannelAccessType);
  const updateChannelMemberAccess = useMutation(api.chat.updateChannelMemberAccess);

  const isAdmin = myRole === "admin";

  useEffect(() => {
    if (!activeWorkspaceId || !isChatOpen) return;
    ensureDefault({ workspaceId: activeWorkspaceId })
      .then((id) => {
        if (!activeChannelId) setActiveChannel(id);
      })
      .catch(() => {});
  }, [activeWorkspaceId, isChatOpen]);

  useEffect(() => {
    if (!firstVisibleChannel) {
      return;
    }

    const hasActiveChannel = activeChannelId
      ? visibleChannels.some((channel) => channel?._id === activeChannelId)
      : false;

    if (!hasActiveChannel) {
      setActiveChannel(firstVisibleChannel._id);
    }
  }, [visibleChannels, activeChannelId]);

  // Scroll-to-bottom logic
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setShowScrollBtn(true);
    }
  }, [messages?.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollBtn(false);
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) setShowScrollBtn(false);
    else setShowScrollBtn(true);
  };

  const markChannelRead = useCallback(() => {
    if (!resolvedChannelId || !messages || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    markAsRead({ channelId: resolvedChannelId, lastReadMessageId: lastMsg._id }).catch(() => {});
  }, [resolvedChannelId, messages, markAsRead]);

  useEffect(() => {
    if (isChatOpen && resolvedChannelId) markChannelRead();
  }, [isChatOpen, resolvedChannelId, messages?.length]);

  const handleCreateChannel = () => {
    if (!activeWorkspaceId || !newChannelName.trim()) return;
    toast.promise(
      createChannel({ workspaceId: activeWorkspaceId, name: newChannelName.trim() }),
      {
        loading: "Creating channel...",
        success: (id) => {
          setActiveChannel(id);
          setCreatingChannel(false);
          setNewChannelName("");
          return "Channel created!";
        },
        error: "Failed to create channel.",
      },
    );
  };

  const handleDeleteChannel = (channelId: Id<"chatChannels">) => {
    toast.promise(deleteChannel({ channelId }), {
      loading: "Deleting...",
      success: () => {
        if (activeChannelId === channelId) setActiveChannel(null);
        return "Channel deleted.";
      },
      error: "Failed to delete channel.",
    });
  };

  const handleAccessTypeChange = (accessType: "workspace" | "restricted") => {
    if (!resolvedChannelId) return;

    toast.promise(
      updateChannelAccessType({ channelId: resolvedChannelId, accessType }),
      {
        loading: "Updating channel access...",
        success: accessType === "restricted"
          ? "Channel is now restricted."
          : "Channel is now visible to the whole workspace.",
        error: (error) => error?.message ?? "Failed to update channel access.",
      },
    );
  };

  const handleMemberAccessToggle = (userId: string, hasAccess: boolean) => {
    if (!resolvedChannelId) return;

    toast.promise(
      updateChannelMemberAccess({ channelId: resolvedChannelId, userId, hasAccess }),
      {
        loading: hasAccess ? "Granting access..." : "Removing access...",
        success: hasAccess ? "Channel access granted." : "Channel access removed.",
        error: (error) => error?.message ?? "Failed to update member access.",
      },
    );
  };

  if (!isChatOpen || !activeWorkspaceId) return null;

  const activeChannel = visibleChannels.find((channel) => channel?._id === resolvedChannelId) ?? null;
  const workspaceMemberCount = members?.filter((m) => !m.isPending).length ?? 0;
  const currentAccessType = (channelAccess?.channel.accessType ?? activeChannel?.accessType ?? "workspace") as "workspace" | "restricted";
  const visibleChannelMembers = channelAccess?.members.filter((member) => member.hasAccess) ?? [];
  const listedChannelMembers = channelAccess?.members ?? [];

  const typingText =
    typingUsers && typingUsers.length > 0
      ? typingUsers.length === 1
        ? `${typingUsers[0]!.name} is typing...`
        : `${typingUsers.length} people are typing...`
      : null;

  // Group consecutive messages by same sender
  const groupedMessages = messages?.reduce(
    (acc: (typeof messages[number] & { isGrouped?: boolean })[], msg, i) => {
      const prev = messages[i - 1];
      const sameUser = prev && prev.userId === msg.userId;
      const closeInTime =
        prev && msg._creationTime - prev._creationTime < 5 * 60 * 1000;
      acc.push({ ...msg, isGrouped: !!(sameUser && closeInTime) });
      return acc;
    },
    [],
  ) ?? [];

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-[#0a0a0a]">
      {/* ── Left: Channel Sidebar ── */}
      <div className="flex w-60 shrink-0 flex-col border-r bg-neutral-50 dark:border-[#222] dark:bg-[#111]">
        {/* Workspace name */}
        <div className="flex items-center gap-2 border-b px-4 py-4 dark:border-[#222]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 text-sm font-bold text-white shadow-sm">
            {workspace?.icon ?? workspace?.name?.charAt(0)?.toUpperCase() ?? "W"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{workspace?.name ?? "Workspace"}</p>
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <Users className="h-3 w-3" />
              {workspaceMemberCount} members
            </p>
          </div>
        </div>

        {/* Channels section */}
        <div className="flex flex-col flex-1 overflow-hidden p-2">
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
              Channels
            </span>
            {isAdmin && (
              <button
                onClick={() => setCreatingChannel(!creatingChannel)}
                className="text-muted-foreground rounded p-0.5 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {creatingChannel && (
            <div className="mb-2 px-2">
              <Input
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="channel-name"
                className="h-7 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateChannel();
                  if (e.key === "Escape") {
                    setCreatingChannel(false);
                    setNewChannelName("");
                  }
                }}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-0.5">
            {visibleChannels.map((ch) => {
              if (!ch) return null;
              const unread = unreadCounts?.[ch._id] ?? 0;
              const isActive = activeChannelId === ch._id;
              return (
                <div key={ch._id} className="group relative flex items-center rounded-md">
                  <button
                    onClick={() => setActiveChannel(ch._id)}
                    className={cn(
                      "flex flex-1 min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      isActive
                        ? "bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400 font-medium"
                        : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-[#222]",
                    )}
                  >
                    <Hash
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-blue-500 dark:text-blue-400" : "text-neutral-500",
                      )}
                    />
                    <span className="truncate font-medium">{ch.name}</span>
                    {(ch.accessType ?? "workspace") === "restricted" && (
                      <Lock className={cn(
                        "ml-auto h-3 w-3 shrink-0",
                        isActive ? "text-white/80" : "text-neutral-400",
                      )} />
                    )}
                    {unread > 0 && !isActive && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                  {isAdmin && !ch.isDefault && (
                    <button
                      onClick={() => handleDeleteChannel(ch._id)}
                      className="absolute right-1 hidden shrink-0 rounded p-1 text-red-400 hover:bg-red-100 group-hover:block dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Current user */}
        <div className="flex items-center gap-2 border-t px-4 py-3 dark:border-[#222]">
          <div className="relative">
            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-blue-500 text-xs font-bold text-white shadow-sm">
              {user?.firstName?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border-2 border-white bg-green-500 dark:border-[#111]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{user?.fullName}</p>
            <p className="text-muted-foreground text-[10px]">Online</p>
          </div>
        </div>
      </div>

      {/* ── Right: Messages + Members area ── */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Messages column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {resolvedChannelId && activeChannel ? (
            <>
              {/* Channel header */}
              <div className="flex items-center gap-3 border-b px-6 py-3.5 dark:border-[#222]">
                <Hash className="h-5 w-5 text-neutral-400" />
                <div>
                  <h2 className="text-base font-semibold">{activeChannel.name}</h2>
                  {activeChannel.description && (
                    <p className="text-muted-foreground text-xs">{activeChannel.description}</p>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setShowMembers((v) => !v)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors border",
                      showMembers
                        ? "border-transparent bg-neutral-200 text-neutral-900 dark:bg-[#222] dark:text-white"
                        : "border-transparent text-neutral-500 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a]",
                    )}
                    title="Toggle team members"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    <span>Channel Access</span>
                    {visibleChannelMembers.length > 0 && (
                      <span className={cn(
                        "rounded-full px-1.5 py-0 text-[10px] font-bold",
                        showMembers ? "bg-white/20 text-white" : "bg-neutral-200 dark:bg-neutral-700"
                      )}>{visibleChannelMembers.length}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="relative flex-1 overflow-y-auto"
              >
                {messages && messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                      <Hash className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold">Welcome to #{activeChannel.name}!</h3>
                    <p className="text-muted-foreground max-w-sm text-center text-sm">
                      This is the start of <strong>#{activeChannel.name}</strong>.
                      {activeChannel.description && ` ${activeChannel.description}`}
                    </p>
                  </div>
                )}

                <div className="py-4">
                  {groupedMessages.map((msg) => (
                    <ChatMessage
                      key={msg._id}
                      message={msg}
                      isOwnMessage={msg.userId === user?.id}
                      isAdmin={isAdmin}
                      isGrouped={msg.isGrouped}
                    />
                  ))}
                </div>
                <div ref={messagesEndRef} />
              </div>

              {showScrollBtn && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-20 right-8 flex items-center gap-1 rounded-full border bg-white px-3 py-1.5 text-xs font-medium shadow-md hover:bg-neutral-50 dark:border-[#333] dark:bg-[#1a1a1a] dark:hover:bg-[#222]"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  New messages
                </button>
              )}

              <div className="min-h-5 px-6">
                {typingText && (
                  <span className="text-muted-foreground animate-pulse text-xs italic">
                    {typingText}
                  </span>
                )}
              </div>

              <div className="px-4 pb-4">
                <ChatInput channelId={resolvedChannelId} />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <MessageCircle className="h-16 w-16 text-neutral-200 dark:text-neutral-700" />
              <p className="text-muted-foreground text-sm">Select a channel to start chatting</p>
            </div>
          )}
        </div>

        {/* ── Channel Access sidebar ── */}
        {showMembers && (
          <div className="flex w-64 shrink-0 flex-col border-l bg-neutral-50 dark:border-[#222] dark:bg-[#111]">
            <div className="flex items-center justify-between border-b px-4 py-3.5 dark:border-[#222]">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold">Channel Access</span>
              </div>
              <button
                onClick={() => setShowMembers(false)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {activeChannel && (
              <div className="border-b px-3 py-3 dark:border-[#222]">
                <div className="mb-3 flex items-center gap-2 rounded-md bg-white px-3 py-2 shadow-sm dark:bg-[#1a1a1a] dark:border dark:border-[#222]">
                  {(currentAccessType ?? "workspace") === "workspace" ? (
                    <Globe className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-amber-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {(currentAccessType ?? "workspace") === "workspace" ? "Workspace visible" : "Restricted channel"}
                    </p>
                    <p className="text-muted-foreground text-[10px]">
                      {(currentAccessType ?? "workspace") === "workspace"
                        ? "All workspace members can see this channel."
                        : "Only selected members and admins can see this channel."}
                    </p>
                  </div>
                </div>

                {isAdmin && !activeChannel.isDefault && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleAccessTypeChange("workspace")}
                      className={cn(
                        "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                        currentAccessType === "workspace"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "border-neutral-200 hover:bg-neutral-100 dark:border-[#333] dark:hover:bg-[#1a1a1a]",
                      )}
                    >
                      Workspace
                    </button>
                    <button
                      onClick={() => handleAccessTypeChange("restricted")}
                      className={cn(
                        "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                        currentAccessType === "restricted"
                          ? "border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                          : "border-neutral-200 hover:bg-neutral-100 dark:border-[#333] dark:hover:bg-[#1a1a1a]",
                      )}
                    >
                      Restricted
                    </button>
                  </div>
                )}

                {activeChannel.isDefault && (
                  <p className="text-muted-foreground text-[11px]">
                    The default channel always stays visible to the full workspace.
                  </p>
                )}
              </div>
            )}

            {!isAdmin && (
              <div className="mx-3 mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                <Shield className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Only admins can change channel access.
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2">
              {listedChannelMembers.length > 0 && (
                <div className="mb-1">
                  <p className="text-muted-foreground mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider">
                    Workspace Members — {visibleChannelMembers.length} allowed
                  </p>
                  {listedChannelMembers
                    .map((member) => {
                      const isSelf = member.userId === user?.id;
                      const isWorkspaceVisible = currentAccessType === "workspace";
                      const canToggle = isAdmin && !isWorkspaceVisible && member.role !== "admin";
                      return (
                        <div
                          key={member._id}
                          className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={member.user?.imageUrl ?? member.userAvatar} />
                            <AvatarFallback className="text-[10px] font-semibold">
                              {(member.user?.name ?? member.userName ?? member.userEmail ?? "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {member.user?.name ?? member.userName ?? member.userEmail}
                              {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                            </p>
                            <div className="flex items-center gap-1">
                              {member.role === "admin" ? (
                                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                  <Shield className="h-2.5 w-2.5" /> Admin
                                </span>
                              ) : member.hasAccess ? (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                  Has access
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">No access</span>
                              )}
                            </div>
                          </div>

                          {member.role === "admin" && (
                            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
                              Always
                            </span>
                          )}

                          {canToggle && (
                            <button
                              onClick={() => handleMemberAccessToggle(member.userId, !member.hasAccess)}
                              className={cn(
                                "rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                                member.hasAccess
                                  ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                                  : "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:hover:bg-emerald-950/30",
                              )}
                              title={member.hasAccess ? "Remove access" : "Grant access"}
                            >
                              {member.hasAccess ? "Remove" : "Allow"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {currentAccessType === "restricted" && visibleChannelMembers.length === 0 && (
                <div className="mx-2 rounded-md border border-dashed px-3 py-4 text-center dark:border-[#333]">
                  <Lock className="mx-auto mb-2 h-4 w-4 text-amber-600" />
                  <p className="text-xs font-medium">No explicit channel members yet</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    Add workspace members here. Admins will still see the channel automatically.
                  </p>
                </div>
              )}

              {currentAccessType === "workspace" && (
                <div className="mx-2 rounded-md border border-dashed px-3 py-4 text-center dark:border-[#333]">
                  <Check className="mx-auto mb-2 h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-medium">Everyone in the workspace can access this channel</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    Switch this channel to restricted mode if only selected members should see it.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

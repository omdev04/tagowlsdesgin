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
import { ChannelMeetPanel } from "./ChannelMeetPanel";

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
  Video,
  ChevronRight,
  VolumeX,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

const RTC_BASE_URL =
  process.env.NEXT_PUBLIC_RTC_BACKEND_URL || "https://rtc-backend-seven.vercel.app";
const RTC_RINGTONE_URL = process.env.NEXT_PUBLIC_MEET_RINGTONE_URL || "/sounds/minion_beep.mp3";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

type RtcNotification = {
  id?: string;
  type?: string;
  roomId?: string;
  fromUserId?: string;
  message?: string;
  createdAt?: number;
};

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
  const [isMeetOpen, setIsMeetOpen] = useState(false);
  const [isMeetMinimized, setIsMeetMinimized] = useState(false);
  const [meetCallState, setMeetCallState] = useState<"idle" | "connecting" | "joined">("idle");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRinging, setIsRinging] = useState(false);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneActiveRef = useRef(false);
  const pushSubscriptionRef = useRef<PushSubscription | null>(null);
  const pushPromptedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

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

  useEffect(() => {
    setIsMeetOpen(false);
    setIsMeetMinimized(false);
    setMeetCallState("idle");
  }, [resolvedChannelId]);

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

  const isMeetRunning = isMeetOpen && meetCallState === "joined";
  const showMeetFullscreen = isMeetRunning && !isMeetMinimized;
  const meetViewMode = !isMeetOpen
    ? "inline"
    : showMeetFullscreen
      ? "fullscreen"
      : isMeetMinimized
        ? "minimized"
        : "inline";

  const handleMeetToggle = () => {
    if (isMeetRunning && isMeetMinimized) {
      setIsMeetMinimized(false);
      return;
    }

    setIsMeetOpen((value) => {
      const next = !value;
      if (!next) {
        setIsMeetMinimized(false);
        setMeetCallState("idle");
      }
      return next;
    });
  };

  const handleMeetClose = () => {
    setIsMeetOpen(false);
    setIsMeetMinimized(false);
    setMeetCallState("idle");
  };

  const stopRingtoneLoop = useCallback(() => {
    ringtoneActiveRef.current = false;

    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    if (ringtoneStopTimeoutRef.current) {
      clearTimeout(ringtoneStopTimeoutRef.current);
      ringtoneStopTimeoutRef.current = null;
    }

    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause();
      ringtoneAudioRef.current.currentTime = 0;
    }

    setIsRinging(false);
  }, []);

  const ensureRingtoneAudio = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    if (!ringtoneAudioRef.current) {
      const audio = new Audio(RTC_RINGTONE_URL);
      audio.loop = true;
      audio.preload = "auto";
      ringtoneAudioRef.current = audio;
    }

    return ringtoneAudioRef.current;
  }, []);

  const playRingtoneBurst = useCallback(() => {
    if (typeof window === "undefined") return;

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    const ringNote = (offset: number, frequency: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration + 0.03);
    };

    // Teams-like two short notes.
    ringNote(0, 880, 0.2);
    ringNote(0.26, 988, 0.24);
  }, []);

  const startRingtoneLoop = useCallback(() => {
    if (ringtoneActiveRef.current) {
      return;
    }

    ringtoneActiveRef.current = true;

    setIsRinging(true);

    const audio = ensureRingtoneAudio();
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        playRingtoneBurst();
        ringtoneIntervalRef.current = setInterval(() => {
          playRingtoneBurst();
        }, 1800);
      });
    } else {
      playRingtoneBurst();
      ringtoneIntervalRef.current = setInterval(() => {
        playRingtoneBurst();
      }, 1800);
    }

    ringtoneStopTimeoutRef.current = setTimeout(() => {
      stopRingtoneLoop();
    }, 30000);
  }, [ensureRingtoneAudio, playRingtoneBurst, stopRingtoneLoop]);

  const resolveChannelIdFromRoom = useCallback((roomId?: string) => {
    if (!roomId) return null;

    const matched = visibleChannels.find((channel) => {
      if (!channel) return false;
      const normalized = `channel_meet_${channel._id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      return normalized === roomId;
    });

    return matched?._id ?? null;
  }, [visibleChannels]);

  const openMeetFromInvite = useCallback((roomId?: string) => {
    const channelId = resolveChannelIdFromRoom(roomId);
    if (!channelId) {
      toast.info("Meet (Beta) invite received. Open the channel to join the call.");
      return;
    }

    setActiveChannel(channelId);
    setIsMeetOpen(true);
    setIsMeetMinimized(false);
  }, [resolveChannelIdFromRoom, setActiveChannel]);

  const registerPushSubscription = useCallback(async () => {
    if (!user?.id || typeof window === "undefined") {
      return;
    }

    if (!window.isSecureContext) {
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }

    if (Notification.permission === "default" && !pushPromptedRef.current) {
      pushPromptedRef.current = true;

      const alreadyPrompted = window.localStorage.getItem("meet_push_prompted") === "1";
      if (!alreadyPrompted) {
        window.localStorage.setItem("meet_push_prompted", "1");

        toast.message("Enable Meet (Beta) alerts", {
          description: "Allow notifications to receive Meet (Beta) invites when this tab is inactive.",
          action: {
            label: "Enable",
            onClick: () => {
              Notification.requestPermission().then((permission) => {
                if (permission === "granted") {
                  registerPushSubscription().catch(() => {});
                }
              });
            },
          },
        });
      }
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    const keyResponse = await fetch(`${RTC_BASE_URL}/push/public-key`);
    if (!keyResponse.ok) {
      return;
    }

    const keyPayload = await keyResponse.json().catch(() => ({}));
    const publicKey = typeof keyPayload.publicKey === "string" ? keyPayload.publicKey.trim() : "";
    if (!publicKey) {
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    pushSubscriptionRef.current = subscription;

    const payload = subscription.toJSON();
    await fetch(`${RTC_BASE_URL}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: user.id,
        subscription: {
          endpoint: payload.endpoint,
          keys: payload.keys,
        },
      }),
    });
  }, [user?.id]);

  useEffect(() => {
    registerPushSubscription().catch(() => {});
  }, [registerPushSubscription]);

  useEffect(() => {
    return () => {
      const userId = user?.id;
      const subscription = pushSubscriptionRef.current;
      if (!userId || !subscription) {
        return;
      }

      fetch(`${RTC_BASE_URL}/push/unsubscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          endpoint: subscription.endpoint,
        }),
      }).catch(() => {});
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    let stopped = false;

    const pollNotifications = async () => {
      try {
        const response = await fetch(
          `${RTC_BASE_URL}/notifications?userId=${encodeURIComponent(user.id)}`,
        );
        if (!response.ok || stopped) {
          return;
        }

        const payload = await response.json().catch(() => ({}));
        if (stopped) {
          return;
        }

        const notifications = Array.isArray(payload.notifications)
          ? (payload.notifications as RtcNotification[])
          : [];

        const invites = notifications.filter((notification) => notification?.type === "meet_invite");
        if (invites.length === 0) {
          return;
        }

        const latestInvite = invites[invites.length - 1];
        startRingtoneLoop();

        toast.info("Incoming Meet (Beta) invite", {
          description: `${latestInvite?.fromUserId || "A teammate"} started Channel Meet (Beta).`,
          duration: 12000,
          action: {
            label: "Open Meet (Beta)",
            onClick: () => {
              openMeetFromInvite(latestInvite?.roomId);
              stopRingtoneLoop();
            },
          },
        });
      } catch {
        // Silent retry on next poll.
      }
    };

    pollNotifications();
    const interval = setInterval(pollNotifications, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [openMeetFromInvite, startRingtoneLoop, stopRingtoneLoop, user?.id]);

  useEffect(() => {
    return () => {
      stopRingtoneLoop();

      if (ringtoneAudioRef.current) {
        ringtoneAudioRef.current.pause();
        ringtoneAudioRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stopRingtoneLoop]);

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
    <div className="flex h-full w-full overflow-hidden bg-background">
      {isSidebarOpen && (
        <aside className="flex w-64 shrink-0 flex-col border-r bg-card/80 backdrop-blur-sm">
          <div className="border-b px-4 py-3">
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                title="Close channels panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                {workspace?.icon ?? workspace?.name?.charAt(0)?.toUpperCase() ?? "W"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{workspace?.name ?? "Workspace"}</p>
                <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  <Users className="h-3 w-3" />
                  {workspaceMemberCount} members online
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden p-2">
            <div className="mb-1 flex items-center justify-between px-2 py-1">
              <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                Nano Channels
              </span>
              {isAdmin && (
                <button
                  onClick={() => setCreatingChannel(!creatingChannel)}
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title="Create channel"
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
                  className="h-8 text-xs"
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

            <div className="flex-1 space-y-1 overflow-y-auto pr-1">
              {visibleChannels.map((ch) => {
                if (!ch) return null;
                const unread = unreadCounts?.[ch._id] ?? 0;
                const isActive = activeChannelId === ch._id;

                return (
                  <div key={ch._id} className="group relative">
                    <button
                      onClick={() => setActiveChannel(ch._id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-all",
                        isActive
                          ? "bg-primary/10 text-primary shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Hash className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-medium">{ch.name}</span>
                      {(ch.accessType ?? "workspace") === "restricted" && (
                        <Lock className="h-3 w-3 shrink-0 opacity-70" />
                      )}
                      {unread > 0 && !isActive && (
                        <span className="flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>

                    {isAdmin && !ch.isDefault && (
                      <button
                        onClick={() => handleDeleteChannel(ch._id)}
                        className="absolute top-1/2 right-1 hidden -translate-y-1/2 rounded-md p-1 text-red-500 transition hover:bg-red-50 group-hover:block dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t px-3 py-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted/70 px-2 py-1.5">
              <div className="relative">
                <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {user?.firstName?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <span className="absolute right-0 bottom-0 h-2 w-2 rounded-full border border-background bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{user?.fullName}</p>
                <p className="text-muted-foreground text-[10px]">Active now</p>
              </div>
            </div>
          </div>
        </aside>
      )}

      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col">
          {resolvedChannelId && activeChannel ? (
            <>
              <header className="flex items-center gap-3 border-b px-4 py-3 md:px-6">
                {!isSidebarOpen && (
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    title="Expand channels panel"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    Channels
                  </button>
                )}

                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Hash className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold md:text-base">
                    {activeChannel.name}
                  </h2>
                  <p className="text-muted-foreground truncate text-xs">
                    {activeChannel.description || "Focused team conversation"}
                  </p>
                </div>

                <button
                  onClick={handleMeetToggle}
                  className={cn(
                    "ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                    isMeetOpen
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title="Open Channel Meet (Beta)"
                >
                  <Video className="h-3.5 w-3.5" />
                  <span>{isMeetRunning && isMeetMinimized ? "Restore" : "Meet (Beta)"}</span>
                </button>

                {isRinging && (
                  <button
                    onClick={stopRingtoneLoop}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20"
                    title="Mute meeting ringtone"
                  >
                    <VolumeX className="h-3.5 w-3.5" />
                    <span>Mute</span>
                  </button>
                )}

                <button
                  onClick={() => setShowMembers((value) => !value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                    showMembers
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title="Toggle channel access"
                >
                  <UserCog className="h-3.5 w-3.5" />
                  <span>Access</span>
                  {visibleChannelMembers.length > 0 && (
                    <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold">
                      {visibleChannelMembers.length}
                    </span>
                  )}
                </button>
              </header>

              {isMeetOpen && (
                <ChannelMeetPanel
                  channelId={resolvedChannelId}
                  channelName={activeChannel.name}
                  members={listedChannelMembers.map((member) => ({
                    userId: member.userId,
                    name: member.user?.name,
                    hasAccess: member.hasAccess,
                    role: member.role,
                  }))}
                  isAdmin={isAdmin}
                  viewMode={meetViewMode}
                  onCallStateChange={setMeetCallState}
                  onMinimize={isMeetRunning ? () => setIsMeetMinimized(true) : undefined}
                  onExpand={isMeetRunning ? () => setIsMeetMinimized(false) : undefined}
                  onClose={handleMeetClose}
                />
              )}

              {!showMeetFullscreen && (
                <>
                  <div
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    className="relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.08),transparent_42%)]"
                  >
                    {messages && messages.length === 0 && (
                      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-xs">
                          <Hash className="h-7 w-7 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold">Start the thread</h3>
                        <p className="max-w-sm text-sm text-muted-foreground">
                          Welcome to #{activeChannel.name}. Keep updates short, clear, and searchable.
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
                      className="absolute right-6 bottom-24 z-10 flex items-center gap-1 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur hover:bg-muted"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      Jump latest
                    </button>
                  )}

                  <div className="min-h-5 px-4 pt-1 text-xs md:px-6">
                    {typingText && (
                      <span className="animate-pulse text-muted-foreground">{typingText}</span>
                    )}
                  </div>

                  <div className="px-3 pb-3 md:px-4 md:pb-4">
                    <ChatInput channelId={resolvedChannelId} />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="mb-2 flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title="Expand channels panel"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Channels
                </button>
              )}

              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-card">
                <MessageCircle className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Select a channel to start chatting</p>
            </div>
          )}
        </section>

        {showMembers && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-xs flex-col border-l bg-card/95 backdrop-blur md:relative md:w-72 md:max-w-none">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Channel Access</span>
              </div>
              <button
                onClick={() => setShowMembers(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {activeChannel && (
              <div className="border-b px-3 py-3">
                <div className="mb-3 flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                  {(currentAccessType ?? "workspace") === "workspace" ? (
                    <Globe className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Lock className="h-4 w-4 text-amber-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">
                      {(currentAccessType ?? "workspace") === "workspace" ? "Workspace visible" : "Restricted mode"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {(currentAccessType ?? "workspace") === "workspace"
                        ? "All members can access this channel."
                        : "Only selected members and admins are included."}
                    </p>
                  </div>
                </div>

                {isAdmin && !activeChannel.isDefault && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleAccessTypeChange("workspace")}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-xs font-medium transition",
                        currentAccessType === "workspace"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      Workspace
                    </button>
                    <button
                      onClick={() => handleAccessTypeChange("restricted")}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-xs font-medium transition",
                        currentAccessType === "restricted"
                          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      Restricted
                    </button>
                  </div>
                )}

                {activeChannel.isDefault && (
                  <p className="text-[11px] text-muted-foreground">
                    Default channel always remains workspace-visible.
                  </p>
                )}
              </div>
            )}

            {!isAdmin && (
              <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                <Shield className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Only admins can change access.
                </p>
              </div>
            )}

            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {listedChannelMembers.length > 0 && (
                <>
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Members - {visibleChannelMembers.length} allowed
                  </p>
                  {listedChannelMembers.map((member) => {
                    const isSelf = member.userId === user?.id;
                    const isWorkspaceVisible = currentAccessType === "workspace";
                    const canToggle = isAdmin && !isWorkspaceVisible && member.role !== "admin";

                    return (
                      <div
                        key={member._id}
                        className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-muted/80"
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
                            {isSelf && <span className="ml-1 text-muted-foreground">(you)</span>}
                          </p>
                          <div className="flex items-center gap-1">
                            {member.role === "admin" ? (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary">
                                <Shield className="h-2.5 w-2.5" /> Admin
                              </span>
                            ) : member.hasAccess ? (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                Has access
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No access</span>
                            )}
                          </div>
                        </div>

                        {member.role === "admin" && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            Always
                          </span>
                        )}

                        {canToggle && (
                          <button
                            onClick={() => handleMemberAccessToggle(member.userId, !member.hasAccess)}
                            className={cn(
                              "rounded-md border px-2 py-1 text-[10px] font-medium transition",
                              member.hasAccess
                                ? "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/40"
                                : "border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/40 dark:hover:bg-emerald-950/40",
                            )}
                          >
                            {member.hasAccess ? "Remove" : "Allow"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {currentAccessType === "restricted" && visibleChannelMembers.length === 0 && (
                <div className="mx-2 rounded-lg border border-dashed px-3 py-4 text-center">
                  <Lock className="mx-auto mb-2 h-4 w-4 text-amber-600" />
                  <p className="text-xs font-medium">No explicit members added</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Add members here. Workspace admins always retain access.
                  </p>
                </div>
              )}

              {currentAccessType === "workspace" && (
                <div className="mx-2 rounded-lg border border-dashed px-3 py-4 text-center">
                  <Check className="mx-auto mb-2 h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-medium">Workspace-wide channel</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Switch to restricted mode if this discussion should stay private.
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

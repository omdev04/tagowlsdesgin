"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import Peer, { MediaConnection } from "peerjs";
import { Camera, CameraOff, Info, Maximize2, Mic, MicOff, Minimize2, Phone, Video, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RTC_BASE_URL = process.env.NEXT_PUBLIC_RTC_BACKEND_URL || "http://localhost:3001";
const RTC_ADMIN_KEY =
  process.env.NEXT_PUBLIC_RTC_ADMIN_KEY ||
  (process.env.NODE_ENV !== "production" ? "dev_meet_admin_key" : "");
const MAX_VISIBLE_TILES = 10;

type JoinPayload = {
  ok: boolean;
  alreadyJoined?: boolean;
  peerId: string;
  peerConfig: {
    key: string;
    path: string;
  };
};

type RemoteStream = {
  participantId: string;
  stream: MediaStream;
};

type ChannelMemberAccess = {
  userId: string;
  name?: string;
  hasAccess: boolean;
  role: string;
};

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePeerPath(value: unknown) {
  const trimmed = safeTrim(value);
  if (!trimmed) {
    return "/peerjs";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeJoinPayload(payload: unknown, fallbackUserId: string): JoinPayload {
  const raw = (payload ?? {}) as {
    ok?: unknown;
    alreadyJoined?: unknown;
    peerId?: unknown;
    peerConfig?: {
      key?: unknown;
      path?: unknown;
    };
  };

  const peerId = safeTrim(raw.peerId) || safeTrim(fallbackUserId);
  if (!peerId) {
    throw new Error("Invalid /join response: missing peerId");
  }

  return {
    ok: raw.ok !== false,
    alreadyJoined: Boolean(raw.alreadyJoined),
    peerId,
    peerConfig: {
      key: safeTrim(raw.peerConfig?.key) || "peerjs",
      path: normalizePeerPath(raw.peerConfig?.path),
    },
  };
}

function buildPeerOptions(peerConfig: JoinPayload["peerConfig"]) {
  const backendUrl = new URL(RTC_BASE_URL);
  const secure = backendUrl.protocol === "https:";
  const port = backendUrl.port ? Number(backendUrl.port) : secure ? 443 : 80;

  return {
    host: backendUrl.hostname,
    port,
    secure,
    key: peerConfig.key || "peerjs",
    path: peerConfig.path || "/peerjs",
    debug: 1 as const,
  };
}

function toJoinErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to join call";

  if (message.toLowerCase().includes("could not connect to peer server")) {
    return "Could not establish PeerJS connection. Please verify rtc-backend is running.";
  }

  if (message.toLowerCase().includes("route not found")) {
    return "RTC backend is outdated. Restart rtc-backend to enable channel meeting routes.";
  }

  return message;
}

function StreamPlayer({ stream, muted = false }: { stream: MediaStream; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className="h-full w-full rounded-md object-cover"
    />
  );
}

function getGridColumns(tileCount: number) {
  if (tileCount <= 1) return 1;
  if (tileCount === 2) return 2;
  if (tileCount === 3) return 3;
  if (tileCount <= 6) return 3;
  if (tileCount <= 10) return 4;
  return 4;
}

interface ChannelMeetPanelProps {
  channelId: Id<"chatChannels">;
  channelName: string;
  members: ChannelMemberAccess[];
  isAdmin: boolean;
  viewMode?: "inline" | "fullscreen" | "minimized";
  onMinimize?: () => void;
  onExpand?: () => void;
  onCallStateChange?: (state: "idle" | "connecting" | "joined") => void;
  onClose: () => void;
}

export function ChannelMeetPanel({
  channelId,
  channelName,
  members,
  isAdmin,
  viewMode = "inline",
  onMinimize,
  onExpand,
  onCallStateChange,
  onClose,
}: ChannelMeetPanelProps) {
  const { user } = useUser();
  const sendMessage = useMutation(api.chat.sendMessage);

  const [callState, setCallState] = useState<"idle" | "connecting" | "joined">("idle");
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<"unknown" | "requesting" | "granted" | "denied">("unknown");
  const [participants, setParticipants] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCamEnabled, setIsCamEnabled] = useState(true);
  const [showMeetMeta, setShowMeetMeta] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallsRef = useRef<Map<string, MediaConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const participantsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedOnBackendRef = useRef(false);
  const announcementSentRef = useRef(false);

  const userId = useMemo(() => safeTrim(user?.id), [user?.id]);
  const displayName = useMemo(() => safeTrim(user?.fullName) || "A teammate", [user?.fullName]);

  const roomId = useMemo(() => {
    const safeChannel = channelId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `channel_meet_${safeChannel}`;
  }, [channelId]);

  const allowedUserIds = useMemo(() => {
    const fromChannel = members
      .filter((member) => member.hasAccess || member.role === "admin")
      .map((member) => safeTrim(member.userId));

    return Array.from(new Set([...fromChannel, userId].filter((value) => value.length > 0)));
  }, [members, userId]);

  const participantNameMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const member of members) {
      const id = safeTrim(member.userId);
      const name = safeTrim(member.name);
      if (id && name) {
        map.set(id, name);
      }
    }

    if (userId && displayName) {
      map.set(userId, displayName);
    }

    return map;
  }, [members, userId, displayName]);

  const getParticipantLabel = (participantId: string) => {
    return participantNameMap.get(participantId) || participantId;
  };

  const syncRemoteStreamsState = () => {
    setRemoteStreams(
      Array.from(remoteStreamsRef.current.entries()).map(([participantId, stream]) => ({
        participantId,
        stream,
      })),
    );
  };

  const removeRemoteStream = (participantId: string) => {
    remoteStreamsRef.current.delete(participantId);
    syncRemoteStreamsState();
  };

  const registerMediaCall = (call: MediaConnection) => {
    const peerId = call.peer;
    const existing = activeCallsRef.current.get(peerId);
    if (existing && existing !== call) {
      try {
        existing.close();
      } catch {
        // noop
      }
    }

    activeCallsRef.current.set(peerId, call);

    call.on("stream", (stream) => {
      remoteStreamsRef.current.set(peerId, stream);
      syncRemoteStreamsState();
    });

    call.on("close", () => {
      if (activeCallsRef.current.get(peerId) === call) {
        activeCallsRef.current.delete(peerId);
      }
      removeRemoteStream(peerId);
    });

    call.on("error", () => {
      if (activeCallsRef.current.get(peerId) === call) {
        activeCallsRef.current.delete(peerId);
      }
      removeRemoteStream(peerId);
    });
  };

  const destroyPeerConnections = (stopLocalTracks: boolean) => {
    if (participantsPollRef.current) {
      clearInterval(participantsPollRef.current);
      participantsPollRef.current = null;
    }

    for (const call of activeCallsRef.current.values()) {
      try {
        call.close();
      } catch {
        // noop
      }
    }
    activeCallsRef.current.clear();

    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {
        // noop
      }
      peerRef.current = null;
    }

    remoteStreamsRef.current.clear();
    setRemoteStreams([]);

    if (stopLocalTracks && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setPermissionState("unknown");
    }
  };

  const fetchParticipants = async () => {
    if (!roomId || !userId) return [];

    const response = await fetch(
      `${RTC_BASE_URL}/room/${encodeURIComponent(roomId)}/participants?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) {
      return [];
    }

    const payload = await response.json().catch(() => ({}));
    const participantIds = Array.isArray(payload.participants)
      ? payload.participants.filter((value: unknown) => typeof value === "string")
      : [];

    setParticipants(participantIds);
    return participantIds;
  };

  const connectToParticipants = (participantIds: string[]) => {
    const peer = peerRef.current;
    const stream = localStreamRef.current;
    if (!peer || !stream) return;

    for (const participantId of participantIds) {
      if (participantId === userId) continue;
      if (activeCallsRef.current.has(participantId)) continue;

      // Deterministic dialing avoids duplicate call pairs.
      if (userId.localeCompare(participantId) >= 0) continue;

      try {
        const call = peer.call(participantId, stream, {
          metadata: {
            roomId,
            fromUserId: userId,
          },
        });
        registerMediaCall(call);
      } catch {
        // Peer may not be ready yet; next poll will retry.
      }
    }
  };

  const pruneDisconnectedParticipants = (participantIds: string[]) => {
    for (const [participantId, call] of activeCallsRef.current.entries()) {
      if (!participantIds.includes(participantId)) {
        try {
          call.close();
        } catch {
          // noop
        }
        activeCallsRef.current.delete(participantId);
        removeRemoteStream(participantId);
      }
    }
  };

  const startParticipantsPolling = () => {
    if (participantsPollRef.current) {
      clearInterval(participantsPollRef.current);
    }

    participantsPollRef.current = setInterval(() => {
      fetchParticipants()
        .then((participantIds) => {
          connectToParticipants(participantIds);
          pruneDisconnectedParticipants(participantIds);
        })
        .catch(() => {});
    }, 2000);
  };

  const initializePeer = (peerId: string, peerConfig: JoinPayload["peerConfig"]) => {
    return new Promise<Peer>((resolve, reject) => {
      const peer = new Peer(peerId, buildPeerOptions(peerConfig));
      const timeout = setTimeout(() => {
        try {
          peer.destroy();
        } catch {
          // noop
        }
        reject(new Error("Timed out while connecting to PeerJS signaling"));
      }, 10000);

      peer.once("open", () => {
        clearTimeout(timeout);
        resolve(peer);
      });

      peer.once("error", (peerError) => {
        clearTimeout(timeout);
        reject(peerError);
      });
    });
  };

  const requestDevicePermissions = async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera and microphone are not supported in this browser");
    }

    if (localStreamRef.current) {
      setPermissionState("granted");
      return localStreamRef.current;
    }

    setPermissionState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setPermissionState("granted");
      setIsMicEnabled(stream.getAudioTracks().every((track) => track.enabled));
      setIsCamEnabled(stream.getVideoTracks().every((track) => track.enabled));
      return stream;
    } catch {
      setPermissionState("denied");
      throw new Error("Camera/Microphone permission denied. Please allow access and retry.");
    }
  };

  const ensureRoomAuthorized = async () => {
    if (!isAdmin) {
      return;
    }

    const response = await fetch(`${RTC_BASE_URL}/room/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rtc-admin-key": RTC_ADMIN_KEY,
      },
      body: JSON.stringify({
        roomId,
        hostUserId: userId,
        allowedUserIds,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Room authorization failed");
    }
  };

  const sendMeetInvites = async () => {
    if (!isAdmin) {
      return;
    }

    const toUserIds = allowedUserIds.filter((id) => id !== userId);
    if (toUserIds.length === 0) {
      return;
    }

    const response = await fetch(`${RTC_BASE_URL}/room/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rtc-admin-key": RTC_ADMIN_KEY,
      },
      body: JSON.stringify({
        roomId,
        fromUserId: userId,
        toUserIds,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Failed to notify invited users");
    }

    if (!announcementSentRef.current) {
      announcementSentRef.current = true;
      sendMessage({
        channelId,
        body: `Meeting started in #${channelName} by ${displayName}. Click the Meet icon (top-right) to join.`,
      }).catch(() => {});
    }
  };

  const handleRequestPermissions = async () => {
    setError(null);
    try {
      await requestDevicePermissions();
    } catch (permissionError: unknown) {
      setError(permissionError instanceof Error ? permissionError.message : "Failed to request permissions");
    }
  };

  const handleJoin = async () => {
    if (!userId) {
      setError("Login required");
      return;
    }

    setError(null);
    setCallState("connecting");
    let joinedOnBackend = false;

    try {
      const mediaStream = await requestDevicePermissions();

      if (isAdmin) {
        await ensureRoomAuthorized();
      }

      const joinRes = await fetch(`${RTC_BASE_URL}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId }),
      });

      if (!joinRes.ok) {
        const payload = await joinRes.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to join room");
      }

      const joinPayload = normalizeJoinPayload(await joinRes.json().catch(() => ({})), userId);
      joinedOnBackend = true;
      joinedOnBackendRef.current = true;

      const peer = await initializePeer(joinPayload.peerId, joinPayload.peerConfig);
      peerRef.current = peer;

      peer.on("call", (incomingCall) => {
        incomingCall.answer(mediaStream);
        registerMediaCall(incomingCall);
      });

      peer.on("error", (peerError) => {
        setError(toJoinErrorMessage(peerError));
      });

      setParticipants([userId]);
      const participantIds = await fetchParticipants();
      connectToParticipants(participantIds);
      startParticipantsPolling();

      if (isAdmin) {
        sendMeetInvites()
          .then(() => {
            toast.success("Channel members notified for meeting");
          })
          .catch((inviteError) => {
            const inviteMessage = inviteError instanceof Error ? inviteError.message : "Invite notification failed";
            toast.error(`Call joined, but invite notification failed: ${inviteMessage}`);
          });
      }

      setCallState("joined");
      setIsMicEnabled(mediaStream.getAudioTracks().every((track) => track.enabled));
      setIsCamEnabled(mediaStream.getVideoTracks().every((track) => track.enabled));
    } catch (joinError) {
      if (joinedOnBackend && userId) {
        await fetch(`${RTC_BASE_URL}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, userId }),
        }).catch(() => {});
      }

      joinedOnBackendRef.current = false;
      destroyPeerConnections(false);
      setParticipants([]);
      setCallState("idle");
      setError(toJoinErrorMessage(joinError));
    }
  };

  const handleLeave = async () => {
    if (!userId) {
      destroyPeerConnections(true);
      setParticipants([]);
      setCallState("idle");
      return;
    }

    destroyPeerConnections(true);
    setParticipants([]);
    setCallState("idle");

    if (joinedOnBackendRef.current) {
      await fetch(`${RTC_BASE_URL}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId }),
      }).catch(() => {});
    }

    joinedOnBackendRef.current = false;
  };

  const handleClose = async () => {
    if (callState === "joined") {
      await handleLeave();
    }
    onClose();
  };

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const next = !isMicEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsMicEnabled(next);
  };

  const toggleCam = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const next = !isCamEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setIsCamEnabled(next);
  };

  useEffect(() => {
    return () => {
      if (joinedOnBackendRef.current && userId) {
        fetch(`${RTC_BASE_URL}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, userId }),
        }).catch(() => {});
      }
      destroyPeerConnections(true);
    };
  }, [roomId, userId]);

  useEffect(() => {
    onCallStateChange?.(callState);
  }, [callState, onCallStateChange]);

  useEffect(() => {
    if (callState !== "joined") {
      setShowMeetMeta(false);
    }
  }, [callState]);

  const visibleRemoteStreams = useMemo(
    () => remoteStreams.slice(0, Math.max(MAX_VISIBLE_TILES - 1, 0)),
    [remoteStreams],
  );

  const gridTileCount = 1 + visibleRemoteStreams.length;
  const gridColumns = getGridColumns(gridTileCount);
  const hiddenParticipantsCount = Math.max(participants.length - MAX_VISIBLE_TILES, 0);
  const isFullscreen = viewMode === "fullscreen";
  const isMinimized = viewMode === "minimized";
  const isPreJoin = callState !== "joined";
  const isSingleTile = gridTileCount === 1;
  const shouldUseSquareTiles = gridTileCount >= 2;

  const multiTileRowClass = shouldUseSquareTiles
    ? "auto-rows-auto"
    : isFullscreen
      ? "[grid-auto-rows:130px] sm:[grid-auto-rows:150px] lg:[grid-auto-rows:170px]"
      : "[grid-auto-rows:120px] sm:[grid-auto-rows:140px] lg:[grid-auto-rows:155px]";

  const tileClassName = shouldUseSquareTiles ? "aspect-square h-auto w-full" : "h-full";

  if (isMinimized) {
    return (
      <div className="border-b bg-card/50 px-3 py-2 md:px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Video className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">Meeting running in #{channelName}</p>
            <p className="truncate text-[10px] text-muted-foreground">{participants.length} in call</p>
          </div>

          {onExpand && (
            <Button variant="ghost" size="icon" onClick={onExpand} title="Restore meet panel">
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}

          {callState === "joined" && (
            <Button variant="destructive" size="sm" onClick={handleLeave}>
              <Phone className="mr-1.5 h-3.5 w-3.5" />
              Leave
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={handleClose} title="Close meet panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card/40 px-3 py-3 md:px-4",
        isFullscreen ? "flex min-h-0 flex-1 flex-col" : "border-b",
      )}
    >
      <div className="relative mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Video className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Channel Meet</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {isPreJoin ? "Only channel members can join this call" : "Optimized grid for up to 10 users in this channel"}
          </p>
        </div>

        {callState === "joined" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMeetMeta((value) => !value)}
            title="Meeting info"
          >
            <Info className="h-4 w-4" />
          </Button>
        )}

        {callState === "joined" && onMinimize && (
          <Button variant="ghost" size="icon" onClick={onMinimize} title="Minimize meet panel">
            <Minimize2 className="h-4 w-4" />
          </Button>
        )}

        <Button variant="ghost" size="icon" onClick={handleClose} title="Close meet panel">
          <X className="h-4 w-4" />
        </Button>

        {callState === "joined" && showMeetMeta && (
          <div className="absolute top-full right-0 z-20 mt-1 w-[240px] rounded-md border bg-background/95 p-2 text-[11px] shadow-md backdrop-blur">
            <p className="mb-1 font-medium text-foreground">Meeting Info</p>
            <div className="space-y-1 text-muted-foreground">
              <p>
                In call: <span className="font-medium text-foreground">{participants.length}</span>
              </p>
              <p>
                Allowed: <span className="font-medium text-foreground">{allowedUserIds.length}</span>
              </p>
              <p className="break-all">
                Room: <span className="text-foreground">{roomId}</span>
              </p>
              {hiddenParticipantsCount > 0 && <p>+{hiddenParticipantsCount} more connected</p>}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className={cn("rounded-lg border bg-background p-2", isFullscreen && "flex min-h-0 flex-1 flex-col")}>
        {isPreJoin && !localStream ? (
          <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed bg-card/30 px-4 text-center sm:h-[250px]">
            <div>
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Video className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium">Ready to start channel meet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Allow camera & mic, then start or join the meeting.
              </p>
            </div>
          </div>
        ) : (
        <div
          className={cn(
            "overflow-y-auto pr-1",
            isFullscreen
              ? isSingleTile
                ? "h-[300px] sm:h-[360px] lg:h-[420px]"
                : "min-h-0 flex-1"
              : isSingleTile
                ? "h-[260px] sm:h-[320px] lg:h-[380px]"
                : "h-[300px] sm:h-[360px] lg:h-[420px]",
          )}
        >
          <div
            className={cn(
              "grid content-start gap-2",
              isSingleTile
                ? "[grid-auto-rows:260px] sm:[grid-auto-rows:320px] lg:[grid-auto-rows:380px]"
                : multiTileRowClass,
            )}
            style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
          >
            <div className={cn("relative overflow-hidden rounded-md border bg-card", tileClassName)}>
            {localStream ? (
              <StreamPlayer stream={localStream} muted />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Local preview will appear here.
              </div>
            )}
            {localStream && (
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">You</span>
            )}
            </div>

            {visibleRemoteStreams.map((remote) => (
              <div
                key={remote.participantId}
                className={cn("relative overflow-hidden rounded-md border bg-card", tileClassName)}
              >
                <StreamPlayer stream={remote.stream} />
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
                  {getParticipantLabel(remote.participantId)}
                </span>
              </div>
            ))}
          </div>

          {callState === "joined" && visibleRemoteStreams.length === 0 && (
            <div className="mt-2 rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
              Waiting for participants to join...
            </div>
          )}
        </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {callState !== "joined" ? (
          <>
            <Button
              variant="secondary"
              onClick={handleRequestPermissions}
              disabled={permissionState === "requesting" || callState === "connecting"}
            >
              {permissionState === "requesting" ? "Requesting access..." : "Allow Cam & Mic"}
            </Button>
            <Button onClick={handleJoin} disabled={callState === "connecting"}>
              {callState === "connecting" ? "Joining..." : isAdmin ? "Start Meet" : "Join Meet"}
            </Button>
          </>
        ) : (
          <>
            <Button size="icon" variant={isMicEnabled ? "default" : "secondary"} onClick={toggleMic} title="Toggle microphone">
              {isMicEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant={isCamEnabled ? "default" : "secondary"} onClick={toggleCam} title="Toggle camera">
              {isCamEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
            </Button>
            <Button variant="destructive" onClick={handleLeave}>
              <Phone className="mr-2 h-4 w-4" />
              Leave
            </Button>
          </>
        )}

        <p className="ml-auto text-[11px] text-muted-foreground">
          Device: {permissionState === "granted" ? "Granted" : permissionState === "denied" ? "Denied" : "Not granted"}
        </p>
      </div>
    </div>
  );
}

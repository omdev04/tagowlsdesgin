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

const RTC_BASE_URL =
  process.env.NEXT_PUBLIC_RTC_BACKEND_URL || "https://rtc-backend-seven.vercel.app";
const RTC_ADMIN_KEY =
  process.env.NEXT_PUBLIC_RTC_ADMIN_KEY ||
  (process.env.NODE_ENV !== "production" ? "dev_meet_admin_key" : "");
const MAX_GRID_COLUMNS = 6;

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
  peerId: string;
  userId: string;
  stream: MediaStream;
};

type ParticipantEntry = {
  userId: string;
  peerId: string;
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

function normalizeParticipantsPayload(payload: unknown): ParticipantEntry[] {
  const raw = (payload ?? {}) as {
    participants?: unknown;
    participantDetails?: unknown;
  };

  const participantsSource = Array.isArray(raw.participantDetails)
    ? raw.participantDetails
    : Array.isArray(raw.participants)
      ? raw.participants
      : [];
  const seenPeerIds = new Set<string>();
  const normalized: ParticipantEntry[] = [];

  for (const participant of participantsSource) {
    if (typeof participant === "string") {
      const userId = safeTrim(participant);
      if (!userId || seenPeerIds.has(userId)) {
        continue;
      }

      seenPeerIds.add(userId);
      normalized.push({ userId, peerId: userId });
      continue;
    }

    if (!participant || typeof participant !== "object") {
      continue;
    }

    const value = participant as {
      userId?: unknown;
      peerId?: unknown;
    };
    const participantUserId = safeTrim(value.userId);
    const participantPeerId = safeTrim(value.peerId) || participantUserId;
    if (!participantUserId || !participantPeerId || seenPeerIds.has(participantPeerId)) {
      continue;
    }

    seenPeerIds.add(participantPeerId);
    normalized.push({
      userId: participantUserId,
      peerId: participantPeerId,
    });
  }

  return normalized;
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

  if (message.toLowerCase().includes("is taken")) {
    return "Peer ID conflict detected. Please retry joining once.";
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

function getInitials(label: string) {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) {
    return "U";
  }

  return parts
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
}

function hasLiveVideoTrack(stream: MediaStream | null, forceOff = false) {
  if (!stream || forceOff) {
    return false;
  }

  const tracks = stream.getVideoTracks();
  if (tracks.length === 0) {
    return false;
  }

  return tracks.some((track) => track.readyState === "live" && !track.muted && track.enabled);
}

function hasLiveAudioTrack(stream: MediaStream | null, forceOff = false) {
  if (!stream || forceOff) {
    return false;
  }

  const tracks = stream.getAudioTracks();
  if (tracks.length === 0) {
    return false;
  }

  return tracks.some((track) => track.readyState === "live" && !track.muted && track.enabled);
}

function getGridLayout(tileCount: number) {
  if (tileCount <= 1) return { columns: 1, rows: 1 };
  if (tileCount === 2) return { columns: 2, rows: 1 };
  if (tileCount === 3) return { columns: 3, rows: 1 };
  if (tileCount === 4) return { columns: 2, rows: 2 };
  if (tileCount <= 6) return { columns: 3, rows: 2 };
  if (tileCount <= 8) return { columns: 4, rows: 2 };
  if (tileCount === 9) return { columns: 3, rows: 3 };
  if (tileCount <= 12) return { columns: 4, rows: 3 };

  const columns = Math.min(MAX_GRID_COLUMNS, Math.ceil(Math.sqrt(tileCount)));
  const rows = Math.ceil(tileCount / columns);
  return { columns, rows };
}

function AudioSpectrum({ stream, active }: { stream: MediaStream | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = canvas.clientWidth || 280;
    const height = canvas.clientHeight || 62;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    let rafId = 0;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    const barCount = Math.max(8, Math.min(20, Math.floor(width / 10)));
    const barGap = 4;
    const barWidth = Math.max(2, (width - barGap * (barCount - 1)) / barCount);
    const fallbackWave = new Array(barCount).fill(0).map((_, index) => 0.1 + ((index % 5) / 14));
    let frequencyData = new Uint8Array(64);

    const drawFrame = (phase = 0) => {
      context.clearRect(0, 0, width, height);

      if (analyser) {
        analyser.getByteFrequencyData(frequencyData);
      }

      for (let index = 0; index < barCount; index += 1) {
        const sampleIndex = Math.floor((index / barCount) * frequencyData.length);
        const sample = analyser ? frequencyData[sampleIndex] / 255 : fallbackWave[index];
        const pulse = 0.5 + Math.sin(phase + index * 0.75) * 0.25;
        const energy = active && analyser ? sample : pulse * 0.2;
        const barHeight = Math.max(4, Math.min(height, energy * height * 0.95));
        const x = index * (barWidth + barGap);
        const y = height - barHeight;

        context.fillStyle = active ? "rgba(148, 163, 184, 0.85)" : "rgba(100, 116, 139, 0.55)";
        context.fillRect(x, y, barWidth, barHeight);
      }
    };

    const audioTrack = stream?.getAudioTracks().find((track) => track.readyState === "live");
    if (stream && active && audioTrack) {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
      source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      source.connect(analyser);
      if (audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    }

    if (active && analyser) {
      let phase = 0;
      const animate = () => {
        phase += 0.06;
        drawFrame(phase);
        rafId = window.requestAnimationFrame(animate);
      };
      animate();
    } else {
      drawFrame();
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      try {
        source?.disconnect();
      } catch {
        // noop
      }
      try {
        analyser?.disconnect();
      } catch {
        // noop
      }
      audioContext?.close().catch(() => {});
    };
  }, [stream, active]);

  return (
    <canvas
      ref={canvasRef}
      className="h-[62px] w-full rounded-md bg-slate-950/40"
      aria-label="Audio activity spectrum"
    />
  );
}

function CameraOffTile({
  stream,
  label,
  micActive,
  subtitle = "Camera off",
}: {
  stream: MediaStream | null;
  label: string;
  micActive: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-between rounded-md bg-gradient-to-b from-slate-900/70 to-black/90 p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900 text-xs font-semibold text-slate-100">
          {getInitials(label)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-100">{label}</p>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
      </div>

      <AudioSpectrum stream={stream} active={micActive} />
    </div>
  );
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
  const [participants, setParticipants] = useState<ParticipantEntry[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCamEnabled, setIsCamEnabled] = useState(true);
  const [showMeetMeta, setShowMeetMeta] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallsRef = useRef<Map<string, MediaConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, { userId: string; stream: MediaStream }>>(new Map());
  const participantsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedOnBackendRef = useRef(false);
  const announcementSentRef = useRef(false);
  const localPeerIdRef = useRef<string>("");
  const peerToUserMapRef = useRef<Map<string, string>>(new Map());

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
    const byUserId = new Map<string, RemoteStream>();

    for (const [peerId, value] of remoteStreamsRef.current.entries()) {
      const nextEntry: RemoteStream = {
        peerId,
        userId: value.userId,
        stream: value.stream,
      };

      const existing = byUserId.get(nextEntry.userId);
      if (!existing) {
        byUserId.set(nextEntry.userId, nextEntry);
        continue;
      }

      const existingHasVideo = hasLiveVideoTrack(existing.stream);
      const nextHasVideo = hasLiveVideoTrack(nextEntry.stream);

      if (nextHasVideo && !existingHasVideo) {
        byUserId.set(nextEntry.userId, nextEntry);
      }
    }

    setRemoteStreams(Array.from(byUserId.values()));
  };

  const removeRemoteStream = (peerId: string) => {
    remoteStreamsRef.current.delete(peerId);
    syncRemoteStreamsState();
  };

  const registerMediaCall = (call: MediaConnection, knownUserId?: string) => {
    const peerId = call.peer;
    if (knownUserId && knownUserId !== userId) {
      peerToUserMapRef.current.set(peerId, knownUserId);
    }

    const metadata = (call.metadata ?? {}) as { fromUserId?: unknown };
    const fromUserId = safeTrim(metadata.fromUserId);
    if (fromUserId && fromUserId !== userId) {
      peerToUserMapRef.current.set(peerId, fromUserId);
    }

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
      const participantUserId = peerToUserMapRef.current.get(peerId) || peerId;
      remoteStreamsRef.current.set(peerId, {
        userId: participantUserId,
        stream,
      });
      setError(null);
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
    peerToUserMapRef.current.clear();
    localPeerIdRef.current = "";
    setRemoteStreams([]);

    if (stopLocalTracks && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setPermissionState("unknown");
    }
  };

  const fetchParticipants = async (): Promise<ParticipantEntry[]> => {
    if (!roomId || !userId) return [];

    const response = await fetch(
      `${RTC_BASE_URL}/room/${encodeURIComponent(roomId)}/participants?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) {
      return [];
    }

    const payload = await response.json().catch(() => ({}));
    const normalizedParticipants = normalizeParticipantsPayload(payload);

    const nextPeerToUser = new Map<string, string>();
    for (const participant of normalizedParticipants) {
      nextPeerToUser.set(participant.peerId, participant.userId);
    }
    if (localPeerIdRef.current && userId) {
      nextPeerToUser.set(localPeerIdRef.current, userId);
    }
    peerToUserMapRef.current = nextPeerToUser;

    setParticipants(normalizedParticipants);
    return normalizedParticipants;
  };

  const connectToParticipants = (participantEntries: ParticipantEntry[]) => {
    const peer = peerRef.current;
    const stream = localStreamRef.current;
    if (!peer || !stream) return;

    for (const participant of participantEntries) {
      if (participant.userId === userId) continue;
      if (!participant.peerId) continue;
      if (activeCallsRef.current.has(participant.peerId)) continue;

      // Deterministic dialing avoids duplicate call pairs.
      if (userId.localeCompare(participant.userId) >= 0) continue;

      try {
        peerToUserMapRef.current.set(participant.peerId, participant.userId);
        const call = peer.call(participant.peerId, stream, {
          metadata: {
            roomId,
            fromUserId: userId,
          },
        });
        registerMediaCall(call, participant.userId);
      } catch {
        // Peer may not be ready yet; next poll will retry.
      }
    }
  };

  const pruneDisconnectedParticipants = (participantEntries: ParticipantEntry[]) => {
    const activePeerIds = new Set(participantEntries.map((participant) => participant.peerId));

    for (const [participantPeerId, call] of activeCallsRef.current.entries()) {
      if (!activePeerIds.has(participantPeerId)) {
        try {
          call.close();
        } catch {
          // noop
        }
        activeCallsRef.current.delete(participantPeerId);
        removeRemoteStream(participantPeerId);
      }
    }
  };

  const startParticipantsPolling = () => {
    if (participantsPollRef.current) {
      clearInterval(participantsPollRef.current);
    }

    participantsPollRef.current = setInterval(() => {
      fetchParticipants()
        .then((participantEntries) => {
          connectToParticipants(participantEntries);
          pruneDisconnectedParticipants(participantEntries);
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
      localPeerIdRef.current = joinPayload.peerId;
      peerToUserMapRef.current.set(joinPayload.peerId, userId);

      const peer = await initializePeer(joinPayload.peerId, joinPayload.peerConfig);
      peerRef.current = peer;

      peer.on("call", (incomingCall) => {
        const incomingFromUserId = safeTrim((incomingCall.metadata as { fromUserId?: unknown } | undefined)?.fromUserId);
        incomingCall.answer(mediaStream);
        registerMediaCall(incomingCall, incomingFromUserId || undefined);
      });

      peer.on("error", (peerError) => {
        const message =
          peerError instanceof Error
            ? peerError.message.toLowerCase()
            : String(peerError ?? "").toLowerCase();

        // Peer reconnect races are transient; polling retries shortly.
        if (message.includes("could not connect to peer") || message.includes("peer-unavailable")) {
          return;
        }

        setError(toJoinErrorMessage(peerError));
      });

      setParticipants([{ userId, peerId: joinPayload.peerId }]);
      const participantEntries = await fetchParticipants();
      connectToParticipants(participantEntries);
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

  const visibleRemoteStreams = useMemo(() => remoteStreams, [remoteStreams]);
  const remoteParticipantIds = useMemo(() => {
    const ids = participants
      .map((participant) => participant.userId)
      .filter((participantId) => participantId && participantId !== userId);
    return Array.from(new Set(ids));
  }, [participants, userId]);
  const remoteStreamByUserId = useMemo(() => {
    const map = new Map<string, RemoteStream>();
    for (const remote of visibleRemoteStreams) {
      if (!map.has(remote.userId)) {
        map.set(remote.userId, remote);
      }
    }
    return map;
  }, [visibleRemoteStreams]);
  const gridTileCount = 1 + remoteParticipantIds.length;
  const gridLayout = useMemo(() => getGridLayout(gridTileCount), [gridTileCount]);
  const isFullscreen = viewMode === "fullscreen";
  const isMinimized = viewMode === "minimized";
  const isPreJoin = callState !== "joined";
  const viewportClassName =
    callState === "joined"
      ? isFullscreen
        ? "min-h-0 flex-1"
        : "h-[44vh] min-h-[250px] max-h-[470px]"
      : "h-[180px] sm:h-[220px]";

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

  const localVideoVisible = hasLiveVideoTrack(localStream, !isCamEnabled);
  const localMicLive = hasLiveAudioTrack(localStream, !isMicEnabled);

  return (
    <div
      className={cn(
        "bg-card/30 px-2 py-2 md:px-3",
        isFullscreen ? "flex min-h-0 flex-1 flex-col" : "border-b",
      )}
    >
      <div className="relative mb-2 flex items-center gap-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Video className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Channel Meet</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {isPreJoin ? "Private call for channel members" : `${1 + remoteParticipantIds.length} in call`}
          </p>
        </div>

        {callState === "joined" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowMeetMeta((value) => !value)}
            title="Meeting info"
          >
            <Info className="h-4 w-4" />
          </Button>
        )}

        {callState === "joined" && onMinimize && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMinimize} title="Minimize meet panel">
            <Minimize2 className="h-4 w-4" />
          </Button>
        )}

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose} title="Close meet panel">
          <X className="h-4 w-4" />
        </Button>

        {callState === "joined" && showMeetMeta && (
          <div className="absolute top-full right-0 z-20 mt-1 w-[230px] rounded-md border bg-background/95 p-2 text-[11px] shadow-md backdrop-blur">
            <p className="mb-1 font-medium text-foreground">Meeting Info</p>
            <div className="space-y-1 text-muted-foreground">
              <p>
                In call: <span className="font-medium text-foreground">{1 + remoteParticipantIds.length}</span>
              </p>
              <p>
                Grid:{" "}
                <span className="font-medium text-foreground">
                  {gridLayout.columns} x {gridLayout.rows}
                </span>
              </p>
              <p>
                Allowed: <span className="font-medium text-foreground">{allowedUserIds.length}</span>
              </p>
              <p className="truncate">
                Room: <span className="text-foreground">{roomId}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className={cn("rounded-lg border bg-background/70 p-1.5", isFullscreen && "flex min-h-0 flex-1 flex-col")}>
        <div className={cn("relative overflow-hidden rounded-md", viewportClassName)}>
          {isPreJoin && !localStream ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-card/30 px-4 text-center">
              <div>
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Video className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium">Ready to start channel meet</p>
                <p className="mt-1 text-xs text-muted-foreground">Allow camera and mic, then join.</p>
              </div>
            </div>
          ) : (
            <>
              <div
                className="grid h-full w-full gap-1.5 p-1.5"
                style={{
                  gridTemplateColumns: `repeat(${gridLayout.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`,
                }}
              >
                <div className="relative min-h-0 overflow-hidden rounded-md border bg-card/90">
                  {localVideoVisible ? (
                    <StreamPlayer stream={localStream as MediaStream} muted />
                  ) : (
                    <CameraOffTile
                      stream={localStream}
                      label="You"
                      micActive={localMicLive}
                    />
                  )}
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    You
                  </span>
                </div>

                {remoteParticipantIds.map((participantUserId) => {
                  const remote = remoteStreamByUserId.get(participantUserId);
                  const label = getParticipantLabel(participantUserId);
                  const remoteVideoVisible = hasLiveVideoTrack(remote?.stream ?? null);
                  const remoteMicLive = hasLiveAudioTrack(remote?.stream ?? null);

                  return (
                    <div
                      key={participantUserId}
                      className="relative min-h-0 overflow-hidden rounded-md border bg-card/90"
                    >
                      {remoteVideoVisible ? (
                        <StreamPlayer stream={remote!.stream} />
                      ) : (
                        <CameraOffTile
                          stream={remote?.stream ?? null}
                          label={label}
                          micActive={remoteMicLive}
                          subtitle={remote ? "Camera off" : "Connecting..."}
                        />
                      )}
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {callState === "joined" && remoteParticipantIds.length === 0 && (
                <div className="absolute top-2 right-2 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
                  Waiting for others...
                </div>
              )}

              {callState === "joined" && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2">
                  <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/90 p-1 shadow-md backdrop-blur">
                    <Button
                      size="icon"
                      variant={isMicEnabled ? "default" : "secondary"}
                      className="h-8 w-8 rounded-full"
                      onClick={toggleMic}
                      title="Toggle microphone"
                    >
                      {isMicEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant={isCamEnabled ? "default" : "secondary"}
                      className="h-8 w-8 rounded-full"
                      onClick={toggleCam}
                      title="Toggle camera"
                    >
                      {isCamEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                    </Button>
                    <Button variant="destructive" size="sm" className="rounded-full px-3" onClick={handleLeave}>
                      <Phone className="mr-1.5 h-3.5 w-3.5" />
                      Leave
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {callState !== "joined" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRequestPermissions}
              disabled={permissionState === "requesting" || callState === "connecting"}
            >
              {permissionState === "requesting" ? "Requesting..." : "Allow Cam & Mic"}
            </Button>
            <Button size="sm" onClick={handleJoin} disabled={callState === "connecting"}>
              {callState === "connecting" ? "Joining..." : isAdmin ? "Start Meet" : "Join Meet"}
            </Button>
            <p className="ml-auto text-[11px] text-muted-foreground">
              Device: {permissionState === "granted" ? "Granted" : permissionState === "denied" ? "Denied" : "Not granted"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

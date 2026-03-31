"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
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
const MAX_VIDEO_TILES = 4;
const MAX_REMOTE_VIDEO_TILES = MAX_VIDEO_TILES - 1;
const PARTICIPANTS_POLL_INTERVAL_MS = 2500;
const VIDEO_SLOT_POLL_INTERVAL_MS = 1500;
const MIN_CONNECT_DELAY_MS = 300;
const MAX_CONNECT_DELAY_MS = 500;
const ACTIVE_SPEAKER_THRESHOLD = 22;
const AUDIO_SENDER_MAX_BITRATE_BPS = 32000;
const AUDIO_BITRATE_RETRY_DELAY_MS = 1200;

// Keep outbound video constrained for lower CPU/bandwidth in small group calls.
const VIDEO_TRACK_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640, max: 640 },
  height: { ideal: 360, max: 360 },
  frameRate: { ideal: 15, max: 15 },
  facingMode: "user",
};

// Speech-focused capture profile for clearer voice in group calls.
const AUDIO_TRACK_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1, max: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
};

// TURN values are intentionally placeholders until real relay credentials are configured.
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
  {
    urls: [process.env.NEXT_PUBLIC_TURN_URL || "turn:your-turn-server.example.com:3478"],
    username: process.env.NEXT_PUBLIC_TURN_USERNAME || "turn-user",
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "turn-password",
  },
];

type SpeakerMonitor = {
  streamId: string;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array;
};

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

type VideoSlotState = "off" | "queued" | "invited" | "active";

type VideoSlotSnapshot = {
  roomId: string;
  maxActive: number;
  activeUserIds: string[];
  activeCount: number;
  invitedUserId: string | null;
  inviteExpiresAt: number | null;
  queue: Array<{
    userId: string;
    role: string;
    priority: number;
    requestedAt: number;
    position: number;
  }>;
  queueLength: number;
  you: {
    state: VideoSlotState;
    position: number | null;
    role: string;
    priority: number;
    inviteExpiresAt: number | null;
  };
  updatedAt: number;
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

function normalizeVideoSlotSnapshot(payload: unknown): VideoSlotSnapshot | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const rawPayload = payload as {
    snapshot?: unknown;
  };

  const source = rawPayload.snapshot && typeof rawPayload.snapshot === "object"
    ? (rawPayload.snapshot as Partial<VideoSlotSnapshot>)
    : (payload as Partial<VideoSlotSnapshot>);

  if (!source || typeof source !== "object") {
    return null;
  }

  const rawYou = source.you && typeof source.you === "object"
    ? (source.you as Partial<VideoSlotSnapshot["you"]>)
    : null;
  const normalizedState = rawYou?.state;

  return {
    roomId: safeTrim(source.roomId),
    maxActive: Number.isFinite(source.maxActive) ? Number(source.maxActive) : 3,
    activeUserIds: Array.isArray(source.activeUserIds)
      ? source.activeUserIds.filter((value): value is string => typeof value === "string")
      : [],
    activeCount: Number.isFinite(source.activeCount) ? Number(source.activeCount) : 0,
    invitedUserId: typeof source.invitedUserId === "string" ? source.invitedUserId : null,
    inviteExpiresAt: Number.isFinite(source.inviteExpiresAt) ? Number(source.inviteExpiresAt) : null,
    queue: Array.isArray(source.queue)
      ? source.queue
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const rawEntry = entry as Partial<VideoSlotSnapshot["queue"][number]>;
          const userId = safeTrim(rawEntry.userId);
          if (!userId) {
            return null;
          }
          return {
            userId,
            role: safeTrim(rawEntry.role) || "participant",
            priority: Number.isFinite(rawEntry.priority) ? Number(rawEntry.priority) : 0,
            requestedAt: Number.isFinite(rawEntry.requestedAt) ? Number(rawEntry.requestedAt) : 0,
            position: Number.isFinite(rawEntry.position) ? Number(rawEntry.position) : 0,
          };
        })
        .filter((entry): entry is VideoSlotSnapshot["queue"][number] => entry !== null)
      : [],
    queueLength: Number.isFinite(source.queueLength)
      ? Number(source.queueLength)
      : Array.isArray(source.queue)
        ? source.queue.length
        : 0,
    you: {
      state: normalizedState === "active" || normalizedState === "queued" || normalizedState === "invited"
        ? normalizedState
        : "off",
      position: Number.isFinite(rawYou?.position) ? Number(rawYou?.position) : null,
      role: safeTrim(rawYou?.role) || "participant",
      priority: Number.isFinite(rawYou?.priority) ? Number(rawYou?.priority) : 0,
      inviteExpiresAt: Number.isFinite(rawYou?.inviteExpiresAt) ? Number(rawYou?.inviteExpiresAt) : null,
    },
    updatedAt: Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : Date.now(),
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
    config: {
      iceServers: DEFAULT_ICE_SERVERS,
    },
  };
}

function getConnectDelayMs() {
  const spread = MAX_CONNECT_DELAY_MS - MIN_CONNECT_DELAY_MS;
  return MIN_CONNECT_DELAY_MS + Math.floor(Math.random() * (spread + 1));
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

const StreamPlayer = memo(function StreamPlayer({
  stream,
  muted = false,
}: {
  stream: MediaStream;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
    }
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
});

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
  const [activeSpeakerUserId, setActiveSpeakerUserId] = useState<string | null>(null);
  const [cameraIntent, setCameraIntent] = useState(true);
  const [videoSlotSnapshot, setVideoSlotSnapshot] = useState<VideoSlotSnapshot | null>(null);
  const [videoSlotBusy, setVideoSlotBusy] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallsRef = useRef<Map<string, MediaConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, { userId: string; stream: MediaStream }>>(new Map());
  const participantsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoSlotPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingConnectTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingConnectPeersRef = useRef<Set<string>>(new Set());
  const mediaRequestRef = useRef<Promise<MediaStream> | null>(null);
  const callCleanupRef = useRef<Map<string, () => void>>(new Map());
  const speakerAudioContextRef = useRef<AudioContext | null>(null);
  const speakerMonitorsRef = useRef<Map<string, SpeakerMonitor>>(new Map());
  const speakerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoSlotAcceptPendingRef = useRef(false);
  const cameraIntentRef = useRef(true);
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

  useEffect(() => {
    cameraIntentRef.current = cameraIntent;
  }, [cameraIntent]);

  const allowedUserIds = useMemo(() => {
    const fromChannel = members
      .filter((member) => member.hasAccess || member.role === "admin")
      .map((member) => safeTrim(member.userId));

    return Array.from(new Set([...fromChannel, userId].filter((value) => value.length > 0)));
  }, [members, userId]);

  const selfVideoRole = useMemo<"host" | "participant">(() => {
    if (!userId) {
      return "participant";
    }

    if (isAdmin) {
      return "host";
    }

    const me = members.find((member) => safeTrim(member.userId) === userId);
    if (me?.role === "admin") {
      return "host";
    }

    return "participant";
  }, [isAdmin, members, userId]);

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

  const videoSlotStatusText = useMemo(() => {
    if (!cameraIntent) {
      return "Camera is off";
    }

    if (!videoSlotSnapshot) {
      return "Syncing video slot...";
    }

    const selfState = videoSlotSnapshot.you.state;
    if (selfState === "active") {
      return `Video live (${videoSlotSnapshot.activeCount}/${videoSlotSnapshot.maxActive})`;
    }

    if (selfState === "invited") {
      return "Slot assigned, connecting camera...";
    }

    if (selfState === "queued") {
      const position = videoSlotSnapshot.you.position || 1;
      return `In queue (#${position})`;
    }

    return "Waiting for slot assignment...";
  }, [cameraIntent, videoSlotSnapshot]);

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

    const nextRemoteStreams = Array.from(byUserId.values());
    setRemoteStreams((current) => {
      if (current.length !== nextRemoteStreams.length) {
        return nextRemoteStreams;
      }

      for (let index = 0; index < current.length; index += 1) {
        const left = current[index];
        const right = nextRemoteStreams[index];
        if (left.peerId !== right.peerId || left.userId !== right.userId || left.stream !== right.stream) {
          return nextRemoteStreams;
        }
      }

      return current;
    });
  };

  const clearPendingConnect = (peerId: string) => {
    const timeout = pendingConnectTimeoutsRef.current.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      pendingConnectTimeoutsRef.current.delete(peerId);
    }
    pendingConnectPeersRef.current.delete(peerId);
  };

  const clearAllPendingConnects = () => {
    for (const timeout of pendingConnectTimeoutsRef.current.values()) {
      clearTimeout(timeout);
    }
    pendingConnectTimeoutsRef.current.clear();
    pendingConnectPeersRef.current.clear();
  };

  const cleanupCallListeners = (peerId: string) => {
    const cleanup = callCleanupRef.current.get(peerId);
    if (!cleanup) {
      return;
    }

    cleanup();
    callCleanupRef.current.delete(peerId);
  };

  const teardownSpeakerMonitor = (participantId: string) => {
    const monitor = speakerMonitorsRef.current.get(participantId);
    if (!monitor) {
      return;
    }

    try {
      monitor.source.disconnect();
    } catch {
      // noop
    }
    try {
      monitor.analyser.disconnect();
    } catch {
      // noop
    }

    speakerMonitorsRef.current.delete(participantId);
  };

  const stopSpeakerMonitoring = () => {
    if (speakerIntervalRef.current) {
      clearInterval(speakerIntervalRef.current);
      speakerIntervalRef.current = null;
    }

    for (const participantId of Array.from(speakerMonitorsRef.current.keys())) {
      teardownSpeakerMonitor(participantId);
    }

    if (speakerAudioContextRef.current) {
      speakerAudioContextRef.current.close().catch(() => {});
      speakerAudioContextRef.current = null;
    }

    setActiveSpeakerUserId(null);
  };

  const ensureSpeakerAudioContext = () => {
    if (typeof window === "undefined") {
      return null;
    }

    if (!speakerAudioContextRef.current) {
      try {
        speakerAudioContextRef.current = new AudioContext();
      } catch {
        return null;
      }
    }

    if (speakerAudioContextRef.current.state === "suspended") {
      speakerAudioContextRef.current.resume().catch(() => {});
    }

    return speakerAudioContextRef.current;
  };

  const syncSpeakerMonitors = () => {
    if (callState !== "joined") {
      stopSpeakerMonitoring();
      return;
    }

    const participantStreams = new Map<string, MediaStream>();
    if (userId && localStreamRef.current) {
      participantStreams.set(userId, localStreamRef.current);
    }

    for (const value of remoteStreamsRef.current.values()) {
      if (!participantStreams.has(value.userId)) {
        participantStreams.set(value.userId, value.stream);
      }
    }

    const audioContext = participantStreams.size > 0 ? ensureSpeakerAudioContext() : null;

    for (const [participantId, stream] of participantStreams.entries()) {
      const audioTrack = stream.getAudioTracks().find((track) => track.readyState === "live");
      if (!audioTrack || !audioContext) {
        teardownSpeakerMonitor(participantId);
        continue;
      }

      const existing = speakerMonitorsRef.current.get(participantId);
      if (existing && existing.streamId === stream.id) {
        continue;
      }

      teardownSpeakerMonitor(participantId);

      try {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.86;

        const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
        source.connect(analyser);

        speakerMonitorsRef.current.set(participantId, {
          streamId: stream.id,
          source,
          analyser,
          data: new Uint8Array(analyser.frequencyBinCount),
        });
      } catch {
        // Browser may reject analysis for this stream; skip monitor.
      }
    }

    for (const participantId of Array.from(speakerMonitorsRef.current.keys())) {
      if (!participantStreams.has(participantId)) {
        teardownSpeakerMonitor(participantId);
      }
    }

    if (speakerMonitorsRef.current.size === 0) {
      if (speakerIntervalRef.current) {
        clearInterval(speakerIntervalRef.current);
        speakerIntervalRef.current = null;
      }
      setActiveSpeakerUserId(null);
      return;
    }

    if (!speakerIntervalRef.current) {
      speakerIntervalRef.current = setInterval(() => {
        let topParticipantId: string | null = null;
        let topLevel = 0;

        for (const [participantId, monitor] of speakerMonitorsRef.current.entries()) {
          monitor.analyser.getByteFrequencyData(monitor.data as unknown as Uint8Array<ArrayBuffer>);
          const total = monitor.data.reduce((sum, value) => sum + value, 0);
          const level = total / Math.max(1, monitor.data.length);

          if (level > topLevel) {
            topLevel = level;
            topParticipantId = participantId;
          }
        }

        setActiveSpeakerUserId((current) => {
          if (topLevel < ACTIVE_SPEAKER_THRESHOLD) {
            return current === null ? current : null;
          }
          return current === topParticipantId ? current : topParticipantId;
        });
      }, 450);
    }
  };

  const removeRemoteStream = (peerId: string) => {
    clearPendingConnect(peerId);
    cleanupCallListeners(peerId);
    remoteStreamsRef.current.delete(peerId);
    syncRemoteStreamsState();
  };

  const tuneLocalAudioTrack = async (stream: MediaStream) => {
    const [audioTrack] = stream.getAudioTracks();
    if (!audioTrack) {
      return;
    }

    audioTrack.contentHint = "speech";

    try {
      await audioTrack.applyConstraints(AUDIO_TRACK_CONSTRAINTS);
    } catch {
      // Browser may ignore advanced audio constraints.
    }
  };

  const stabilizeOutgoingAudioBitrate = async (peerConnection?: RTCPeerConnection | null) => {
    if (!peerConnection) {
      return;
    }

    const audioSenders = peerConnection.getSenders().filter((sender) => sender.track?.kind === "audio");
    if (audioSenders.length === 0) {
      return;
    }

    await Promise.all(
      audioSenders.map(async (sender) => {
        try {
          const parameters = sender.getParameters();
          const existingEncodings = parameters.encodings && parameters.encodings.length > 0 ? parameters.encodings : [{}];
          const nextEncodings = existingEncodings.map((encoding) => ({
            ...encoding,
            maxBitrate: AUDIO_SENDER_MAX_BITRATE_BPS,
          }));

          await sender.setParameters({
            ...parameters,
            encodings: nextEncodings,
          });
        } catch {
          // Sender parameter tuning is best-effort across browsers.
        }
      }),
    );
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
      if (existing.open) {
        try {
          call.close();
        } catch {
          // noop
        }
        return;
      }

      cleanupCallListeners(peerId);
      try {
        existing.close();
      } catch {
        // noop
      }
    }

    clearPendingConnect(peerId);
    activeCallsRef.current.set(peerId, call);

    const handleStream = (stream: MediaStream) => {
      const participantUserId = peerToUserMapRef.current.get(peerId) || peerId;
      remoteStreamsRef.current.set(peerId, {
        userId: participantUserId,
        stream,
      });
      setError(null);
      syncRemoteStreamsState();
      syncSpeakerMonitors();
    };

    const handleClose = () => {
      if (activeCallsRef.current.get(peerId) === call) {
        activeCallsRef.current.delete(peerId);
      }
      removeRemoteStream(peerId);
      syncSpeakerMonitors();
    };

    const handleError = () => {
      if (activeCallsRef.current.get(peerId) === call) {
        activeCallsRef.current.delete(peerId);
      }
      removeRemoteStream(peerId);
      syncSpeakerMonitors();
    };

    const peerConnection = (call as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
    const handleConnectionState = () => {
      if (!peerConnection) {
        return;
      }

      const isFailed =
        peerConnection.connectionState === "failed" || peerConnection.iceConnectionState === "failed";

      if (!isFailed) {
        return;
      }

      setError("Connection degraded. Retrying media channel...");
      try {
        call.close();
      } catch {
        // noop
      }
    };

    call.on("stream", handleStream);
    call.on("close", handleClose);
    call.on("error", handleError);

    if (peerConnection) {
      void stabilizeOutgoingAudioBitrate(peerConnection);
      const retryTuneTimer = setTimeout(() => {
        void stabilizeOutgoingAudioBitrate(peerConnection);
      }, AUDIO_BITRATE_RETRY_DELAY_MS);

      peerConnection.addEventListener("connectionstatechange", handleConnectionState);
      peerConnection.addEventListener("iceconnectionstatechange", handleConnectionState);
      callCleanupRef.current.set(peerId, () => {
        clearTimeout(retryTuneTimer);
        const callWithEmitter = call as unknown as {
          off?: (event: string, listener: (...args: unknown[]) => void) => void;
          removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
        };

        callWithEmitter.off?.("stream", handleStream as unknown as (...args: unknown[]) => void);
        callWithEmitter.off?.("close", handleClose as unknown as (...args: unknown[]) => void);
        callWithEmitter.off?.("error", handleError as unknown as (...args: unknown[]) => void);
        callWithEmitter.removeListener?.("stream", handleStream as unknown as (...args: unknown[]) => void);
        callWithEmitter.removeListener?.("close", handleClose as unknown as (...args: unknown[]) => void);
        callWithEmitter.removeListener?.("error", handleError as unknown as (...args: unknown[]) => void);

        peerConnection.removeEventListener("connectionstatechange", handleConnectionState);
        peerConnection.removeEventListener("iceconnectionstatechange", handleConnectionState);
      });
      return;
    }

    callCleanupRef.current.set(peerId, () => {
      const callWithEmitter = call as unknown as {
        off?: (event: string, listener: (...args: unknown[]) => void) => void;
        removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
      };

      callWithEmitter.off?.("stream", handleStream as unknown as (...args: unknown[]) => void);
      callWithEmitter.off?.("close", handleClose as unknown as (...args: unknown[]) => void);
      callWithEmitter.off?.("error", handleError as unknown as (...args: unknown[]) => void);
      callWithEmitter.removeListener?.("stream", handleStream as unknown as (...args: unknown[]) => void);
      callWithEmitter.removeListener?.("close", handleClose as unknown as (...args: unknown[]) => void);
      callWithEmitter.removeListener?.("error", handleError as unknown as (...args: unknown[]) => void);
    });
  };

  const destroyPeerConnections = (stopLocalTracks: boolean) => {
    if (participantsPollRef.current) {
      clearInterval(participantsPollRef.current);
      participantsPollRef.current = null;
    }

    if (videoSlotPollRef.current) {
      clearInterval(videoSlotPollRef.current);
      videoSlotPollRef.current = null;
    }

    clearAllPendingConnects();
    stopSpeakerMonitoring();

    for (const [peerId, call] of activeCallsRef.current.entries()) {
      cleanupCallListeners(peerId);
      try {
        call.close();
      } catch {
        // noop
      }
    }
    activeCallsRef.current.clear();
    callCleanupRef.current.clear();

    if (peerRef.current) {
      try {
        (peerRef.current as unknown as { removeAllListeners?: () => void }).removeAllListeners?.();
      } catch {
        // noop
      }

      try {
        peerRef.current.disconnect();
      } catch {
        // noop
      }

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
    mediaRequestRef.current = null;
    videoSlotAcceptPendingRef.current = false;
    setRemoteStreams([]);
    setVideoSlotSnapshot(null);
    setVideoSlotBusy(false);

    if (stopLocalTracks && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      setPermissionState("unknown");
    }
  };

  const setLocalVideoEnabled = (enabled: boolean) => {
    const stream = localStreamRef.current;
    if (!stream) {
      setIsCamEnabled(false);
      return;
    }

    const tracks = stream.getVideoTracks();
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    setIsCamEnabled(Boolean(enabled && tracks.length > 0));
  };

  const applyVideoSlotSnapshot = (snapshot: VideoSlotSnapshot | null, options?: { autoAcceptInvite?: boolean }) => {
    if (!snapshot) {
      return;
    }

    setVideoSlotSnapshot(snapshot);
    if (!cameraIntentRef.current) {
      setLocalVideoEnabled(false);
      return;
    }

    if (snapshot.you.state === "active") {
      setLocalVideoEnabled(true);
      return;
    }

    setLocalVideoEnabled(false);
    if (!options?.autoAcceptInvite || snapshot.you.state !== "invited" || videoSlotAcceptPendingRef.current) {
      return;
    }

    videoSlotAcceptPendingRef.current = true;
    fetch(`${RTC_BASE_URL}/room/video-slot/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userId }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        const acceptedSnapshot = normalizeVideoSlotSnapshot(payload);
        if (acceptedSnapshot) {
          applyVideoSlotSnapshot(acceptedSnapshot, { autoAcceptInvite: false });
          return;
        }

        if (!response.ok) {
          const errorMessage =
            payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : "Failed to accept video slot";
          setError(errorMessage);
        }
      })
      .catch(() => {})
      .finally(() => {
        videoSlotAcceptPendingRef.current = false;
      });
  };

  const fetchVideoSlotStatus = async () => {
    if (!roomId || !userId) {
      return null;
    }

    const response = await fetch(
      `${RTC_BASE_URL}/room/${encodeURIComponent(roomId)}/video-slot/status?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => ({}));
    return normalizeVideoSlotSnapshot(payload);
  };

  const startVideoSlotPolling = () => {
    if (videoSlotPollRef.current) {
      clearInterval(videoSlotPollRef.current);
    }

    videoSlotPollRef.current = setInterval(() => {
      fetchVideoSlotStatus()
        .then((snapshot) => {
          if (!snapshot) {
            return;
          }
          applyVideoSlotSnapshot(snapshot, { autoAcceptInvite: true });
        })
        .catch(() => {});
    }, VIDEO_SLOT_POLL_INTERVAL_MS);
  };

  const requestVideoSlotAccess = async () => {
    if (!roomId || !userId) {
      return null;
    }

    setVideoSlotBusy(true);
    try {
      const response = await fetch(`${RTC_BASE_URL}/room/video-slot/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId, role: selfVideoRole }),
      });
      const payload = await response.json().catch(() => ({}));
      const snapshot = normalizeVideoSlotSnapshot(payload);

      if (!response.ok) {
        const errorMessage =
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Failed to request video slot";
        throw new Error(errorMessage);
      }

      if (snapshot) {
        applyVideoSlotSnapshot(snapshot, { autoAcceptInvite: true });
      }
      return snapshot;
    } finally {
      setVideoSlotBusy(false);
    }
  };

  const releaseVideoSlotAccess = async () => {
    if (!roomId || !userId) {
      return null;
    }

    setVideoSlotBusy(true);
    try {
      const response = await fetch(`${RTC_BASE_URL}/room/video-slot/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId }),
      });
      const payload = await response.json().catch(() => ({}));
      const snapshot = normalizeVideoSlotSnapshot(payload);

      if (snapshot) {
        applyVideoSlotSnapshot(snapshot, { autoAcceptInvite: false });
      }

      if (!response.ok) {
        const errorMessage =
          payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Failed to release video slot";
        throw new Error(errorMessage);
      }

      return snapshot;
    } finally {
      setVideoSlotBusy(false);
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

    setParticipants((current) => {
      if (current.length !== normalizedParticipants.length) {
        return normalizedParticipants;
      }

      for (let index = 0; index < current.length; index += 1) {
        const left = current[index];
        const right = normalizedParticipants[index];
        if (left.userId !== right.userId || left.peerId !== right.peerId) {
          return normalizedParticipants;
        }
      }

      return current;
    });
    return normalizedParticipants;
  };

  const connectToParticipants = (participantEntries: ParticipantEntry[]) => {
    const peer = peerRef.current;
    const stream = localStreamRef.current;
    if (!peer || !stream) return;

    const participantPeerIds = new Set(participantEntries.map((participant) => participant.peerId));
    for (const pendingPeerId of Array.from(pendingConnectTimeoutsRef.current.keys())) {
      if (!participantPeerIds.has(pendingPeerId)) {
        clearPendingConnect(pendingPeerId);
      }
    }

    for (const participant of participantEntries) {
      if (participant.userId === userId) continue;
      if (!participant.peerId) continue;
      if (activeCallsRef.current.has(participant.peerId)) continue;
      if (pendingConnectPeersRef.current.has(participant.peerId)) continue;

      // Deterministic dialing avoids duplicate call pairs.
      if (userId.localeCompare(participant.userId) >= 0) continue;

      pendingConnectPeersRef.current.add(participant.peerId);
      const timeout = setTimeout(() => {
        pendingConnectTimeoutsRef.current.delete(participant.peerId);

        const livePeer = peerRef.current;
        const liveStream = localStreamRef.current;
        if (!livePeer || !liveStream) {
          pendingConnectPeersRef.current.delete(participant.peerId);
          return;
        }

        if (activeCallsRef.current.has(participant.peerId)) {
          pendingConnectPeersRef.current.delete(participant.peerId);
          return;
        }

        try {
          peerToUserMapRef.current.set(participant.peerId, participant.userId);
          const call = livePeer.call(participant.peerId, liveStream, {
            metadata: {
              roomId,
              fromUserId: userId,
            },
          });
          registerMediaCall(call, participant.userId);
        } catch {
          // Peer may not be ready yet; next poll will retry.
        } finally {
          pendingConnectPeersRef.current.delete(participant.peerId);
        }
      }, getConnectDelayMs());

      pendingConnectTimeoutsRef.current.set(participant.peerId, timeout);
    }
  };

  const pruneDisconnectedParticipants = (participantEntries: ParticipantEntry[]) => {
    const activePeerIds = new Set(participantEntries.map((participant) => participant.peerId));

    for (const [participantPeerId, call] of activeCallsRef.current.entries()) {
      if (!activePeerIds.has(participantPeerId)) {
        clearPendingConnect(participantPeerId);
        try {
          call.close();
        } catch {
          // noop
        }
        activeCallsRef.current.delete(participantPeerId);
        removeRemoteStream(participantPeerId);
      }
    }

    for (const pendingPeerId of Array.from(pendingConnectTimeoutsRef.current.keys())) {
      if (!activePeerIds.has(pendingPeerId)) {
        clearPendingConnect(pendingPeerId);
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
    }, PARTICIPANTS_POLL_INTERVAL_MS);
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
      void tuneLocalAudioTrack(localStreamRef.current);
      return localStreamRef.current;
    }

    if (mediaRequestRef.current) {
      return mediaRequestRef.current;
    }

    setPermissionState("requesting");
    mediaRequestRef.current = navigator.mediaDevices
      .getUserMedia({
        audio: AUDIO_TRACK_CONSTRAINTS,
        video: VIDEO_TRACK_CONSTRAINTS,
      })
      .then(async (stream) => {
        await tuneLocalAudioTrack(stream);

        const [videoTrack] = stream.getVideoTracks();
        if (videoTrack) {
          try {
            await videoTrack.applyConstraints(VIDEO_TRACK_CONSTRAINTS);
          } catch {
            // Browser may already apply the cap from getUserMedia.
          }
          videoTrack.contentHint = "motion";
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
        setPermissionState("granted");
        setIsMicEnabled(stream.getAudioTracks().every((track) => track.enabled));
        setIsCamEnabled(stream.getVideoTracks().every((track) => track.enabled));
        return stream;
      })
      .catch(() => {
        setPermissionState("denied");
        throw new Error("Camera/Microphone permission denied. Please allow access and retry.");
      })
      .finally(() => {
        mediaRequestRef.current = null;
      });

    return mediaRequestRef.current;
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
        body: `Meet (Beta) started in #${channelName} by ${displayName}. Click the Meet (Beta) icon (top-right) to join.`,
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
      setLocalVideoEnabled(false);

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
        if (activeCallsRef.current.has(incomingCall.peer)) {
          try {
            incomingCall.close();
          } catch {
            // noop
          }
          return;
        }

        const incomingFromUserId = safeTrim((incomingCall.metadata as { fromUserId?: unknown } | undefined)?.fromUserId);
        incomingCall.answer(mediaStream);
        registerMediaCall(incomingCall, incomingFromUserId || undefined);
      });

      peer.on("disconnected", () => {
        setError("Signaling disconnected, trying to recover...");
        try {
          peer.reconnect();
        } catch {
          // noop
        }
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
            toast.success("Channel members notified for Meet (Beta)");
          })
          .catch((inviteError) => {
            const inviteMessage = inviteError instanceof Error ? inviteError.message : "Invite notification failed";
            toast.error(`Call joined, but invite notification failed: ${inviteMessage}`);
          });
      }

      setCallState("joined");
      setIsMicEnabled(mediaStream.getAudioTracks().every((track) => track.enabled));
      setVideoSlotSnapshot(null);
      startVideoSlotPolling();

      if (cameraIntentRef.current) {
        try {
          await requestVideoSlotAccess();
        } catch (videoSlotError) {
          const message = videoSlotError instanceof Error ? videoSlotError.message : "Video queue request failed";
          setError(message);
        }
      } else {
        const snapshot = await fetchVideoSlotStatus().catch(() => null);
        if (snapshot) {
          applyVideoSlotSnapshot(snapshot, { autoAcceptInvite: false });
        }
      }
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

    if (joinedOnBackendRef.current) {
      await releaseVideoSlotAccess().catch(() => {});
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

  const toggleCam = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextIntent = !cameraIntentRef.current;
    cameraIntentRef.current = nextIntent;
    setCameraIntent(nextIntent);
    setError(null);

    if (callState !== "joined") {
      setLocalVideoEnabled(nextIntent);
      return;
    }

    if (!nextIntent) {
      setLocalVideoEnabled(false);
      await releaseVideoSlotAccess().catch(() => {});
      return;
    }

    try {
      await requestVideoSlotAccess();
    } catch (videoSlotError) {
      const message = videoSlotError instanceof Error ? videoSlotError.message : "Failed to request camera slot";
      setError(message);
      setLocalVideoEnabled(false);
    }
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
      stopSpeakerMonitoring();
      return;
    }

    syncSpeakerMonitors();
  }, [callState, localStream, remoteStreams, userId]);

  const remoteParticipantIds = useMemo(() => {
    const ids = participants
      .map((participant) => participant.userId)
      .filter((participantId) => participantId && participantId !== userId);
    return Array.from(new Set(ids));
  }, [participants, userId]);

  const remoteStreamByUserId = useMemo(() => {
    const map = new Map<string, RemoteStream>();
    for (const remote of remoteStreams) {
      if (!map.has(remote.userId)) {
        map.set(remote.userId, remote);
      }
    }
    return map;
  }, [remoteStreams]);

  const prioritizedRemoteParticipantIds = useMemo(() => {
    const connectedRemoteIds = remoteParticipantIds.filter((participantId) => remoteStreamByUserId.has(participantId));

    if (!activeSpeakerUserId || activeSpeakerUserId === userId || !connectedRemoteIds.includes(activeSpeakerUserId)) {
      return connectedRemoteIds;
    }

    return [activeSpeakerUserId, ...connectedRemoteIds.filter((participantId) => participantId !== activeSpeakerUserId)];
  }, [activeSpeakerUserId, remoteParticipantIds, remoteStreamByUserId, userId]);

  const videoParticipantIds = useMemo(
    () => prioritizedRemoteParticipantIds.slice(0, MAX_REMOTE_VIDEO_TILES),
    [prioritizedRemoteParticipantIds],
  );
  const videoParticipantIdSet = useMemo(() => new Set(videoParticipantIds), [videoParticipantIds]);

  useEffect(() => {
    if (callState !== "joined") {
      return;
    }

    // Keep audio always on while selectively disabling remote video decode/rendering.
    for (const value of remoteStreamsRef.current.values()) {
      const shouldEnableVideo = videoParticipantIdSet.has(value.userId);

      value.stream.getVideoTracks().forEach((track) => {
        if (track.enabled !== shouldEnableVideo) {
          track.enabled = shouldEnableVideo;
        }
      });

      value.stream.getAudioTracks().forEach((track) => {
        if (!track.enabled) {
          track.enabled = true;
        }
      });
    }
  }, [callState, remoteStreams, videoParticipantIdSet]);

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
            <p className="truncate text-xs font-semibold">Meet (Beta) running in #{channelName}</p>
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
          <p className="truncate text-sm font-semibold">Channel Meet (Beta)</p>
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
            <p className="mb-1 font-medium text-foreground">Meet (Beta) Info</p>
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
                Video tiles: <span className="font-medium text-foreground">{1 + videoParticipantIds.length} / {MAX_VIDEO_TILES}</span>
              </p>
              <p>
                Camera slot: <span className="font-medium text-foreground">{videoSlotStatusText}</span>
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
                <p className="text-sm font-medium">Ready to start Channel Meet (Beta)</p>
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
                <div
                  className={cn(
                    "relative min-h-0 overflow-hidden rounded-md border bg-card/90",
                    activeSpeakerUserId === userId && "border-emerald-400/70 ring-2 ring-emerald-400/40",
                  )}
                >
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
                  {activeSpeakerUserId === userId && localMicLive && (
                    <span className="absolute top-1.5 right-1.5 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Speaking
                    </span>
                  )}
                </div>

                {remoteParticipantIds.map((participantUserId) => {
                  const remote = remoteStreamByUserId.get(participantUserId);
                  const label = getParticipantLabel(participantUserId);
                  const canRenderVideo = videoParticipantIdSet.has(participantUserId);
                  const remoteVideoVisible = canRenderVideo && hasLiveVideoTrack(remote?.stream ?? null);
                  const remoteMicLive = hasLiveAudioTrack(remote?.stream ?? null);
                  const isActiveSpeaker = activeSpeakerUserId === participantUserId && remoteMicLive;

                  return (
                    <div
                      key={participantUserId}
                      className={cn(
                        "relative min-h-0 overflow-hidden rounded-md border bg-card/90",
                        isActiveSpeaker && "border-emerald-400/70 ring-2 ring-emerald-400/40",
                      )}
                    >
                      {remoteVideoVisible ? (
                        <StreamPlayer stream={remote!.stream} />
                      ) : (
                        <CameraOffTile
                          stream={remote?.stream ?? null}
                          label={label}
                          micActive={remoteMicLive}
                          subtitle={
                            !remote
                              ? "Connecting..."
                              : canRenderVideo
                                ? "Camera off"
                                : "Audio-only mode"
                          }
                        />
                      )}
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {label}
                        {!canRenderVideo ? " | Audio" : ""}
                      </span>
                      {isActiveSpeaker && (
                        <span className="absolute top-1.5 right-1.5 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Speaking
                        </span>
                      )}
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
                <div className="absolute top-2 left-2 rounded-md border border-border/60 bg-background/85 px-2 py-1 text-[10px] text-muted-foreground">
                  {videoSlotStatusText}
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
                      variant={cameraIntent ? "default" : "secondary"}
                      className="h-8 w-8 rounded-full"
                      onClick={toggleCam}
                      disabled={videoSlotBusy}
                      title={cameraIntent ? "Disable camera" : "Request camera slot"}
                    >
                      {cameraIntent ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
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
              {callState === "connecting" ? "Joining..." : isAdmin ? "Start Meet (Beta)" : "Join Meet (Beta)"}
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

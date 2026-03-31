"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useChat } from "@/hooks/useChat";
import { CornerUpLeft, Send, X } from "lucide-react";

interface ChatInputProps {
  channelId: Id<"chatChannels">;
}

export const ChatInput = ({ channelId }: ChatInputProps) => {
  const [body, setBody] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sendMessage = useMutation(api.chat.sendMessage);
  const setTyping = useMutation(api.chat.setTyping);
  const clearTyping = useMutation(api.chat.clearTyping);

  const { replyToMessageId, setReplyTo } = useChat();

  const replyMessages = useQuery(
    api.chat.getMessages,
    channelId ? { channelId, limit: 50 } : "skip",
  );
  const replyMessage = replyToMessageId
    ? replyMessages?.find((m) => m._id === replyToMessageId)
    : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, [channelId, replyToMessageId]);

  const handleTyping = useCallback(() => {
    setTyping({ channelId }).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      clearTyping({ channelId }).catch(() => {});
    }, 3000);
  }, [channelId, setTyping, clearTyping]);

  const handleSend = () => {
    if (!body.trim()) return;

    sendMessage({
      channelId,
      body: body.trim(),
      replyTo: replyToMessageId ?? undefined,
    });

    setBody("");
    setReplyTo(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    clearTyping({ channelId }).catch(() => {});
  };

  return (
    <div className="space-y-2">
      {replyMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs">
          <CornerUpLeft className="h-3 w-3 shrink-0 text-primary" />
          <span className="text-muted-foreground truncate">
            Replying to{" "}
            <span className="font-medium text-primary">
              {replyMessage.user?.name ?? "someone"}
            </span>
            : {replyMessage.body.slice(0, 50)}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-primary/10"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border bg-background/90 px-2 py-2 shadow-xs backdrop-blur-sm transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
        <input
          ref={inputRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (e.target.value) handleTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message channel"
          className="h-8 flex-1 border-0 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={handleSend}
          disabled={!body.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <div className="px-1 text-[11px] text-muted-foreground">
        Press Enter to send
      </div>
    </div>
  );
};

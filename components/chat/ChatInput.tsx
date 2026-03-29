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

  // Get reply message info
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
    <div className="border-t dark:border-[#222]">
      {replyMessage && (
        <div className="flex items-center gap-2 border-b bg-blue-50 px-3 py-1.5 text-xs dark:border-[#222] dark:bg-[#111]">
          <CornerUpLeft className="h-3 w-3 shrink-0 text-blue-500" />
          <span className="text-muted-foreground truncate">
            Replying to{" "}
            <span className="font-medium text-blue-500 dark:text-blue-400">
              {replyMessage.user?.name ?? "someone"}
            </span>
            : {replyMessage.body.slice(0, 50)}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-[#222]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-1 p-2">
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
          placeholder="Type a message..."
          className="h-8 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none focus:ring-1 focus:ring-blue-400 dark:border-[#222] dark:bg-[#111]"
        />
        <button
          onClick={handleSend}
          disabled={!body.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500 text-white transition hover:bg-blue-600 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

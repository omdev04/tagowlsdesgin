"use client";

import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useChat } from "@/hooks/useChat";
import {
  CornerUpLeft,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ChatMessageProps {
  message: {
    _id: Id<"chatMessages">;
    userId: string;
    body: string;
    _creationTime: number;
    isEdited?: boolean;
    isDeleted?: boolean;
    user: { name: string; imageUrl?: string; email: string } | null;
    replyToMessage?: {
      body: string;
      user: { name: string } | null;
    } | null;
  };
  isOwnMessage: boolean;
  isAdmin: boolean;
  isGrouped?: boolean;
}

export const ChatMessage = ({
  message,
  isOwnMessage,
  isAdmin,
  isGrouped = false,
}: ChatMessageProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);
  const editRef = useRef<HTMLInputElement>(null);

  const editMessage = useMutation(api.chat.editMessage);
  const deleteMessage = useMutation(api.chat.deleteMessage);
  const { setReplyTo } = useChat();

  useEffect(() => {
    if (isEditing) editRef.current?.focus();
  }, [isEditing]);

  const handleEdit = () => {
    if (!editBody.trim()) return;
    editMessage({ messageId: message._id, body: editBody });
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteMessage({ messageId: message._id });
  };

  const time = new Date(message._creationTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "group relative flex px-6",
        isGrouped ? "py-0.5" : "mt-3 py-1",
        message.isDeleted && "opacity-40",
        isOwnMessage ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "flex max-w-[78%] items-end gap-2",
          isOwnMessage ? "flex-row-reverse" : "flex-row",
        )}
      >
        {!isGrouped ? (
          <Avatar className="h-8 w-8 shrink-0 self-end">
            <AvatarImage src={message.user?.imageUrl} />
            <AvatarFallback className="text-xs font-semibold">
              {(message.user?.name ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-8 shrink-0" />
        )}

        <div className={cn("min-w-0", isOwnMessage ? "items-end" : "items-start")}>
          {!isGrouped && (
            <div
              className={cn(
                "mb-1 flex items-baseline gap-2 px-1",
                isOwnMessage ? "justify-end" : "justify-start",
              )}
            >
              {!isOwnMessage && (
                <span className="text-sm font-semibold leading-tight">
                  {message.user?.name ?? "Unknown"}
                </span>
              )}
              <span className="text-muted-foreground text-xs">{time}</span>
              {message.isEdited && !message.isDeleted && (
                <span className="text-muted-foreground text-xs">(edited)</span>
              )}
            </div>
          )}

          <div
            className={cn(
              "relative rounded-2xl px-3 py-2 shadow-sm",
              isOwnMessage
                ? "rounded-br-md bg-blue-600 text-white"
                : "rounded-bl-md bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100",
            )}
          >
            {message.replyToMessage && (
              <div
                className={cn(
                  "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
                  isOwnMessage
                    ? "border-white/60 bg-white/15 text-white/90"
                    : "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-300",
                )}
              >
                <span className="font-medium">
                  {message.replyToMessage.user?.name ?? "Someone"}
                </span>
                : {message.replyToMessage.body.slice(0, 60)}
                {message.replyToMessage.body.length > 60 && "..."}
              </div>
            )}

            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={editRef}
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEdit();
                    if (e.key === "Escape") setIsEditing(false);
                  }}
                  className={cn(
                    "h-8 min-w-[220px] rounded border px-2 text-sm outline-none",
                    isOwnMessage
                      ? "border-white/30 bg-white/10 text-white placeholder:text-white/60"
                      : "border-neutral-300 bg-transparent dark:border-neutral-700",
                  )}
                />
                <button
                  onClick={handleEdit}
                  className={cn(
                    "rounded p-1",
                    isOwnMessage ? "hover:bg-white/10" : "hover:bg-neutral-200 dark:hover:bg-neutral-700",
                  )}
                >
                  <Check className="h-3.5 w-3.5 text-green-500" />
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className={cn(
                    "rounded p-1",
                    isOwnMessage ? "hover:bg-white/10" : "hover:bg-neutral-200 dark:hover:bg-neutral-700",
                  )}
                >
                  <X className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
            ) : (
              <p className="break-words whitespace-pre-wrap text-sm leading-relaxed">
                {message.body}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {!message.isDeleted && !isEditing && (
        <div
          className={cn(
            "absolute top-0 hidden items-center gap-0.5 rounded border bg-white shadow-sm group-hover:flex dark:border-neutral-700 dark:bg-neutral-800",
            isOwnMessage ? "left-8" : "right-8",
          )}
        >
          <button
            onClick={() => setReplyTo(message._id)}
            className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title="Reply"
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
          </button>
          {isOwnMessage && (
            <button
              onClick={() => {
                setEditBody(message.body);
                setIsEditing(true);
              }}
              className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {(isOwnMessage || isAdmin) && (
            <button
              onClick={handleDelete}
              className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

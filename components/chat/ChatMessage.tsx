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
        "group relative flex px-4 md:px-6",
        isGrouped ? "py-0.5" : "mt-2 py-1",
        message.isDeleted && "opacity-40",
        isOwnMessage ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "flex max-w-[80%] items-end gap-2.5",
          isOwnMessage ? "flex-row-reverse" : "flex-row",
        )}
      >
        {!isGrouped ? (
          <Avatar className="h-7 w-7 shrink-0 self-end ring-1 ring-border/60">
            <AvatarImage src={message.user?.imageUrl} />
            <AvatarFallback className="text-xs font-semibold">
              {(message.user?.name ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-7 shrink-0" />
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
              "relative rounded-2xl border px-3 py-2.5 shadow-xs",
              isOwnMessage
                ? "rounded-br-md border-primary/50 bg-primary text-primary-foreground"
                : "rounded-bl-md border-border/80 bg-card text-card-foreground",
            )}
          >
            {message.replyToMessage && (
              <div
                className={cn(
                  "mb-2 rounded-lg border-l-2 px-2 py-1 text-xs",
                  isOwnMessage
                    ? "border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground/90"
                    : "border-primary/60 bg-primary/5 text-primary",
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
                    "h-8 min-w-[220px] rounded-lg border px-2 text-sm outline-none",
                    isOwnMessage
                      ? "border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/60"
                      : "border-border bg-background",
                  )}
                />
                <button
                  onClick={handleEdit}
                  className={cn(
                    "rounded p-1",
                    isOwnMessage ? "hover:bg-primary-foreground/10" : "hover:bg-muted",
                  )}
                >
                  <Check className="h-3.5 w-3.5 text-green-500" />
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className={cn(
                    "rounded p-1",
                    isOwnMessage ? "hover:bg-primary-foreground/10" : "hover:bg-muted",
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
            "absolute top-0 z-10 hidden items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-sm backdrop-blur group-hover:flex",
            isOwnMessage ? "left-7" : "right-7",
          )}
        >
          <button
            onClick={() => setReplyTo(message._id)}
            className="rounded p-1 hover:bg-muted"
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
              className="rounded p-1 hover:bg-muted"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {(isOwnMessage || isAdmin) && (
            <button
              onClick={handleDelete}
              className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
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

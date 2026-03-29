"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, ArrowUp, Calendar, CheckCircle2, Circle, Loader2, Minus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface IssueCardProps {
  issue: any;
  onClick?: () => void;
  isDragging?: boolean;
}

const PRIORITY_CONFIG = {
  LOW: { icon: Minus, color: "text-slate-400", bg: "bg-slate-100 dark:bg-slate-800", label: "Low" },
  MEDIUM: { icon: Minus, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/60", label: "Medium" },
  HIGH: { icon: ArrowUp, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/60", label: "High" },
  URGENT: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/60", label: "Urgent" },
};

const STATUS_DOT: Record<string, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-violet-500",
  DONE: "bg-emerald-500",
};

export const IssueCard = ({ issue, onClick, isDragging }: IssueCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: issue._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityConfig =
    PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.LOW;
  const PriorityIcon = priorityConfig.icon;
  const isOverdue = issue.dueDate && issue.dueDate < Date.now() && issue.status !== "DONE";
  const statusDot = STATUS_DOT[issue.status] ?? STATUS_DOT.TODO;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group cursor-grab rounded-lg border border-border/60 bg-card p-3 transition-all",
        "hover:border-border hover:shadow-sm",
        "active:cursor-grabbing",
        (isDragging || isSortableDragging) && "opacity-40 shadow-lg rotate-1",
      )}
    >
      {/* Row 1: title + priority badge */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <h4 className="flex-1 text-[13px] font-medium leading-snug text-foreground">
          {issue.title}
        </h4>
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded",
            priorityConfig.bg,
          )}
          title={priorityConfig.label}
        >
          <PriorityIcon className={cn("h-3 w-3", priorityConfig.color)} />
        </div>
      </div>

      {/* Labels */}
      {issue.labels && issue.labels.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label: any) => (
            <span
              key={label._id}
              className="flex items-center gap-1 rounded px-1.5 py-[2px] text-[10px] font-semibold"
              style={{ backgroundColor: label.color + "22", color: label.color }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          ))}
          {issue.labels.length > 3 && (
            <span className="rounded bg-muted px-1.5 py-[2px] text-[10px] font-semibold text-muted-foreground">
              +{issue.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Row bottom: assignees + right meta */}
      <div className="flex items-center justify-between gap-2">
        {/* Assignee avatars */}
        <div className="flex items-center gap-1">
          {issue.assignees && issue.assignees.length > 0 ? (
            <div className="flex -space-x-1.5">
              {issue.assignees.slice(0, 3).map((a: any) => (
                <Avatar key={a._id} className="h-5 w-5 border-2 border-card">
                  <AvatarImage src={a.imageUrl} />
                  <AvatarFallback className="text-[9px] font-bold">
                    {a.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              ))}
              {issue.assignees.length > 3 && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-muted text-[9px] font-bold text-muted-foreground">
                  +{issue.assignees.length - 3}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Due date + issue number */}
        <div className="flex items-center gap-1.5">
          {issue.dueDate && (
            <span
              className={cn(
                "flex items-center gap-0.5 rounded px-1.5 py-[2px] text-[10px] font-semibold",
                isOverdue
                  ? "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Calendar className="h-2.5 w-2.5" />
              {new Date(issue.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
          <div className="flex items-center gap-1">
            <div className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
            <span className="font-mono text-[10px] text-muted-foreground/70">
              #{issue.issueNumber}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useIssues } from "@/hooks/useIssues";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  ArrowUp,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  MessageSquare,
  Minus,
  Tag,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TextareaAutosize from "react-textarea-autosize";

/* ─────────────── Config ─────────────── */

const PRIORITY_CONFIG = {
  LOW: {
    icon: Minus,
    color: "text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/60",
    label: "Low",
    dot: "bg-slate-400",
  },
  MEDIUM: {
    icon: Minus,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/60",
    label: "Medium",
    dot: "bg-blue-500",
  },
  HIGH: {
    icon: ArrowUp,
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/60",
    label: "High",
    dot: "bg-orange-500",
  },
  URGENT: {
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/60",
    label: "Urgent",
    dot: "bg-red-500",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; dot: string }
> = {
  TODO: {
    label: "To Do",
    icon: Circle,
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800/60",
    dot: "bg-slate-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: Loader2,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/60",
    dot: "bg-violet-500",
  },
  DONE: {
    label: "Done",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
    dot: "bg-emerald-500",
  },
};

/* ─────────────── Helpers ─────────────── */

const fmtDate = (ts: number, opts?: Intl.DateTimeFormatOptions) =>
  new Date(ts).toLocaleDateString("en-IN", opts ?? { month: "short", day: "numeric", year: "numeric" });

const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/* ─────────────── Property Row ─────────────── */

const PropRow = ({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (

  <div className={cn("grid grid-cols-[96px_1fr] items-start gap-x-3 py-0.5", className)}>
    <span className="pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
      {label}
    </span>
    <div className="min-w-0">{children}</div>
  </div>
);

/* ─────────────── Main Component ─────────────── */

export const IssueDetailModal = () => {
  const { user } = useUser();
  const { activeIssueId, isIssueDetailOpen, closeIssueDetail } = useIssues();

  const issue = useQuery(
    api.issues.getById,
    activeIssueId ? { issueId: activeIssueId } : "skip",
  );
  const comments = useQuery(
    api.comments.getComments,
    activeIssueId ? { issueId: activeIssueId } : "skip",
  );
  const activities = useQuery(
    api.issues.getActivities,
    activeIssueId ? { issueId: activeIssueId } : "skip",
  );

  const updateIssue = useMutation(api.issues.update);
  const removeIssue = useMutation(api.issues.remove);
  const removeAssignee = useMutation(api.issues.removeAssignee);
  const removeLabel = useMutation(api.issues.removeLabel);
  const createComment = useMutation(api.comments.create);

  const [commentBody, setCommentBody] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");

  if (!activeIssueId || !issue) return null;

  const statusCfg = STATUS_CONFIG[issue.status] ?? STATUS_CONFIG.TODO;
  const StatusIcon = statusCfg.icon;
  const priorityCfg = PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.LOW;
  const PriorityIcon = priorityCfg.icon;
  const isOverdue = issue.dueDate && issue.dueDate < Date.now() && issue.status !== "DONE";

  const handleUpdate = (field: string, value: unknown) => {
    if (!activeIssueId) return;
    toast.promise(updateIssue({ issueId: activeIssueId, [field]: value }), {
      loading: "Saving…",
      success: "Saved",
      error: "Failed to save",
    });
  };

  const handleDelete = () => {
    if (!activeIssueId) return;
    toast.promise(removeIssue({ issueId: activeIssueId }), {
      loading: "Deleting…",
      success: () => { closeIssueDetail(); return "Issue deleted"; },
      error: "Failed to delete",
    });
  };

  const handleAddComment = () => {
    if (!activeIssueId || !commentBody.trim()) return;
    toast.promise(createComment({ issueId: activeIssueId, body: commentBody }), {
      loading: "Posting…",
      success: () => { setCommentBody(""); return "Comment added"; },
      error: "Failed",
    });
  };

  return (
    <Dialog open={isIssueDetailOpen} onOpenChange={closeIssueDetail}>
      <DialogContent
        showCloseButton={false}
        style={{ maxWidth: "min(900px, 95vw)", width: "min(900px, 95vw)" }}
        className="max-h-[92vh] overflow-hidden border border-border p-0 shadow-2xl dark:bg-[#1a1a1a] bg-background gap-0 sm:max-w-none"
      >
        <VisuallyHidden>
          <DialogTitle>
            {issue?.title ?? "Issue Details"}
          </DialogTitle>
        </VisuallyHidden>
        <div className="flex h-[92vh] flex-col">

          {/* ── Top bar ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            {/* Issue ID breadcrumb */}
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                {issue.project?.key}-{issue.issueNumber}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs font-medium text-muted-foreground">
                {issue.project?.name}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="h-7 w-7 p-0 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeIssueDetail}
                className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── Body: content + sidebar ── */}
          <div className="flex flex-1 overflow-hidden">

            {/* ── LEFT: content ── */}
            <div className="flex flex-1 flex-col overflow-y-auto px-8 py-6">

              {/* Title */}
              {editingTitle ? (
                <TextareaAutosize
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={() => { handleUpdate("title", titleValue); setEditingTitle(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleUpdate("title", titleValue); setEditingTitle(false); }
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  autoFocus
                  className="mb-5 w-full resize-none border-none bg-transparent p-0 text-2xl font-bold leading-snug text-foreground outline-none shadow-none focus:ring-0"
                />
              ) : (
                <h1
                  onClick={() => { setTitleValue(issue.title); setEditingTitle(true); }}
                  className="mb-5 cursor-pointer text-2xl font-bold leading-snug text-foreground hover:text-foreground/80"
                >
                  {issue.title || <span className="text-muted-foreground">Untitled</span>}
                </h1>
              )}

              {/* Description */}
              <div className="mb-8">
                {editingDesc ? (
                  <TextareaAutosize
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={() => { handleUpdate("description", descValue); setEditingDesc(false); }}
                    placeholder="Add a description…"
                    className="w-full resize-none border-none bg-transparent p-0 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 shadow-none focus:ring-0"
                    autoFocus
                    minRows={3}
                  />
                ) : (
                  <div
                    onClick={() => { setDescValue(issue.description ?? ""); setEditingDesc(true); }}
                    className="min-h-[60px] cursor-pointer rounded-md p-2 -mx-2 text-sm leading-relaxed text-foreground hover:bg-muted/50"
                  >
                    {issue.description ? (
                      <p className="whitespace-pre-wrap">{issue.description}</p>
                    ) : (
                      <span className="text-muted-foreground/50">Add a more detailed description…</span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Tabs: Comments / Activity ── */}
              <Tabs defaultValue="comments" className="flex flex-1 flex-col">
                <TabsList className="mb-5 h-9 w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
                  <TabsTrigger
                    value="comments"
                    className="relative h-9 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none focus-visible:ring-0 data-[state=active]:border-foreground data-[state=active]:text-foreground"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Comments
                    <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {comments?.length ?? 0}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="activity"
                    className="relative h-9 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none focus-visible:ring-0 data-[state=active]:border-foreground data-[state=active]:text-foreground"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Activity
                    <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {activities?.length ?? 0}
                    </span>
                  </TabsTrigger>
                </TabsList>

                {/* ── Comments ── */}
                <TabsContent value="comments" className="mt-0 flex-1 space-y-6 pb-10 outline-none">
                  {/* Compose */}
                  <div className="flex gap-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={user?.imageUrl} />
                      <AvatarFallback className="text-[10px] font-semibold">
                        {user?.firstName?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                      <TextareaAutosize
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleAddComment();
                        }}
                        placeholder="Add a comment…"
                        className="w-full resize-none border-none bg-transparent px-3.5 pt-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-0"
                        minRows={2}
                      />
                      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
                        <span className="text-[11px] text-muted-foreground/60">
                          ⌘ + Enter to send
                        </span>
                        <Button
                          size="sm"
                          onClick={handleAddComment}
                          disabled={!commentBody.trim()}
                          className="h-7 px-3 text-xs"
                        >
                          Comment
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Comment list */}
                  {comments && comments.length > 0 ? (
                    <div className="space-y-5">
                      {comments.map((comment) => (
                        <div key={comment._id} className="flex gap-3">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={comment.user?.imageUrl} />
                            <AvatarFallback className="text-[10px] font-semibold">
                              {comment.user?.name?.charAt(0).toUpperCase() ?? "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="mb-1 flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {comment.user?.name ?? "Unknown"}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {fmtDateTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                              {comment.body}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground/50">No comments yet</p>
                    </div>
                  )}
                </TabsContent>

                {/* ── Activity ── */}
                <TabsContent value="activity" className="mt-0 flex-1 pb-10 outline-none">
                  {activities && activities.length > 0 ? (
                    <div className="relative ml-3.5 space-y-4 border-l border-border pl-6">
                      {activities.map((activity) => (
                        <div key={activity._id} className="relative flex items-start gap-3 text-sm">
                          <Avatar className="absolute -left-[34px] top-0 h-6 w-6 border-2 border-background">
                            <AvatarImage src={activity.user?.imageUrl} />
                            <AvatarFallback className="text-[9px]">
                              {activity.user?.name?.charAt(0).toUpperCase() ?? "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 pt-0.5">
                            <p className="text-sm text-foreground/70">
                              <span className="font-semibold text-foreground">
                                {activity.user?.name ?? "Unknown"}
                              </span>{" "}
                              {activity.action.toLowerCase().replace(/_/g, " ")}
                              {activity.field && (
                                <>
                                  {" "}<span className="font-medium text-foreground">{activity.field}</span>
                                  {activity.oldValue && (
                                    <> from <strong className="text-foreground">{activity.oldValue}</strong></>
                                  )}
                                  {activity.newValue && (
                                    <> to <strong className="text-foreground">{activity.newValue}</strong></>
                                  )}
                                </>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {fmtDateTime(activity.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <Clock className="h-8 w-8 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground/50">No activity yet</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* ── RIGHT: sidebar ── */}
            <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-border bg-muted/20 px-4 py-5">
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Properties
              </p>

              <div className="space-y-1.5">

                {/* Status */}
                <PropRow label="Status">
                  <Select value={issue.status} onValueChange={(val) => handleUpdate("status", val)}>
                    <SelectTrigger className="h-7 w-full border-none bg-transparent px-0 shadow-none focus:ring-0 hover:bg-muted rounded-md px-1.5 -mx-1.5">
                      <SelectValue>
                        <span className={cn("flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold w-fit", statusCfg.bg, statusCfg.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                              {cfg.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </PropRow>

                {/* Priority */}
                <PropRow label="Priority">
                  <Select value={issue.priority} onValueChange={(val) => handleUpdate("priority", val)}>
                    <SelectTrigger className="h-7 w-full border-none bg-transparent px-0 shadow-none focus:ring-0 hover:bg-muted rounded-md px-1.5 -mx-1.5">
                      <SelectValue>
                        <span className={cn("flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold w-fit", priorityCfg.bg, priorityCfg.color)}>
                          <PriorityIcon className="h-3 w-3" />
                          {priorityCfg.label}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                              {cfg.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </PropRow>

                {/* Divider */}
                <div className="!my-3 h-px bg-border" />

                {/* Assignees */}
                <PropRow label="Assignees" className="items-start">
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {issue.assignees && issue.assignees.length > 0 ? (
                      issue.assignees.map((a: any) => (
                        <div
                          key={a._id}
                          className="group flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground shadow-sm"
                        >
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={a.imageUrl} />
                            <AvatarFallback className="text-[9px]">{a.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="max-w-[72px] truncate">{a.name}</span>
                          <button
                            onClick={() =>
                              toast.promise(
                                removeAssignee({ issueId: activeIssueId, userId: a.clerkId }),
                                { loading: "Removing…", success: "Removed", error: "Failed" },
                              )
                            }
                            className="ml-0.5 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950 dark:hover:text-red-400"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="pt-1 text-xs text-muted-foreground/50 flex items-center gap-1">
                        <User className="h-3 w-3" /> Unassigned
                      </span>
                    )}
                  </div>
                </PropRow>

                {/* Labels */}
                <PropRow label="Labels" className="items-start">
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {issue.labels && issue.labels.length > 0 ? (
                      issue.labels.map((l: any) => (
                        <div
                          key={l._id}
                          className="group flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                          style={{ backgroundColor: l.color + "22", color: l.color }}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: l.color }}
                          />
                          {l.name}
                          <button
                            onClick={() =>
                              toast.promise(
                                removeLabel({ issueId: activeIssueId, labelId: l._id }),
                                { loading: "Removing…", success: "Removed", error: "Failed" },
                              )
                            }
                            className="ml-0.5 rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="pt-1 text-xs text-muted-foreground/50 flex items-center gap-1">
                        <Tag className="h-3 w-3" /> No labels
                      </span>
                    )}
                  </div>
                </PropRow>

                {/* Due date */}
                <PropRow label="Due date">
                  {issue.dueDate ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
                        isOverdue
                          ? "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Calendar className="h-3 w-3" />
                      {fmtDate(issue.dueDate, { month: "short", day: "numeric" })}
                      {isOverdue && <span className="font-bold">· Overdue</span>}
                    </span>
                  ) : (
                    <span className="pt-0.5 text-xs text-muted-foreground/50 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> No due date
                    </span>
                  )}
                </PropRow>

                {/* Divider */}
                <div className="!my-3 h-px bg-border" />

                {/* Reporter */}
                <PropRow label="Reporter">
                  {issue.reporter ? (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={issue.reporter.imageUrl} />
                        <AvatarFallback className="text-[9px]">
                          {issue.reporter.name?.charAt(0).toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-foreground/80">
                        {issue.reporter.name ?? "Unknown"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </PropRow>

                {/* Created */}
                <PropRow label="Created">
                  <span className="pt-0.5 text-xs text-foreground/70">
                    {fmtDate(issue.createdAt)}
                  </span>
                </PropRow>

                {/* Updated */}
                <PropRow label="Updated">
                  <span className="pt-0.5 text-xs text-foreground/70">
                    {fmtDate(issue.updatedAt)}
                  </span>
                </PropRow>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

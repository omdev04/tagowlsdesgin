"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useIssues } from "@/hooks/useIssues";
import { IssueCard } from "./IssueCard";
import {
  Plus,
  Trash2,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ─────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────── */

/** Built-in status columns that always exist */
const BUILTIN_COLUMNS = [
  { id: "TODO",        label: "To Do",       dotColor: "bg-slate-400"  },
  { id: "IN_PROGRESS", label: "In Progress", dotColor: "bg-violet-500" },
  { id: "DONE",        label: "Done",        dotColor: "bg-emerald-500" },
];

const COLOR_OPTIONS = [
  { label: "Sky",     value: "bg-sky-500"     },
  { label: "Rose",    value: "bg-rose-500"    },
  { label: "Amber",   value: "bg-amber-500"   },
  { label: "Teal",    value: "bg-teal-500"    },
  { label: "Indigo",  value: "bg-indigo-500"  },
  { label: "Pink",    value: "bg-pink-500"    },
  { label: "Orange",  value: "bg-orange-500"  },
  { label: "Lime",    value: "bg-lime-500"    },
  { label: "Purple",  value: "bg-purple-500"  },
  { label: "Cyan",    value: "bg-cyan-500"    },
];

/* ─────────────────────────────────────────────────────────
   Droppable column wrapper
───────────────────────────────────────────────────────── */

const DroppableColumn = ({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "bg-muted/60 transition-colors")}
    >
      {children}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────
   Add-column dialog
───────────────────────────────────────────────────────── */

interface AddColumnDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onClose: () => void;
}

const AddColumnDialog = ({ projectId, open, onClose }: AddColumnDialogProps) => {
  const createColumn = useMutation(api.projectColumns.create);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("bg-sky-500");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setLoading(true);
    try {
      await createColumn({ projectId, label: label.trim(), color });
      toast.success(`Column "${label.trim()}" created`);
      setLabel("");
      setColor("bg-sky-500");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create column");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Kanban Column</DialogTitle>
          <DialogDescription>
            Custom columns appear after the built-in ones and are visible to all
            workspace members.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="col-label">Column name</Label>
            <Input
              id="col-label"
              placeholder="e.g. In Review"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              maxLength={40}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Dot colour</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c: { label: string; value: string }) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "h-6 w-6 rounded-full transition-transform",
                    c.value,
                    color === c.value
                      ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/60 scale-110"
                      : "opacity-70 hover:opacity-100",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!label.trim() || loading}
            >
              {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Create column
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/* ─────────────────────────────────────────────────────────
   Main KanbanBoard
───────────────────────────────────────────────────────── */

interface KanbanBoardProps {
  projectId: Id<"projects">;
  isAdmin?: boolean;
}

export const KanbanBoard = ({ projectId, isAdmin = false }: KanbanBoardProps) => {
  const { filterStatus, filterPriority, filterAssigneeId, openIssueCreate, openIssueDetail } =
    useIssues();

  /* ── data ── */
  const issuesData = useQuery(api.issues.getByProject, {
    projectId,
    status: filterStatus ?? undefined,
    priority: filterPriority ?? undefined,
    assigneeId: filterAssigneeId ?? undefined,
  });

  const customCols = useQuery(api.projectColumns.getByProject, { projectId }) ?? [];

  /* ── mutations ── */
  const updateIssue   = useMutation(api.issues.update);
  const deleteColumn  = useMutation(api.projectColumns.remove);

  /* ── DnD state ── */
  const [activeId, setActiveId] = useState<Id<"issues"> | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /* ── dialog state ── */
  const [addColumnOpen, setAddColumnOpen] = useState(false);

  /* ── merge columns: built-in first, then custom sorted by order ── */
  const allColumns = [
    ...BUILTIN_COLUMNS.map((c) => ({ ...c, isCustom: false, dbId: null as null })),
    ...customCols.map((c) => ({
      id:       c.label.toUpperCase().replace(/\s+/g, "_"),
      label:    c.label,
      dotColor: c.color,
      isCustom: true,
      dbId:     c._id,
    })),
  ];

  const issues = issuesData?.issues ?? [];

  /* ── drag handlers ── */
  const handleDragStart = (event: DragStartEvent) =>
    setActiveId(event.active.id as Id<"issues">);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const issueId   = active.id as Id<"issues">;
    const newStatus = over.id as string;
    const issue     = issues.find((i) => i._id === issueId);
    if (!issue || issue.status === newStatus) return;

    toast.promise(updateIssue({ issueId, status: newStatus }), {
      loading: "Updating…",
      success: "Status updated",
      error:   "Failed to update",
    });
  };

  const handleDeleteColumn = (dbId: Id<"projectColumns">, label: string) => {
    toast.promise(deleteColumn({ columnId: dbId }), {
      loading: `Deleting "${label}"…`,
      success: "Column deleted",
      error:   "Failed to delete",
    });
  };

  const activeIssue = issues.find((i) => i._id === activeId);

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex h-full gap-5 overflow-x-auto px-6 py-5">

          {/* ── Column cards ── */}
          {allColumns.map((col) => {
            const colIssues = issues.filter((i) => i.status === col.id);

            return (
              <div key={col.id} className="flex w-72 shrink-0 flex-col gap-3">

                {/* Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", col.dotColor)} />
                    <span className="text-sm font-medium text-foreground">
                      {col.label}
                    </span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {colIssues.length}
                    </span>
                    {col.isCustom && (
                      <span className="rounded border border-dashed border-muted-foreground/30 px-1 py-0.5 text-[10px] text-muted-foreground/50">
                        custom
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Delete custom column (admin only) */}
                    {isAdmin && col.isCustom && col.dbId && (
                      <button
                        onClick={() => handleDeleteColumn(col.dbId as Id<"projectColumns">, col.label)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/30"
                        title="Delete column"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    {/* Add issue */}
                    <button
                      onClick={() => openIssueCreate()}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Add issue"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Droppable body */}
                <DroppableColumn
                  id={col.id}
                  className="flex min-h-[120px] flex-1 flex-col gap-2 rounded-lg px-0.5 pb-2 transition-colors"
                >
                  <SortableContext
                    items={colIssues.map((i) => i._id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {colIssues.map((issue) => (
                      <IssueCard
                        key={issue._id}
                        issue={issue}
                        onClick={() => openIssueDetail(issue._id)}
                      />
                    ))}

                    {colIssues.length === 0 && (
                      <div className="flex flex-1 items-center justify-center py-10 text-[13px] text-muted-foreground/40 select-none">
                        No issues
                      </div>
                    )}
                  </SortableContext>
                </DroppableColumn>
              </div>
            );
          })}

          {/* ── "Add column" card — admin only ── */}
          {isAdmin && (
            <div className="flex w-64 shrink-0 flex-col gap-3">
              <button
                onClick={() => setAddColumnOpen(true)}
                className={cn(
                  "flex min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-xl",
                  "border-2 border-dashed border-muted-foreground/20",
                  "text-muted-foreground/50 transition-all",
                  "hover:border-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30",
                  "cursor-pointer",
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <Settings2 className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Add column</span>
              </button>
            </div>
          )}

        </div>

        <DragOverlay>
          {activeId && activeIssue ? <IssueCard issue={activeIssue} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Add column dialog */}
      <AddColumnDialog
        projectId={projectId}
        open={addColumnOpen}
        onClose={() => setAddColumnOpen(false)}
      />
    </>
  );
};

"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, MoreHorizontal, Users, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  assignee?: {
    name: string;
    avatar?: string;
  };
}

interface Column {
  id: string;
  title: string;
  color: string;
}

const COLUMNS: Column[] = [
  { id: "TODO", title: "To Do", color: "bg-neutral-50 dark:bg-neutral-900" },
  { id: "IN_PROGRESS", title: "In Progress", color: "bg-blue-50/50 dark:bg-blue-950/20" },
  { id: "DONE", title: "Done", color: "bg-emerald-50/50 dark:bg-emerald-950/20" },
];

const PRIORITY_COLORS = {
  low: "bg-neutral-400",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
}

const TaskCard = ({ task, isDragging }: TaskCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group cursor-grab rounded-lg border border-neutral-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab opacity-0 transition-opacity hover:text-neutral-600 group-hover:opacity-100 dark:hover:text-neutral-400"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className={cn("h-2 w-2 rounded-full", PRIORITY_COLORS[task.priority])} />
        </div>
        <button className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <h4 className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {task.title}
      </h4>
      {task.description && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {task.description}
        </p>
      )}
      {task.assignee && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
            {task.assignee.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {task.assignee.name}
          </span>
        </div>
      )}
    </div>
  );
};

interface SimpleKanbanBoardProps {
  onOpenUserAccess?: () => void;
}

export const SimpleKanbanBoard = ({ onOpenUserAccess }: SimpleKanbanBoardProps) => {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", title: "Design landing page", description: "Create mockups for new landing page", priority: "high", assignee: { name: "John" } },
    { id: "2", title: "Fix login bug", priority: "medium", assignee: { name: "Sarah" } },
    { id: "3", title: "Update documentation", priority: "low" },
    { id: "4", title: "API integration", description: "Connect to payment gateway", priority: "high", assignee: { name: "Mike" } },
    { id: "5", title: "Code review", priority: "medium", assignee: { name: "John" } },
    { id: "6", title: "Deploy to staging", priority: "high", assignee: { name: "Sarah" } },
  ]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const taskId = active.id as string;
    const newColumnId = over.id as string;

    if (COLUMNS.some(col => col.id === newColumnId)) {
      setTasks(prev => {
        const taskIndex = prev.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return prev;

        const updatedTasks = [...prev];
        const [movedTask] = updatedTasks.splice(taskIndex, 1);
        return [...updatedTasks, { ...movedTask, id: `${Date.now()}` }];
      });
    }
  };

  const activeTask = tasks.find(t => t.id === activeId);

  const getColumnTasks = (columnId: string) => {
    const columnTaskMap: Record<string, string[]> = {
      "TODO": ["1", "2", "3"],
      "IN_PROGRESS": ["4", "5"],
      "DONE": ["6"],
    };
    return tasks.filter(t => columnTaskMap[columnId]?.includes(t.id));
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Kanban Board
          </h2>
        </div>
        <button
          onClick={onOpenUserAccess}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <Users className="h-4 w-4" />
          Manage Access
        </button>
      </div>

      <div className="flex h-[calc(100%-60px)] gap-4 overflow-x-auto bg-neutral-50 p-6 dark:bg-neutral-900">
        {COLUMNS.map((column) => {
          const columnTasks = getColumnTasks(column.id);

          return (
            <div key={column.id} className="flex w-80 shrink-0 flex-col">
              <div
                className={cn(
                  "mb-3 flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 dark:border-neutral-800",
                  column.id === "TODO" && "bg-neutral-100 dark:bg-neutral-800",
                  column.id === "IN_PROGRESS" && "bg-blue-100 dark:bg-blue-900/50",
                  column.id === "DONE" && "bg-emerald-100 dark:bg-emerald-900/50"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      column.id === "TODO" && "bg-neutral-400",
                      column.id === "IN_PROGRESS" && "bg-blue-500",
                      column.id === "DONE" && "bg-emerald-500"
                    )}
                  />
                  <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    {column.title}
                  </h3>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/80 px-1.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-300">
                    {columnTasks.length}
                  </span>
                </div>
                <button className="rounded-lg p-1.5 hover:bg-white/60 dark:hover:bg-neutral-800/60">
                  <Plus className="h-4 w-4 text-neutral-500" />
                </button>
              </div>

              <div
                className={cn(
                  "flex-1 space-y-2.5 overflow-y-auto rounded-xl border border-neutral-200 p-3 dark:border-neutral-800 min-h-[200px]",
                  column.color
                )}
              >
                <SortableContext
                  items={columnTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                  {columnTasks.length === 0 && (
                    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-400 dark:border-neutral-700">
                      Drop tasks here
                    </div>
                  )}
                </SortableContext>
              </div>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeId && activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
};
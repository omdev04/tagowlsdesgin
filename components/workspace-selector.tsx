"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, ChevronDown, NotebookPen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const WorkspaceSelector = () => {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const workspaces = useQuery(api.workspaces.getAll);
  const createWorkspace = useMutation(api.workspaces.create);
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspace();

  const activeWorkspace = workspaces?.find((w) => w?._id === activeWorkspaceId);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const promise = createWorkspace({ name: newName.trim() });
    toast.promise(promise, {
      loading: "Creating workspace...",
      success: (id) => {
        setActiveWorkspace(id);
        setCreating(false);
        setNewName("");
        return "Workspace created!";
      },
      error: "Failed to create workspace.",
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground w-full justify-between px-2 text-sm font-normal"
        >
          <div className="flex items-center gap-2 truncate">
            {activeWorkspaceId ? (
              <>
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {activeWorkspace?.name ?? "Workspace"}
                </span>
              </>
            ) : (
              <>
                <NotebookPen className="h-4 w-4 shrink-0" />
                <span className="truncate">Personal Notes</span>
              </>
            )}
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <div className="space-y-0.5">
          <button
            onClick={() => {
              setActiveWorkspace(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700",
              !activeWorkspaceId && "bg-neutral-100 dark:bg-neutral-700",
            )}
          >
            <NotebookPen className="h-4 w-4" />
            Personal Notes
          </button>

          {workspaces?.map(
            (ws) =>
              ws && (
                <button
                  key={ws._id}
                  onClick={() => {
                    setActiveWorkspace(ws._id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700",
                    activeWorkspaceId === ws._id &&
                      "bg-neutral-100 dark:bg-neutral-700",
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  {ws.icon && <span>{ws.icon}</span>}
                  <span className="truncate">{ws.name}</span>
                </button>
              ),
          )}

          <div className="border-t pt-1 dark:border-neutral-700">
            {creating ? (
              <div className="flex items-center gap-1 px-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Workspace name"
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                />
                <Button size="sm" className="h-7 px-2 text-xs" onClick={handleCreate}>
                  Add
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-blue-600 hover:bg-neutral-100 dark:text-blue-400 dark:hover:bg-neutral-700"
              >
                <Plus className="h-4 w-4" />
                New workspace
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

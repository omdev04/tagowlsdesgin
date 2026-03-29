"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { KanbanBoard } from "@/components/issues/KanbanBoard";
import { IssueFilters } from "@/components/issues/IssueFilters";
import { IssueDetailModal } from "@/components/issues/IssueDetailModal";
import { IssueCreateModal } from "@/components/issues/IssueCreateModal";
import { ProjectSettingsModal } from "@/components/modals/ProjectSettingsModal";
import { Spinner } from "@/components/spinner";
import { ProjectMenu } from "../_components/ProjectMenu";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useIssues } from "@/hooks/useIssues";
import { Button } from "@/components/ui/button";
import { Plus, Settings, ListTodo, Clock, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.projectId as Id<"projects">;
  const { activeWorkspaceId } = useWorkspace();
  const { openIssueCreate } = useIssues();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const project = useQuery(
    api.projects.getById,
    projectId
      ? {
          projectId,
          workspaceContextId: activeWorkspaceId ?? undefined,
        }
      : "skip",
  );
  const stats = useQuery(
    api.projects.getStats,
    projectId
      ? {
          projectId,
          workspaceContextId: activeWorkspaceId ?? undefined,
        }
      : "skip",
  );
  const myRole = useQuery(
    api.workspaces.getMyRole,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const isAdmin = myRole === "admin";

  if (!activeWorkspaceId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Select a workspace to view this project</p>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="icon" />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Project not found in selected workspace</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background dark:bg-dark">
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold flex items-center gap-x-3 text-neutral-900 dark:text-neutral-100">
            {project.icon ? (
              <span>{project.icon}</span>
            ) : (
              <span className="text-neutral-400">{project.key.charAt(0)}</span>
            )}
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.key} {project.description && `· ${project.description}`}
          </p>
        </div>

        <div className="flex items-center gap-x-2">
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          )}
          <Button onClick={() => openIssueCreate()} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
          <ProjectMenu
            projectId={projectId}
            isAdmin={isAdmin}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>
      </div>

      <IssueFilters />

      <div className="flex-1 overflow-hidden">
        <KanbanBoard projectId={projectId} isAdmin={isAdmin} />
      </div>

      <IssueDetailModal />
      <IssueCreateModal projectId={projectId} />
      <ProjectSettingsModal
        projectId={projectId}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

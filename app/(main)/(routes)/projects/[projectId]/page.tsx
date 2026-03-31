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
import { useWorkspace } from "@/hooks/useWorkspace";
import { useIssues } from "@/hooks/useIssues";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Clock,
  Globe2,
  ListTodo,
  Lock,
  Plus,
  Settings,
} from "lucide-react";
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
  const myAccess = useQuery(
    api.projects.getMyAccess,
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

  const statItems = [
    {
      label: "Total",
      value: stats?.total ?? 0,
      icon: ListTodo,
      tone: "text-foreground",
    },
    {
      label: "Todo",
      value: stats?.todo ?? 0,
      icon: Circle,
      tone: "text-slate-500",
    },
    {
      label: "In Progress",
      value: stats?.inProgress ?? 0,
      icon: Clock,
      tone: "text-amber-600",
    },
    {
      label: "Done",
      value: stats?.done ?? 0,
      icon: CheckCircle2,
      tone: "text-emerald-600",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b bg-card/70 px-5 py-4 backdrop-blur-sm md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 truncate text-2xl font-semibold md:text-3xl">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                {project.icon ?? project.key.charAt(0)}
              </span>
              <span className="truncate">{project.name}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.key}
              {project.description ? ` · ${project.description}` : " · Project board"}
            </p>
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              {project.isAccessRestricted ? (
                <Lock className="h-3 w-3" />
              ) : (
                <Globe2 className="h-3 w-3" />
              )}
              {project.isAccessRestricted ? "Restricted access" : "Workspace visible"}
            </div>
          </div>

          <div className="flex items-center gap-2">
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
            <Button
              onClick={() => openIssueCreate()}
              size="sm"
              disabled={myAccess?.canEdit === false}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Issue
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {statItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border bg-background/80 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-lg font-semibold">
                  <Icon className={cn("h-4 w-4", item.tone)} />
                  {item.value}
                </p>
              </div>
            );
          })}
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

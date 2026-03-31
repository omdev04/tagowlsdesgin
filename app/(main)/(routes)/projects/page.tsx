"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Folder,
  Globe2,
  Lock,
  Plus,
  Sparkles,
} from "lucide-react";
import { ProjectMenu } from "./_components/ProjectMenu";

export default function ProjectsPage() {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();

  const projects = useQuery(
    api.projects.getAll,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const myRole = useQuery(
    api.workspaces.getMyRole,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const isAdmin = myRole === "admin";
  const totalProjects = projects?.length ?? 0;
  const restrictedProjects =
    projects?.filter((project) => project.isAccessRestricted).length ?? 0;
  const openProjects = totalProjects - restrictedProjects;

  if (!activeWorkspaceId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Select a workspace to view projects</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="border-b bg-card/60 px-5 py-5 backdrop-blur-sm md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" />
              Projects Workspace
            </div>
            <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage delivery pipelines, ownership, and issue throughput.
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => router.push("/projects/new")} className="shadow-xs">
              <Plus className="mr-2 h-3.5 w-3.5" />
              New Project
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/80 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">{totalProjects}</p>
          </div>
          <div className="rounded-lg border bg-background/80 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Workspace Open</p>
            <p className="text-lg font-semibold">{openProjects}</p>
          </div>
          <div className="rounded-lg border bg-background/80 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Restricted</p>
            <p className="text-lg font-semibold">{restrictedProjects}</p>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-8">
        {projects && projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border bg-card">
              <Folder className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-base font-semibold">No projects yet</h3>
            <p className="mb-4 max-w-sm text-sm text-muted-foreground">
              {isAdmin
                ? "Create your first project and set up ownership, access, and issue flow."
                : "An admin will create projects for this workspace."}
            </p>
            {isAdmin && (
              <Button onClick={() => router.push("/projects/new")}>Create Project</Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects?.map((project) => (
              <div
                key={project._id}
                className="group relative overflow-hidden rounded-xl border bg-card/90 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
              >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/30 to-transparent" />

                <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                  <ProjectMenu projectId={project._id} isAdmin={isAdmin} />
                </div>

                <button
                  onClick={() => router.push(`/projects/${project._id}`)}
                  className="flex h-full w-full flex-col p-5 text-left"
                >
                  <div className="mb-3 flex items-center gap-3 pr-8">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                      {project.icon ?? project.key.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                        {project.name}
                      </h3>
                      <p className="truncate text-xs text-muted-foreground">{project.key}</p>
                    </div>
                  </div>

                  {project.description ? (
                    <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  ) : (
                    <p className="mb-4 line-clamp-2 text-sm text-muted-foreground/80">
                      No description added for this project yet.
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                      {project.isAccessRestricted ? (
                        <Lock className="h-3 w-3" />
                      ) : (
                        <Globe2 className="h-3 w-3" />
                      )}
                      {project.isAccessRestricted ? "Restricted" : "Workspace"}
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

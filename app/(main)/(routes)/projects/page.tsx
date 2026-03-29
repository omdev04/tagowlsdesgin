"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Folder, Plus } from "lucide-react";
import { useState } from "react";
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

  if (!activeWorkspaceId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Select a workspace to view projects</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-neutral-50 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 bg-white px-8 py-6 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Projects</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Manage your team's projects and track issues
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => router.push("/projects/new")}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New Project
            </Button>
          )}
        </div>
      </div>

      <div className="p-8">

        {projects && projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white py-16 dark:border-neutral-700 dark:bg-neutral-950">
            <Folder className="mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
            <h3 className="mb-2 text-base font-medium text-neutral-900 dark:text-neutral-100">No projects yet</h3>
            <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
              {isAdmin ? "Create your first project to get started" : "Wait for an admin to create a project"}
            </p>
            {isAdmin && (
              <Button onClick={() => router.push("/projects/new")}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Create Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects?.map((project) => (
              <div
                key={project._id}
                className="group relative rounded-lg border border-neutral-200 bg-white transition-all hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700"
              >
                {/* Menu Button */}
                <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100">
                  <ProjectMenu projectId={project._id} isAdmin={isAdmin} />
                </div>

                {/* Card Content */}
                <button
                  onClick={() => router.push(`/projects/${project._id}`)}
                  className="flex h-full flex-col p-5 text-left"
                >
                  <div className="mb-3 flex items-center gap-3 pr-8">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
                      {project.icon ?? project.key.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-neutral-900 group-hover:text-blue-600 dark:text-neutral-100 dark:group-hover:text-blue-500">
                        {project.name}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{project.key}</p>
                    </div>
                  </div>
                  {project.description && (
                    <p className="mb-3 line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-auto text-xs text-neutral-500 dark:text-neutral-400">
                    Created {new Date(project.createdAt).toLocaleDateString()}
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

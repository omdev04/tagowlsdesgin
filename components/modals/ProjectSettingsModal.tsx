"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Users,
  AlertTriangle,
  Trash,
  Crown,
  Pencil,
  Eye,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectSettingsModalProps {
  projectId: Id<"projects">;
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectSettingsModal = ({
  projectId,
  isOpen,
  onClose,
}: ProjectSettingsModalProps) => {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();
  const [activeTab, setActiveTab] = useState("general");

  const project = useQuery(
    api.projects.getById,
    activeWorkspaceId
      ? { projectId, workspaceContextId: activeWorkspaceId }
      : { projectId },
  );
  const members = useQuery(
    api.workspaces.getMembers,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip"
  );
  const myRole = useQuery(
    api.workspaces.getMyRole,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );
  const accessList = useQuery(
    api.projects.getAccessList,
    isOpen ? { projectId } : "skip",
  );

  const updateProject = useMutation(api.projects.update);
  const removeProject = useMutation(api.projects.remove);
  const setMemberAccess = useMutation(api.projects.setMemberAccess);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = myRole === "admin";
  const displayedMembers: any[] =
    accessList?.members ?? members?.filter((m) => !m.isPending) ?? [];

  // Sync form with project data when modal opens
  useState(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
    }
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsSaving(true);
    try {
      await updateProject({
        projectId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Project updated successfully");
    } catch (error) {
      toast.error("Failed to update project");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await removeProject({ projectId });
      toast.success("Project deleted");
      onClose();
      router.push("/projects");
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  const handleAccessChange = async (
    userId: string,
    permission: "none" | "view" | "edit",
  ) => {
    try {
      await setMemberAccess({
        projectId,
        userId,
        permission,
      });
      toast.success("Project access updated");
    } catch (error) {
      toast.error("Failed to update project access");
    }
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="h-3.5 w-3.5 text-amber-500" />;
      case "editor":
        return <Pencil className="h-3.5 w-3.5 text-blue-500" />;
      case "viewer":
        return <Eye className="h-3.5 w-3.5 text-emerald-500" />;
      default:
        return <Shield className="h-3.5 w-3.5" />;
    }
  };

  const roleBadge = (role: string) => {
    const colors = {
      admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      editor: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      viewer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    };
    return colors[role as keyof typeof colors] || "bg-neutral-100 text-neutral-700";
  };

  // Update form when project data loads
  if (project && name === "" && project.name) {
    setName(project.name);
    setDescription(project.description ?? "");
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              {project?.icon ?? project?.key?.charAt(0) ?? "P"}
            </div>
            <span>Project Settings</span>
          </DialogTitle>
          <DialogDescription>
            Manage your project settings and team access
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1 gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="members" className="flex-1 gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Members
            </TabsTrigger>
            <TabsTrigger value="danger" className="flex-1 gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Danger
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key">Project Key</Label>
              <Input
                id="key"
                value={project?.key ?? ""}
                disabled
                className="bg-neutral-50 dark:bg-neutral-900"
              />
              <p className="text-xs text-neutral-500">
                Project key cannot be changed after creation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for your project"
                rows={3}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <div className="mb-4">
              <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Project Access
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Admin can control who can access this project and at what level
              </p>
              {accessList && (
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Mode: {accessList.isRestricted ? "Restricted" : "Open to all workspace members"}
                </p>
              )}
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
              {displayedMembers.map((entry: any) => {
                const member = entry.member ?? entry;
                const user = entry.user ?? member.user;
                const effectivePermission = entry.effectivePermission ?? "edit";

                return (
                <div
                  key={member._id}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.imageUrl} />
                      <AvatarFallback className="text-xs">
                        {(user?.name ?? "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {user?.name ?? "Unknown User"}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === "admin" ? (
                      <>
                        {roleIcon("admin")}
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                            roleBadge("admin"),
                          )}
                        >
                          full
                        </span>
                      </>
                    ) : isAdmin ? (
                      <Select
                        value={effectivePermission}
                        onValueChange={(value) =>
                          handleAccessChange(
                            member.userId,
                            value as "none" | "view" | "edit",
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue placeholder="Select access" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No access</SelectItem>
                          <SelectItem value="view">View only</SelectItem>
                          <SelectItem value="edit">Edit</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                          effectivePermission === "none"
                            ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
                            : effectivePermission === "view"
                              ? roleBadge("viewer")
                              : roleBadge("editor"),
                        )}
                      >
                        {effectivePermission}
                      </span>
                    )}
                  </div>
                </div>
              )})}

              {displayedMembers.length === 0 && (
                <div className="py-8 text-center text-sm text-neutral-500">
                  No members found
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              Workspace admins always have full access. Set users to "No access"
              to block project visibility.
            </p>
          </TabsContent>

          <TabsContent value="danger" className="mt-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                  <Trash className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-red-900 dark:text-red-100">
                    Delete Project
                  </h4>
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    Permanently delete this project and all of its issues. This
                    action cannot be undone.
                  </p>
                  <ConfirmModal onConfirm={handleDelete}>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="mt-3"
                    >
                      <Trash className="mr-2 h-3.5 w-3.5" />
                      Delete Project
                    </Button>
                  </ConfirmModal>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

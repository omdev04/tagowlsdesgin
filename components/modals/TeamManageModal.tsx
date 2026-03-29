"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/hooks/useWorkspace";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Crown,
  Search,
  Shield,
  Pencil,
  Eye,
  X,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const TeamManageModal = () => {
  const { activeWorkspaceId, isTeamModalOpen, onTeamModalClose } =
    useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [emailInvite, setEmailInvite] = useState("");

  const members = useQuery(
    api.workspaces.getMembers,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const searchResults = useQuery(
    api.users.searchUsers,
    isTeamModalOpen && searchQuery.length >= 2
      ? { query: searchQuery }
      : "skip",
  );

  const myRole = useQuery(
    api.workspaces.getMyRole,
    activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
  );

  const addMember = useMutation(api.workspaces.addMember);
  const addMemberByEmail = useMutation(api.workspaces.addMemberByEmail);
  const removeMember = useMutation(api.workspaces.removeMember);
  const updateRole = useMutation(api.workspaces.updateMemberRole);

  const isAdmin = myRole === "admin";

  const handleAddMember = (userId: string, role: string = "editor") => {
    if (!activeWorkspaceId) return;
    const promise = addMember({
      workspaceId: activeWorkspaceId,
      userId,
      role,
    });
    toast.promise(promise, {
      loading: "Adding member...",
      success: () => {
        setSearchQuery("");
        return "Member added!";
      },
      error: "Failed to add member.",
    });
  };

  const handleInviteByEmail = () => {
    if (!activeWorkspaceId || !emailInvite.trim()) return;
    const promise = addMemberByEmail({
      workspaceId: activeWorkspaceId,
      email: emailInvite.trim(),
      role: "editor",
    });
    toast.promise(promise, {
      loading: "Inviting...",
      success: () => {
        setEmailInvite("");
        return "Invite sent!";
      },
      error: "Failed to invite.",
    });
  };

  const handleRemoveMember = (userId: string) => {
    if (!activeWorkspaceId) return;
    const promise = removeMember({
      workspaceId: activeWorkspaceId,
      userId,
    });
    toast.promise(promise, {
      loading: "Removing member...",
      success: "Member removed.",
      error: "Failed to remove member.",
    });
  };

  const handleUpdateRole = (userId: string, role: string) => {
    if (!activeWorkspaceId) return;
    const promise = updateRole({
      workspaceId: activeWorkspaceId,
      userId,
      role,
    });
    toast.promise(promise, {
      loading: "Updating role...",
      success: "Role updated.",
      error: "Failed to update role.",
    });
  };

  const existingUserIds = new Set(members?.map((m) => m.userId) ?? []);

  const roleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="h-3.5 w-3.5 text-amber-500" />;
      case "editor":
        return <Pencil className="h-3.5 w-3.5 text-blue-500" />;
      case "viewer":
        return <Eye className="h-3.5 w-3.5 text-green-500" />;
      default:
        return <Shield className="h-3.5 w-3.5" />;
    }
  };

  return (
    <Dialog open={isTeamModalOpen} onOpenChange={onTeamModalClose}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Team Management</DialogTitle>
        </DialogHeader>

        {isAdmin && (
          <div className="space-y-3">
            {/* Search users */}
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by name or email..."
                className="pl-8"
              />
            </div>

            {/* Search results */}
            {searchResults && searchResults.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                {searchResults
                  .filter((u) => !existingUserIds.has(u.clerkId))
                  .map((user) => (
                    <div
                      key={user._id}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user.imageUrl} />
                          <AvatarFallback>
                            {user.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-muted-foreground text-xs">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleAddMember(user.clerkId)}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
              </div>
            )}

            {searchQuery.length >= 2 &&
              searchResults &&
              searchResults.filter((u) => !existingUserIds.has(u.clerkId))
                .length === 0 && (
                <p className="text-muted-foreground text-center text-xs">
                  No users found
                </p>
              )}
          </div>
        )}

        {/* Members list */}
        <div className="mt-2 space-y-1">
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
            Members ({members?.length ?? 0})
          </h4>
          {members?.map((member) => (
            <div
              key={member._id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={member.user?.imageUrl} />
                  <AvatarFallback>
                    {member.isPending
                      ? "?"
                      : (member.user?.name ?? "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="flex items-center gap-1 text-sm font-medium">
                    {member.isPending ? (
                      <>
                        {member.email}
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                          <Clock className="h-2.5 w-2.5" /> Pending
                        </span>
                      </>
                    ) : (
                      member.user?.name ?? "Unknown"
                    )}
                  </p>
                  {!member.isPending && (
                    <p className="text-muted-foreground text-xs">
                      {member.user?.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {roleIcon(member.role)}
                {isAdmin && member.role !== "admin" && (
                  <>
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleUpdateRole(member.userId, e.target.value)
                      }
                      className="h-7 rounded border bg-transparent px-1 text-xs"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      className="rounded p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {member.role === "admin" && (
                  <span className="text-muted-foreground text-xs">Owner</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

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
  Eye,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const DocumentAccessModal = () => {
  const {
    isAccessModalOpen,
    accessDocumentId,
    onAccessModalClose,
    activeWorkspaceId,
  } = useWorkspace();
  const [filterQuery, setFilterQuery] = useState("");

  const document = useQuery(
    api.documents.getById,
    accessDocumentId
      ? {
          documentId: accessDocumentId,
          workspaceContextId: activeWorkspaceId ?? undefined,
        }
      : "skip",
  );

  const accesses = useQuery(
    api.workspaces.getDocumentAccess,
    accessDocumentId ? { documentId: accessDocumentId } : "skip",
  );

  const members = useQuery(
    api.workspaces.getMembers,
    document?.workspaceId
      ? { workspaceId: document.workspaceId }
      : "skip",
  );

  const myRole = useQuery(
    api.workspaces.getMyRole,
    document?.workspaceId
      ? { workspaceId: document.workspaceId }
      : "skip",
  );

  const grantAccess = useMutation(api.workspaces.grantDocumentAccess);
  const revokeAccess = useMutation(api.workspaces.revokeDocumentAccess);

  const isAdmin = myRole === "admin";

  const accessMap = new Map(accesses?.map((a) => [a.userId, a]) ?? []);

  const handleGrant = (userId: string, permission: string) => {
    if (!accessDocumentId) return;
    const promise = grantAccess({ documentId: accessDocumentId, userId, permission });
    toast.promise(promise, {
      loading: "Granting access...",
      success: "Access granted!",
      error: "Failed to grant access.",
    });
  };

  const handleRevoke = (userId: string) => {
    if (!accessDocumentId) return;
    const promise = revokeAccess({ documentId: accessDocumentId, userId });
    toast.promise(promise, {
      loading: "Revoking access...",
      success: "Access revoked.",
      error: "Failed to revoke access.",
    });
  };

  // Split members into admins and non-admins
  const admins = members?.filter((m) => m.role === "admin") ?? [];
  const nonAdmins = members?.filter((m) => m.role !== "admin" && !m.isPending) ?? [];

  // Filter non-admins by search query
  const q = filterQuery.toLowerCase();
  const filteredNonAdmins = q
    ? nonAdmins.filter(
        (m) =>
          m.user?.name?.toLowerCase().includes(q) ||
          m.user?.email?.toLowerCase().includes(q),
      )
    : nonAdmins;

  return (
    <Dialog open={isAccessModalOpen} onOpenChange={onAccessModalClose}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Document Access — {document?.title ?? "..."}
          </DialogTitle>
        </DialogHeader>

        {/* Search filter */}
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter members..."
            className="pl-8"
          />
        </div>

        {/* Admins section */}
        <div>
          <h4 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
            Admins (full access)
          </h4>
          {admins.map((m) => (
            <div
              key={m._id}
              className="flex items-center gap-2 rounded px-2 py-1.5"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={m.user?.imageUrl} />
                <AvatarFallback>
                  {(m.user?.name ?? "A").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{m.user?.name ?? "Admin"}</span>
              <Crown className="ml-auto h-3.5 w-3.5 text-amber-500" />
            </div>
          ))}
        </div>

        {/* Members section */}
        <div>
          <h4 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
            Members
          </h4>
          {filteredNonAdmins.length === 0 && (
            <p className="text-muted-foreground py-2 text-center text-sm">
              No members found
            </p>
          )}
          {filteredNonAdmins.map((m) => {
            const access = accessMap.get(m.userId);
            return (
              <div
                key={m._id}
                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={m.user?.imageUrl} />
                    <AvatarFallback>
                      {(m.user?.name ?? "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{m.user?.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {m.user?.email}
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1">
                    {access ? (
                      <>
                        <select
                          value={access.permission}
                          onChange={(e) =>
                            handleGrant(m.userId, e.target.value)
                          }
                          className="h-7 rounded border bg-transparent px-1 text-xs"
                        >
                          <option value="edit">Edit</option>
                          <option value="view">View</option>
                        </select>
                        <button
                          onClick={() => handleRevoke(m.userId)}
                          className="rounded p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleGrant(m.userId, "edit")}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleGrant(m.userId, "view")}
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          View
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {!isAdmin && access && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    {access.permission === "edit" ? (
                      <Pencil className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {access.permission}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

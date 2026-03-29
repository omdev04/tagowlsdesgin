"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Crown,
  Pencil,
  Eye,
  Trash2,
  Search,
  Plus,
  X,
  Check,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: "admin" | "editor" | "viewer";
}

interface UserAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_MEMBERS: ProjectMember[] = [
  { id: "1", name: "John Doe", email: "john@example.com", role: "admin" },
  { id: "2", name: "Sarah Smith", email: "sarah@example.com", role: "editor" },
  { id: "3", name: "Mike Johnson", email: "mike@example.com", role: "editor" },
  { id: "4", name: "Emily Brown", email: "emily@example.com", role: "viewer" },
];

export const UserAccessModal = ({ isOpen, onClose }: UserAccessModalProps) => {
  const [members, setMembers] = useState<ProjectMember[]>(INITIAL_MEMBERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"editor" | "viewer">("editor");

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRoleChange = (memberId: string, newRole: "admin" | "editor" | "viewer") => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
  };

  const handleRemoveUser = (memberId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleAddUser = () => {
    if (!newUserEmail.trim()) return;

    const name = newUserEmail.split("@")[0];
    const newMember: ProjectMember = {
      id: Date.now().toString(),
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: newUserEmail,
      role: newUserRole,
    };

    setMembers((prev) => [...prev, newMember]);
    setNewUserEmail("");
    setShowAddUser(false);
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
        return <Eye className="h-3.5 w-3.5" />;
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            <span>Project Access</span>
          </DialogTitle>
          <DialogDescription>
            Manage who can access this project and their permission level
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Team Members ({members.length})
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddUser(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add User
            </Button>
          </div>

          {showAddUser && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email Address</Label>
                  <Input
                    placeholder="user@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNewUserRole("editor")}
                      className={cn(
                        "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                        newUserRole === "editor"
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
                      )}
                    >
                      <Pencil className="mr-1 inline h-3.5 w-3.5" />
                      Editor
                    </button>
                    <button
                      onClick={() => setNewUserRole("viewer")}
                      className={cn(
                        "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                        newUserRole === "viewer"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800"
                      )}
                    >
                      <Eye className="mr-1 inline h-3.5 w-3.5" />
                      Viewer
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddUser} className="gap-1">
                    <Check className="h-3.5 w-3.5" />
                    Add
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddUser(false);
                      setNewUserEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback className="text-xs">
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {member.name}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {member.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleRoleChange(member.id, e.target.value as "admin" | "editor" | "viewer")
                    }
                    className={cn(
                      "rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium capitalize dark:border-neutral-700 dark:bg-neutral-800",
                      member.role === "admin" && "text-amber-600 dark:text-amber-400",
                      member.role === "editor" && "text-blue-600 dark:text-blue-400",
                      member.role === "viewer" && "text-emerald-600 dark:text-emerald-400"
                    )}
                    disabled={member.role === "admin"}
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  {member.role !== "admin" && (
                    <button
                      onClick={() => handleRemoveUser(member.id)}
                      className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredMembers.length === 0 && (
              <div className="py-8 text-center text-sm text-neutral-500">
                No members found
              </div>
            )}
          </div>

          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Tip:</strong> Admins have full access including managing other users. 
              Editors can create and edit tasks. Viewers can only view tasks.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
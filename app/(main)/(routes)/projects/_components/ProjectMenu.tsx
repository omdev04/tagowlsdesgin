"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { MoreHorizontal, Settings, Trash } from "lucide-react";
import { useRouter } from "next/navigation";

interface ProjectMenuProps {
  projectId: Id<"projects">;
  isAdmin: boolean;
  onOpenSettings?: () => void;
}

export const ProjectMenu = ({ projectId, isAdmin, onOpenSettings }: ProjectMenuProps) => {
  const router = useRouter();
  const remove = useMutation(api.projects.remove);

  const onDelete = () => {
    const promise = remove({ projectId });

    toast.promise(promise, {
      loading: "Deleting project...",
      success: "Project deleted!",
      error: "Failed to delete project.",
    });

    promise.then(() => {
      router.push("/projects");
    });
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" alignOffset={8}>
        {onOpenSettings && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            className="cursor-pointer"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
        )}
        <ConfirmModal onConfirm={onDelete}>
          <DropdownMenuItem
            onClick={(e) => e.preventDefault()}
            className="cursor-pointer text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          >
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </ConfirmModal>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          Project ID: {projectId}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Save, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface MenuProps {
  documentId: Id<"documents">;
}

export const Menu = ({ documentId }: MenuProps) => {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();

  const archive = useMutation(api.documents.archive);
  const createTemplate = useMutation(api.templates.createFromDocument);
  const document = useQuery(api.documents.getById, {
    documentId,
    workspaceContextId: activeWorkspaceId ?? undefined,
  });
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [templateTagsInput, setTemplateTagsInput] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false);

  useEffect(() => {
    if (!isTemplateDialogOpen || !document) {
      return;
    }

    setTemplateTitle(document.title || "Untitled Template");
    setTemplateDescription("");
    setTemplateCategory("");
    setTemplateTagsInput("");
    setPublishNow(false);
  }, [isTemplateDialogOpen, document]);

  const onArchive = () => {
    const promise = archive({ id: documentId });

    toast.promise(promise, {
      loading: "Moving to trash...",
      success: "Note moved to trash!",
      error: "Failed to archive note.",
    });

    router.push("/documents");
  };

  const onCreateTemplate = () => {
    if (!document) {
      return;
    }

    const tags = templateTagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    setIsSubmittingTemplate(true);

    const promise = createTemplate({
      documentId,
      title: templateTitle.trim() || document.title,
      description: templateDescription.trim() || undefined,
      category: templateCategory.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      isPublic: publishNow,
    })
      .then(() => {
        setIsTemplateDialogOpen(false);
      })
      .finally(() => {
        setIsSubmittingTemplate(false);
      });

    toast.promise(promise, {
      loading: "Saving template...",
      success: publishNow
        ? "Template saved and published!"
        : "Template saved to your library!",
      error: "Failed to save template.",
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-65"
          align="end"
          alignOffset={8}
          forceMount
        >
          <DropdownMenuItem onClick={() => setIsTemplateDialogOpen(true)}>
            <Save className="mr-2 h-4 w-4" />
            Save as template
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive}>
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="text-muted-foreground p-2 text-xs">
            Last edited on{" "}
            {document
              ? new Date(
                  document.updatedAt ?? document._creationTime,
                ).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })
              : "..."}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create template</DialogTitle>
            <DialogDescription>
              Save this note as a reusable template. You can keep it private or publish it for everyone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="template-title">Template title</Label>
              <Input
                id="template-title"
                value={templateTitle}
                onChange={(event) => setTemplateTitle(event.target.value)}
                placeholder="Website launch checklist"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={templateDescription}
                onChange={(event) => setTemplateDescription(event.target.value)}
                placeholder="Short description to help others understand this template"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="template-category">Category</Label>
                <Input
                  id="template-category"
                  value={templateCategory}
                  onChange={(event) => setTemplateCategory(event.target.value)}
                  placeholder="Product"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-tags">Tags (comma separated)</Label>
                <Input
                  id="template-tags"
                  value={templateTagsInput}
                  onChange={(event) => setTemplateTagsInput(event.target.value)}
                  placeholder="planning, launch"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(event) => setPublishNow(event.target.checked)}
                className="h-4 w-4"
              />
              Publish immediately to public templates
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsTemplateDialogOpen(false)}
              disabled={isSubmittingTemplate}
            >
              Cancel
            </Button>
            <Button
              onClick={onCreateTemplate}
              disabled={isSubmittingTemplate || !templateTitle.trim()}
            >
              {isSubmittingTemplate ? "Saving..." : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

Menu.Skeleton = function MenuSkeleton() {
  return <Skeleton className="h-8 w-8" />;
};

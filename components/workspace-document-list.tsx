"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/hooks/useWorkspace";

import { cn } from "@/lib/utils";
import {
  ChevronRight,
  FileText,
  Lock,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

interface WorkspaceDocumentListProps {
  parentDocumentId?: Id<"documents">;
  level?: number;
}

export const WorkspaceDocumentList = ({
  parentDocumentId,
  level = 0,
}: WorkspaceDocumentListProps) => {
  const router = useRouter();
  const { activeWorkspaceId, onAccessModalOpen } = useWorkspace();

  const documents = useQuery(
    api.workspaces.getDocuments,
    activeWorkspaceId
      ? {
          workspaceId: activeWorkspaceId,
          parentDocument: parentDocumentId,
        }
      : "skip",
  );

  const createDocument = useMutation(api.workspaces.createDocument);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const onExpand = (docId: string) => {
    setExpanded((prev) => ({ ...prev, [docId]: !prev[docId] }));
  };

  const handleCreate = (parentId?: Id<"documents">) => {
    if (!activeWorkspaceId) return;
    const promise = createDocument({
      workspaceId: activeWorkspaceId,
      title: "Untitled",
      parentDocument: parentId,
    }).then((id) => router.push(`/documents/${id}`));

    toast.promise(promise, {
      loading: "Creating document...",
      success: "Document created!",
      error: "Failed to create document.",
    });
  };

  if (documents === undefined) {
    return (
      <div className="space-y-1 pl-4">
        <div className="bg-muted h-6 w-3/4 animate-pulse rounded" />
        <div className="bg-muted h-6 w-1/2 animate-pulse rounded" />
      </div>
    );
  }

  if (documents.length === 0 && level === 0) {
    return (
      <p className="text-muted-foreground px-4 py-2 text-sm">
        No documents yet
      </p>
    );
  }

  return (
    <div>
      {documents.map((doc) => (
        <div key={doc._id}>
          <div
            role="button"
            onClick={() => router.push(`/documents/${doc._id}`)}
            className={cn(
              "group flex min-h-[28px] items-center gap-1 py-1 pr-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700",
            )}
            style={{ paddingLeft: `${(level * 12) + 12}px` }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand(doc._id);
              }}
              className="shrink-0 rounded-sm p-0.5 hover:bg-neutral-300 dark:hover:bg-neutral-600"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition",
                  expanded[doc._id] && "rotate-90",
                )}
              />
            </button>
            {doc.icon ? (
              <span className="mr-1 text-base">{doc.icon}</span>
            ) : (
              <FileText className="mr-1 h-4 w-4 shrink-0 text-neutral-500" />
            )}
            <span className="truncate">{doc.title}</span>
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAccessModalOpen(doc._id);
                }}
                className="rounded-sm p-1 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                title="Manage access"
              >
                <Lock className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreate(doc._id);
                }}
                className="rounded-sm p-1 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                title="Add sub-document"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {expanded[doc._id] && (
            <WorkspaceDocumentList
              parentDocumentId={doc._id}
              level={level + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
};

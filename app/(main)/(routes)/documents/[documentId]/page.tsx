"use client";

import dynamic from "next/dynamic";
import { useMemo, use, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

import { Cover } from "@/components/cover";
import { Toolbar } from "@/components/toolbar";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { BlockNoteEditor } from "@blocknote/core";
import { TableOfContents } from "@/components/table-of-contents";
import { Eye } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";

interface DocumentIdPageProps {
  params: Promise<{
    documentId: Id<"documents">;
  }>;
}

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const { documentId } = use(params);
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const { resolvedTheme } = useTheme();
  const { activeWorkspaceId } = useWorkspace();
  const router = useRouter();

  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  const document = useQuery(api.documents.getById, {
    documentId: documentId,
    workspaceContextId: activeWorkspaceId ?? undefined,
  });

  const accessInfo = useQuery(api.workspaces.canAccessDocument, {
    documentId: documentId,
    workspaceContextId: activeWorkspaceId ?? undefined,
  });

  const update = useMutation(api.documents.update);

  const canEdit = accessInfo?.canEdit ?? false;

  useEffect(() => {
    if (!document) return;

    const defaultFavicon =
      resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo.svg";

    window.document.title = `${document.title || "Untitled"} | TagowlsDesign`;

    const link = window.document.querySelector(
      "link[rel~='icon']",
    ) as HTMLLinkElement;
    if (link) {
      link.href = document.icon
        ? `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50%' y='50%' dominant-baseline='central' text-anchor='middle' font-size='100'>${document.icon}</text></svg>`
        : defaultFavicon;
    }

    return () => {
      window.document.title = "TagowlsDesign";
      if (link) link.href = defaultFavicon;
    };
  }, [document?.title, document?.icon, resolvedTheme]);

  useEffect(() => {
    if (document === null || (accessInfo && !accessInfo.canAccess)) {
      router.replace("/documents");
    }
  }, [document, accessInfo, router]);

  const onChange = (content: string) => {
    if (!canEdit) return;
    update({
      id: documentId,
      workspaceContextId: activeWorkspaceId ?? undefined,
      content,
    });
  };

  if (document === undefined) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="mx-auto mt-10 md:max-w-3xl lg:max-w-4xl">
          <div className="space-y-4 pt-4 pl-8">
            <Skeleton className="h-14 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      </div>
    );
  }

  if (document === null || (accessInfo && !accessInfo.canAccess)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Redirecting...
      </div>
    );
  }

  return (
    <div className="pb-35">
      {!canEdit && document.workspaceId && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 py-1.5 text-sm text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
          <Eye className="h-4 w-4" />
          View only — you don&apos;t have edit access to this document
        </div>
      )}
      <Cover url={document.coverImage} />
      <div className="relative mx-auto md:w-[90%]">
        <Toolbar initialData={document} preview={!canEdit} />
        <Editor
          onChange={onChange}
          initialContent={document.content}
          onEditorReady={setEditor}
          editable={canEdit}
        />
        <TableOfContents editor={editor} />
      </div>
    </div>
  );
};
export default DocumentIdPage;

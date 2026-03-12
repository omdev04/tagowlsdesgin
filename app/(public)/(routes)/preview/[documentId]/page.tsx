"use client";

import dynamic from "next/dynamic";
import { useMemo, use } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";

import { Cover } from "@/components/cover";
import { Toolbar } from "@/components/toolbar";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Pencil, Lock, LogIn } from "lucide-react";

interface DocumentIdPageProps {
  params: Promise<{
    documentId: Id<"documents">;
  }>;
}

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const { documentId } = use(params);
  const { isSignedIn, user } = useUser();

  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  const document = useQuery(api.documents.getById, {
    documentId: documentId,
  });

  // Owner uses the regular update mutation; public editors use publicUpdate
  const ownerUpdate = useMutation(api.documents.update);
  const publicUpdate = useMutation("documents:publicUpdate" as any);

  // Determine if the current viewer is the document owner
  const isOwner = isSignedIn && document?.userId === user?.id;

  // Determine if this visitor can edit:
  // - owner can always edit
  // - signed-in user + allowEditing enabled → can edit
  const canEdit = isOwner || (isSignedIn && !!document?.allowEditing);

  const onChange = (content: string) => {
    if (!canEdit) return;

    if (isOwner) {
      ownerUpdate({ id: documentId, content });
    } else {
      publicUpdate({ id: documentId, content });
    }
  };

  if (document === undefined) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="mx-auto mt-10 md:max-w-3xl lg:max-w-4xl">
          <div className="space-y-4 pl-8 pt-4">
            <Skeleton className="h-14 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      </div>
    );
  }

  if (document === null) {
    return <div>Not found</div>;
  }

  return (
    <div className="pb-40">
      <Cover preview url={document.coverImage} />
      <div className="mx-auto md:max-w-3xl lg:max-w-4xl">
        <Toolbar preview initialData={document} />

        {/* Editing status banner */}
        {document.allowEditing && (
          <div className="mx-4 mb-3 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
            {canEdit ? (
              <div className="flex items-center gap-x-2 text-xs text-emerald-700 dark:text-emerald-400">
                <Pencil className="h-3.5 w-3.5" />
                <span>
                  You are editing this document as{" "}
                  <strong>{user?.fullName ?? user?.username ?? "a guest"}</strong>.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-x-2 text-xs text-emerald-700 dark:text-emerald-400">
                <LogIn className="h-3.5 w-3.5" />
                <span>This document allows editing.</span>
                <SignInButton mode="modal">
                  <button className="font-semibold underline underline-offset-2 hover:text-emerald-900 dark:hover:text-emerald-200">
                    Sign in to TagowlsDesign to edit
                  </button>
                </SignInButton>
              </div>
            )}
          </div>
        )}

        {!document.allowEditing && (
          <div className="mx-4 mb-3 flex items-center gap-x-2 rounded-md border border-muted bg-muted/40 px-4 py-2">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Read-only — the owner has not enabled public editing.
            </span>
          </div>
        )}

        <Editor
          editable={canEdit}
          onChange={onChange}
          initialContent={document.content}
        />
      </div>
    </div>
  );
};
export default DocumentIdPage;

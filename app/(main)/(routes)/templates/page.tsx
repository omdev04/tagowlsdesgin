"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Layers, Search, Sparkles, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TemplateDoc = Doc<"templates">;

export default function TemplatesPage() {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const myTemplates = useQuery(api.templates.getMyTemplates, {
    search: search.trim() || undefined,
  }) as TemplateDoc[] | undefined;

  const publicTemplates = useQuery(api.templates.getPublicTemplates, {
    search: search.trim() || undefined,
    category: categoryFilter === "all" ? undefined : categoryFilter,
  }) as TemplateDoc[] | undefined;

  const installTemplate = useMutation(api.templates.installTemplate);
  const setTemplateVisibility = useMutation(api.templates.setTemplateVisibility);
  const deleteTemplate = useMutation(api.templates.deleteTemplate);

  const categories = useMemo(() => {
    if (!publicTemplates) {
      return ["all"];
    }

    return [
      "all",
      ...Array.from(
        new Set(
          publicTemplates
            .map((template) => template.category)
            .filter((value): value is string => !!value),
        ),
      ),
    ];
  }, [publicTemplates]);

  const handleInstall = (templateId: Id<"templates">) => {
    const promise = installTemplate({
      templateId,
      workspaceId: activeWorkspaceId ?? undefined,
    }).then((documentId) => {
      router.push(`/documents/${documentId}`);
    });

    toast.promise(promise, {
      loading: "Installing template...",
      success: "Template installed successfully",
      error: "Failed to install template",
    });
  };

  const handleTogglePublish = (templateId: Id<"templates">, isPublic: boolean) => {
    const promise = setTemplateVisibility({
      templateId,
      isPublic: !isPublic,
    });

    toast.promise(promise, {
      loading: isPublic ? "Unpublishing template..." : "Publishing template...",
      success: isPublic ? "Template is now private" : "Template published",
      error: "Failed to update visibility",
    });
  };

  const handleDeleteTemplate = (templateId: Id<"templates">) => {
    const shouldDelete = window.confirm("Delete this template permanently?");
    if (!shouldDelete) {
      return;
    }

    const promise = deleteTemplate({ templateId });
    toast.promise(promise, {
      loading: "Deleting template...",
      success: "Template deleted",
      error: "Failed to delete template",
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-neutral-50 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 bg-white px-8 py-6 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Templates
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Use ready-made templates or publish your own for other users.
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Install destination: {activeWorkspaceId ? "Active workspace" : "Personal space"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                type="button"
                variant={categoryFilter === category ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(category)}
                className="capitalize"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-8">
        <Tabs defaultValue="explore" className="space-y-4">
          <TabsList>
            <TabsTrigger value="explore" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Explore
            </TabsTrigger>
            <TabsTrigger value="mine" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              My templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="explore">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {publicTemplates?.map((template) => (
                <div
                  key={template._id}
                  className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white">
                      {template.icon ?? "T"}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                        {template.title}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {template.category ?? "General"}
                      </p>
                    </div>
                  </div>

                  {template.description && (
                    <p className="mb-3 line-clamp-3 text-sm text-neutral-600 dark:text-neutral-300">
                      {template.description}
                    </p>
                  )}

                  {(template.tags?.length ?? 0) > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {(template.tags ?? []).slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {template.usageCount ?? 0} installs
                    </span>
                    <Button size="sm" onClick={() => handleInstall(template._id)}>
                      Use template
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {publicTemplates?.length === 0 && (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-950">
                <Layers className="mx-auto mb-2 h-8 w-8 text-neutral-400" />
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  No public templates found for this filter.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="mine">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myTemplates?.map((template) => (
                <div
                  key={template._id}
                  className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                      {template.title}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        template.isPublic
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                          : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      }`}
                    >
                      {template.isPublic ? "Public" : "Private"}
                    </span>
                  </div>

                  {template.description && (
                    <p className="line-clamp-3 text-sm text-neutral-600 dark:text-neutral-300">
                      {template.description}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {template.usageCount ?? 0} installs
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTogglePublish(template._id, template.isPublic)}
                      >
                        {template.isPublic ? "Make private" : "Publish"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteTemplate(template._id)}
                        title="Delete template"
                        aria-label="Delete template"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {myTemplates?.length === 0 && (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-950">
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  You do not have templates yet. Open any document and use Save as template.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

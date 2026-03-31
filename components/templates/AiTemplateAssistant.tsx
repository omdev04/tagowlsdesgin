"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Scope = "private" | "workspace";

type AiNodeBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "heading";
      text: string;
      level?: number;
      isToggleable?: boolean;
    }
  | {
      type: "quote";
      text: string;
    }
  | {
      type: "bulletListItem";
      text: string;
    }
  | {
      type: "numberedListItem";
      text: string;
      start?: number;
    }
  | {
      type: "checkListItem";
      text: string;
      checked?: boolean;
    }
  | {
      type: "toggleListItem";
      text: string;
    }
  | {
      type: "codeBlock";
      code: string;
      language?: string;
    }
  | {
      type: "divider";
    }
  | {
      type: "table";
      headers?: string[];
      rows: string[][];
    }
  | {
      type: "image" | "video" | "audio" | "file";
      name?: string;
      caption?: string;
      url?: string;
    }
  | {
      type: "emoji";
      emoji: string;
      text?: string;
    };

type AiBlueprint = {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  nodes: Array<{
    title: string;
    content?: string;
    parentIndex?: number;
    icon?: string;
    blocks?: AiNodeBlock[];
  }>;
};

const COMMAND_REFINE = new Set(["@refine", "/refine"]);
const COMMAND_CHAT = new Set(["@chat", "/chat"]);
const MIN_INSTRUCTION_CHARS = 8;
const MAX_DOC_SUMMARY_CHARS = 900;
const MAX_PROMPT_CHARS = 2400;

const clipText = (value: string, limit: number) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, limit - 3)}...`;
};

const normalizeCommandToken = (token: string) =>
  token.toLowerCase().replace(/[,:;.!?]+$/g, "");

const parseCommandFromMessage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      mode: "create" as const,
      instruction: "",
    };
  }

  const refinePattern = /(^|[\s([{<])(?:@|\/)refine\b/i;
  const chatPattern = /(^|[\s([{<])(?:@|\/)chat\b/i;

  const hasRefine = refinePattern.test(trimmed);
  const hasChat = chatPattern.test(trimmed);

  if (!hasRefine && !hasChat) {
    return {
      mode: "create" as const,
      instruction: trimmed,
    };
  }

  const mode: "refine" | "chat" | "create" = hasRefine ? "refine" : "chat";
  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  const filtered = tokens.filter((token) => {
    const normalized = normalizeCommandToken(token);
    return !COMMAND_REFINE.has(normalized) && !COMMAND_CHAT.has(normalized);
  });

  return {
    mode,
    instruction: filtered.join(" ").trim(),
  };
};

const extractTextFromDocumentContent = (content?: string) => {
  if (!content) {
    return "";
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const stack: unknown[] = [parsed];
    const textParts: string[] = [];

    while (stack.length > 0 && textParts.length < 10) {
      const current = stack.pop();

      if (typeof current === "string") {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          textParts.push(trimmed);
        }
        continue;
      }

      if (Array.isArray(current)) {
        for (let index = current.length - 1; index >= 0; index -= 1) {
          stack.push(current[index]);
        }
        continue;
      }

      if (current && typeof current === "object") {
        for (const value of Object.values(current)) {
          stack.push(value);
        }
      }
    }

    if (textParts.length > 0) {
      return clipText(textParts.join(" "), MAX_DOC_SUMMARY_CHARS);
    }
  } catch {
    return clipText(content, MAX_DOC_SUMMARY_CHARS);
  }

  return "";
};

const buildCreatePrompt = (instruction: string) => {
  const safeInstruction = clipText(instruction, 1100);
  const prompt = [
    "Create a practical Notion-style document from this request.",
    `User request: ${safeInstruction}`,
    "Return a full blueprint with exactly one root node unless hierarchy is explicitly needed.",
  ].join("\n\n");

  return clipText(prompt, MAX_PROMPT_CHARS);
};

const buildRefinePrompt = (input: {
  title: string;
  summary: string;
  instruction: string;
}) => {
  const safeTitle = clipText(input.title || "Untitled", 120);
  const safeSummary = clipText(input.summary || "No content yet", MAX_DOC_SUMMARY_CHARS);
  const safeInstruction = clipText(input.instruction, 900);

  const prompt = [
    "Refine the current Notion-style document based on user request.",
    "Return a full blueprint with exactly one node only (root only, no child pages).",
    `Current document title: ${safeTitle}`,
    `Current document summary: ${safeSummary}`,
    `User refinement request: ${safeInstruction}`,
  ].join("\n\n");

  return clipText(prompt, MAX_PROMPT_CHARS);
};

const getRootNode = (blueprint: AiBlueprint) => {
  const root = blueprint.nodes.find((node) => node.parentIndex === undefined);
  return root ?? blueprint.nodes[0];
};

export function AiTemplateAssistant() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspaceId } = useWorkspace();
  const createFromAiTemplate = useMutation(api.templates.createFromAiTemplate);
  const refineDocumentFromAi = useMutation(api.templates.refineDocumentFromAi);

  const currentDocumentId = useMemo(() => {
    const match = pathname.match(/^\/documents\/([^/?#]+)/);
    return match?.[1] as Id<"documents"> | undefined;
  }, [pathname]);

  const currentDocument = useQuery(
    api.documents.getById,
    currentDocumentId
      ? {
          documentId: currentDocumentId,
          workspaceContextId: activeWorkspaceId ?? undefined,
        }
      : "skip",
  );

  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<Scope>("workspace");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canUseWorkspaceScope = !!activeWorkspaceId;

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    const parsed = parseCommandFromMessage(trimmedPrompt);
    const isRefine = parsed.mode === "refine";
    const isChat = parsed.mode === "chat";
    const instruction = parsed.instruction;

    if (instruction.length < MIN_INSTRUCTION_CHARS) {
      toast.error("Please write a little more detail for document generation.");
      return;
    }

    if (!isRefine && scope === "workspace" && !activeWorkspaceId) {
      toast.error("No active workspace selected. Switch scope to Private or open a workspace.");
      return;
    }

    if (isChat) {
      toast.error("`@chat` only works inside channel chat panel. Open chat panel and send there.");
      return;
    }

    if (isRefine && !currentDocumentId) {
      toast.error("Open a document first, then use @refine.");
      return;
    }

    if (isRefine && !currentDocument) {
      toast.error("Current document is not accessible for refinement.");
      return;
    }

    setIsSubmitting(true);

    try {
      const requestPrompt = isRefine
        ? buildRefinePrompt({
            title: currentDocument?.title ?? "Untitled",
            summary: extractTextFromDocumentContent(currentDocument?.content),
            instruction,
          })
        : buildCreatePrompt(instruction);

      const response = await fetch("/api/ai/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: requestPrompt,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          (payload as { error?: string; detail?: string } | null)?.detail ||
            (payload as { error?: string } | null)?.error ||
            "Document generation request failed",
        );
      }

      const blueprint = payload as AiBlueprint;

      if (!blueprint?.title || !Array.isArray(blueprint?.nodes) || blueprint.nodes.length === 0) {
        throw new Error("AI returned invalid document data");
      }

      const rootNode = getRootNode(blueprint);
      if (!rootNode) {
        throw new Error("AI did not return a root node");
      }

      if (isRefine) {
        if (!currentDocumentId) {
          throw new Error("Open a document before using @refine");
        }

        await refineDocumentFromAi({
          documentId: currentDocumentId,
          workspaceContextId: activeWorkspaceId ?? undefined,
          node: {
            title: rootNode.title,
            content: rootNode.content,
            icon: rootNode.icon,
            blocks: rootNode.blocks,
          },
        });

        toast.success("Current document updated. New AI content added above existing content.");
        setPrompt("");
        router.push(`/documents/${currentDocumentId}`);
        return;
      }

      const result = await createFromAiTemplate({
        title: blueprint.title,
        description: blueprint.description,
        category: blueprint.category,
        tags: blueprint.tags,
        nodes: blueprint.nodes,
        saveAsTemplate: false,
        workspaceId: scope === "workspace" ? activeWorkspaceId ?? undefined : undefined,
      });

      const summary = `Created '${blueprint.title}' with ${blueprint.nodes.length} page${
        blueprint.nodes.length > 1 ? "s" : ""
      } in ${scope === "workspace" ? "workspace" : "private"} mode.`;

      toast.success("AI document created successfully");
      setPrompt("");
      toast.message(summary);
      router.push(`/documents/${result.rootDocumentId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create AI document";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          "fixed right-5 bottom-5 z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg transition hover:scale-105",
          isOpen && "ring-2 ring-primary/40 ring-offset-2",
        )}
        title="Open AI Document Assistant"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="fixed right-5 bottom-20 z-[70] w-[370px] max-w-[calc(100vw-1.5rem)] rounded-xl border bg-background/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Document AI Agent</p>
              <p className="truncate text-[11px] text-muted-foreground">Use @refine to edit current document</p>
            </div>
          </div>

          <div className="space-y-2">
            <Select
              value={scope}
              onValueChange={(value: Scope) => setScope(value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="workspace" disabled={!canUseWorkspaceScope}>
                  Workspace
                </SelectItem>
              </SelectContent>
            </Select>

            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="@refine add weekly review and risk table in this document. Or write normal prompt to create new document."
              className="min-h-[92px]"
            />

            <Button
              type="button"
              className="w-full"
              onClick={handleGenerate}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying AI...
                </>
              ) : (
                <>
                  <SendHorizontal className="mr-2 h-4 w-4" />
                  Run AI
                </>
              )}
            </Button>

            <p className="px-1 text-[11px] text-muted-foreground">
              `@refine ...` edits opened document. Normal prompt creates a new document.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

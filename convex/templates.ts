import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

type TemplateSnapshotNode = {
  sourceDocumentId: string;
  parentSourceId?: string;
  title: string;
  content?: string;
  icon?: string;
  coverImage?: string;
  order?: number;
};

type TemplateSnapshot = {
  version: 1;
  nodes: TemplateSnapshotNode[];
};

type AiTemplateNodeInput = {
  title: string;
  content?: string;
  parentIndex?: number;
  icon?: string;
  blocks?: AiTemplateBlockInput[];
};

type AiTemplateTextBlockInput = {
  type: "paragraph";
  text: string;
};

type AiTemplateHeadingBlockInput = {
  type: "heading";
  text: string;
  level?: number;
  isToggleable?: boolean;
};

type AiTemplateQuoteBlockInput = {
  type: "quote";
  text: string;
};

type AiTemplateBulletListBlockInput = {
  type: "bulletListItem";
  text: string;
};

type AiTemplateNumberedListBlockInput = {
  type: "numberedListItem";
  text: string;
  start?: number;
};

type AiTemplateCheckListBlockInput = {
  type: "checkListItem";
  text: string;
  checked?: boolean;
};

type AiTemplateToggleListBlockInput = {
  type: "toggleListItem";
  text: string;
};

type AiTemplateCodeBlockInput = {
  type: "codeBlock";
  code: string;
  language?: string;
};

type AiTemplateDividerBlockInput = {
  type: "divider";
};

type AiTemplateTableBlockInput = {
  type: "table";
  headers?: string[];
  rows: string[][];
};

type AiTemplateMediaBlockInput = {
  type: "image" | "video" | "audio" | "file";
  name?: string;
  caption?: string;
  url?: string;
};

type AiTemplateEmojiBlockInput = {
  type: "emoji";
  emoji: string;
  text?: string;
};

type AiTemplateBlockInput =
  | AiTemplateTextBlockInput
  | AiTemplateHeadingBlockInput
  | AiTemplateQuoteBlockInput
  | AiTemplateBulletListBlockInput
  | AiTemplateNumberedListBlockInput
  | AiTemplateCheckListBlockInput
  | AiTemplateToggleListBlockInput
  | AiTemplateCodeBlockInput
  | AiTemplateDividerBlockInput
  | AiTemplateTableBlockInput
  | AiTemplateMediaBlockInput
  | AiTemplateEmojiBlockInput;

const normalizeText = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const parseTags = (tags?: string[]) => {
  if (!tags || tags.length === 0) {
    return undefined;
  }

  const unique = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );

  return unique.length > 0 ? unique : undefined;
};

type BlockNotePartialBlock = {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BlockNotePartialBlock[];
};

const createInlineTextContent = (text: string) => [
  {
    type: "text",
    text,
    styles: {},
  },
];

const createInlineTextBlock = (
  type:
    | "paragraph"
    | "heading"
    | "quote"
    | "bulletListItem"
    | "numberedListItem"
    | "checkListItem"
    | "toggleListItem"
    | "codeBlock",
  text: string,
  props?: Record<string, unknown>,
): BlockNotePartialBlock => ({
  type,
  props,
  content: createInlineTextContent(text),
  children: [],
});

const createParagraphBlock = (text: string): BlockNotePartialBlock => ({
  ...createInlineTextBlock("paragraph", text, {
    textColor: "default",
    backgroundColor: "default",
    textAlignment: "left",
  }),
});

const createDividerBlock = (): BlockNotePartialBlock => ({
  type: "divider",
  props: {},
  content: [],
  children: [],
});

const createMediaBlock = (
  type: "image" | "video" | "audio" | "file",
  options: {
    name?: string;
    caption?: string;
    url?: string;
  },
): BlockNotePartialBlock => {
  const props: Record<string, unknown> = {
    name: options.name ?? "",
    caption: options.caption ?? "",
    url: options.url ?? "",
  };

  if (type === "image" || type === "video" || type === "audio") {
    props.showPreview = true;
  }

  return {
    type,
    props,
    children: [],
  };
};

const createTableBlock = (headers: string[] | undefined, rows: string[][]): BlockNotePartialBlock | undefined => {
  const maxRowColumns = rows.reduce(
    (max, row) => (row.length > max ? row.length : max),
    0,
  );

  const columnCount = Math.max(headers?.length ?? 0, maxRowColumns, 1);

  const normalizedRows = rows
    .map((row) => {
      const clipped = row.slice(0, columnCount).map((cell) => cell.trim());
      while (clipped.length < columnCount) {
        clipped.push("");
      }
      return clipped;
    })
    .filter((row) => row.length > 0);

  if (normalizedRows.length === 0) {
    return undefined;
  }

  const tableRows: string[][] = [];

  if (headers && headers.length > 0) {
    const normalizedHeaders = headers.slice(0, columnCount).map((header) => header.trim());
    while (normalizedHeaders.length < columnCount) {
      normalizedHeaders.push("");
    }
    tableRows.push(normalizedHeaders);
  }

  tableRows.push(...normalizedRows);

  const tableContent: {
    type: "tableContent";
    rows: { cells: string[] }[];
    headerRows?: number;
  } = {
    type: "tableContent",
    rows: tableRows.map((cells) => ({ cells })),
  };

  if (headers && headers.length > 0) {
    tableContent.headerRows = 1;
  }

  return {
    type: "table",
    content: tableContent,
    children: [],
  };
};

const parseTableCells = (line: string) => {
  const withoutOuterPipes = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return withoutOuterPipes.split("|").map((cell) => cell.trim());
};

const TABLE_SEPARATOR_REGEX = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;

const parseMarkdownTableAt = (lines: string[], startIndex: number) => {
  if (startIndex + 1 >= lines.length) {
    return undefined;
  }

  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];

  if (!headerLine.includes("|") || !TABLE_SEPARATOR_REGEX.test(separatorLine)) {
    return undefined;
  }

  const headers = parseTableCells(headerLine);
  if (headers.length === 0) {
    return undefined;
  }

  const rows: string[][] = [];
  let currentIndex = startIndex + 2;

  while (currentIndex < lines.length) {
    const line = lines[currentIndex];
    if (!line.includes("|") || line.trim().length === 0) {
      break;
    }

    rows.push(parseTableCells(line));
    currentIndex += 1;
  }

  return {
    headers,
    rows,
    endIndex: currentIndex - 1,
  };
};

const blocksFromText = (value: string) => {
  const lines = value.split(/\r?\n/);
  const blocks: BlockNotePartialBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join("\n").trim();
    if (text.length > 0) {
      blocks.push(createParagraphBlock(text));
    }
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const table = parseMarkdownTableAt(lines, index);
    if (table) {
      flushParagraph();
      const tableBlock = createTableBlock(table.headers, table.rows);
      if (tableBlock) {
        blocks.push(tableBlock);
      }
      index = table.endIndex;
      continue;
    }

    const line = lines[index];
    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
};

const blocksFromStructuredInput = (blocks?: AiTemplateBlockInput[]) => {
  if (!blocks || blocks.length === 0) {
    return [] as BlockNotePartialBlock[];
  }

  const normalizedBlocks: BlockNotePartialBlock[] = [];

  for (const block of blocks) {
    if (block.type === "paragraph") {
      const text = normalizeText(block.text);
      if (!text) {
        continue;
      }
      normalizedBlocks.push(createParagraphBlock(text));
      continue;
    }

    if (block.type === "heading") {
      const text = normalizeText(block.text);
      if (!text) {
        continue;
      }

      const level =
        typeof block.level === "number" && Number.isInteger(block.level)
          ? Math.min(6, Math.max(1, block.level))
          : 2;

      const props: Record<string, unknown> = {
        level,
      };

      if (block.isToggleable === true) {
        props.isToggleable = true;
      }

      normalizedBlocks.push(createInlineTextBlock("heading", text, props));
      continue;
    }

    if (block.type === "quote") {
      const text = normalizeText(block.text);
      if (!text) {
        continue;
      }

      normalizedBlocks.push(createInlineTextBlock("quote", text));
      continue;
    }

    if (block.type === "bulletListItem") {
      const text = normalizeText(block.text);
      if (!text) {
        continue;
      }

      normalizedBlocks.push(createInlineTextBlock("bulletListItem", text));
      continue;
    }

    if (block.type === "numberedListItem") {
      const text = normalizeText(block.text);
      if (!text) {
        continue;
      }

      const props: Record<string, unknown> = {};
      if (
        typeof block.start === "number" &&
        Number.isInteger(block.start) &&
        block.start > 1
      ) {
        props.start = block.start;
      }

      normalizedBlocks.push(createInlineTextBlock("numberedListItem", text, props));
      continue;
    }

    if (block.type === "checkListItem") {
      const text = normalizeText(block.text);
      if (!text) {
        continue;
      }

      normalizedBlocks.push(
        createInlineTextBlock("checkListItem", text, {
          checked: block.checked === true,
        }),
      );
      continue;
    }

    if (block.type === "toggleListItem") {
      const text = normalizeText(block.text);
      if (!text) {
        continue;
      }

      normalizedBlocks.push(createInlineTextBlock("toggleListItem", text));
      continue;
    }

    if (block.type === "codeBlock") {
      const code = normalizeText(block.code);
      if (!code) {
        continue;
      }

      const props: Record<string, unknown> = {};
      const language = normalizeText(block.language);
      if (language) {
        props.language = language;
      }

      normalizedBlocks.push(createInlineTextBlock("codeBlock", code, props));
      continue;
    }

    if (block.type === "divider") {
      normalizedBlocks.push(createDividerBlock());
      continue;
    }

    if (block.type === "table") {
      const tableBlock = createTableBlock(block.headers, block.rows);
      if (tableBlock) {
        normalizedBlocks.push(tableBlock);
      }
      continue;
    }

    if (
      block.type === "image" ||
      block.type === "video" ||
      block.type === "audio" ||
      block.type === "file"
    ) {
      normalizedBlocks.push(
        createMediaBlock(block.type, {
          name: normalizeText(block.name),
          caption: normalizeText(block.caption),
          url: normalizeText(block.url),
        }),
      );
      continue;
    }

    if (block.type === "emoji") {
      const emoji = normalizeText(block.emoji);
      if (!emoji) {
        continue;
      }

      const trailing = normalizeText(block.text);
      const text = trailing ? `${emoji} ${trailing}` : emoji;
      normalizedBlocks.push(createParagraphBlock(text));
    }
  }

  return normalizedBlocks;
};

const toBlockNoteContent = (node: AiTemplateNodeInput) => {
  const manualBlocks = blocksFromStructuredInput(node.blocks);
  const normalizedText = normalizeText(node.content);

  if (manualBlocks.length > 0) {
    if (normalizedText) {
      manualBlocks.unshift(createParagraphBlock(normalizedText));
    }
    return JSON.stringify(manualBlocks);
  }

  if (!normalizedText) {
    return undefined;
  }

  const parsedBlocks = blocksFromText(normalizedText);
  if (parsedBlocks.length === 0) {
    return undefined;
  }

  return JSON.stringify(parsedBlocks);
};

const parseStoredBlocks = (content?: string): BlockNotePartialBlock[] => {
  const normalized = normalizeText(content);
  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (block): block is BlockNotePartialBlock =>
          !!block && typeof block === "object" && typeof (block as { type?: unknown }).type === "string",
      );
    }
  } catch {
    // Fallback to plain text block when stored content is not valid JSON.
  }

  return [createParagraphBlock(normalized)];
};

const mergeRefinedContent = (refinedContent?: string, existingContent?: string) => {
  const refinedBlocks = parseStoredBlocks(refinedContent);
  if (refinedBlocks.length === 0) {
    return undefined;
  }

  const existingBlocks = parseStoredBlocks(existingContent);
  if (existingBlocks.length === 0) {
    return JSON.stringify(refinedBlocks);
  }

  return JSON.stringify([...refinedBlocks, createDividerBlock(), ...existingBlocks]);
};

const requireUserId = async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
};

const getWorkspaceMember = async (
  ctx: any,
  workspaceId: Id<"workspaces">,
  userId: string,
) => {
  return await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q: any) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .first();
};

const ensureCanEditDocument = async (
  ctx: any,
  documentId: Id<"documents">,
  userId: string,
) => {
  const document = await ctx.db.get(documentId);

  if (!document) {
    throw new Error("Document not found");
  }

  if (!document.workspaceId) {
    if (document.userId !== userId) {
      throw new Error("Not authorized");
    }
    return document;
  }

  const member = await getWorkspaceMember(ctx, document.workspaceId, userId);

  if (!member) {
    throw new Error("Not authorized");
  }

  if (member.role === "admin") {
    return document;
  }

  const access = await ctx.db
    .query("documentAccess")
    .withIndex("by_document_user", (q: any) =>
      q.eq("documentId", documentId).eq("userId", userId),
    )
    .first();

  if (!access || access.permission !== "edit") {
    throw new Error("Not authorized");
  }

  return document;
};

const ensureCanCreateInWorkspace = async (
  ctx: any,
  workspaceId: Id<"workspaces"> | undefined,
  userId: string,
) => {
  if (!workspaceId) {
    return { role: "owner" as const };
  }

  const member = await getWorkspaceMember(ctx, workspaceId, userId);

  if (!member || member.role === "viewer") {
    throw new Error("Not authorized to create documents in this workspace");
  }

  return member;
};

const collectTemplateNodes = async (
  ctx: any,
  root: Doc<"documents">,
): Promise<TemplateSnapshotNode[]> => {
  const nodes: TemplateSnapshotNode[] = [];

  const walk = async (document: Doc<"documents">, parentSourceId?: string) => {
    nodes.push({
      sourceDocumentId: String(document._id),
      parentSourceId,
      title: document.title,
      content: document.content,
      icon: document.icon,
      coverImage: document.coverImage,
      order: document.order,
    });

    const children = await ctx.db
      .query("documents")
      .withIndex("by_parent", (q: any) => q.eq("parentDocument", document._id))
      .filter((q: any) => q.eq(q.field("isArchived"), false))
      .collect();

    children.sort((a: Doc<"documents">, b: Doc<"documents">) => {
      const aOrder = a.order ?? 0;
      const bOrder = b.order ?? 0;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a._creationTime - b._creationTime;
    });

    for (const child of children) {
      await walk(child, String(document._id));
    }
  };

  await walk(root);
  return nodes;
};

const parseSnapshot = (snapshot: string): TemplateSnapshot => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(snapshot);
  } catch {
    throw new Error("Template is corrupted");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as any).nodes)
  ) {
    throw new Error("Template snapshot format is invalid");
  }

  return parsed as TemplateSnapshot;
};

export const createFromDocument = mutation({
  args: {
    documentId: v.id("documents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const sourceDocument = await ensureCanEditDocument(ctx, args.documentId, userId);

    if (sourceDocument.isArchived) {
      throw new Error("Archived document cannot be used as a template");
    }

    const nodes = await collectTemplateNodes(ctx, sourceDocument);
    const now = Date.now();

    const templateId = await ctx.db.insert("templates", {
      ownerId: userId,
      sourceDocumentId: args.documentId,
      sourceWorkspaceId: sourceDocument.workspaceId,
      title: normalizeText(args.title) ?? sourceDocument.title,
      description: normalizeText(args.description),
      icon: sourceDocument.icon,
      coverImage: sourceDocument.coverImage,
      category: normalizeText(args.category),
      tags: parseTags(args.tags),
      isPublic: args.isPublic ?? false,
      snapshot: JSON.stringify({
        version: 1,
        nodes,
      }),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: args.isPublic ? now : undefined,
    });

    return templateId;
  },
});

export const updateTemplateMeta = mutation({
  args: {
    templateId: v.id("templates"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const template = await ctx.db.get(args.templateId);

    if (!template) {
      throw new Error("Template not found");
    }

    if (template.ownerId !== userId) {
      throw new Error("Not authorized");
    }

    const { templateId, ...rest } = args;

    return await ctx.db.patch(templateId, {
      ...rest,
      title: rest.title ? rest.title.trim() : template.title,
      description: rest.description !== undefined ? normalizeText(rest.description) : template.description,
      category: rest.category !== undefined ? normalizeText(rest.category) : template.category,
      tags: rest.tags !== undefined ? parseTags(rest.tags) : template.tags,
      updatedAt: Date.now(),
    });
  },
});

export const setTemplateVisibility = mutation({
  args: {
    templateId: v.id("templates"),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const template = await ctx.db.get(args.templateId);

    if (!template) {
      throw new Error("Template not found");
    }

    if (template.ownerId !== userId) {
      throw new Error("Not authorized");
    }

    const now = Date.now();

    return await ctx.db.patch(args.templateId, {
      isPublic: args.isPublic,
      publishedAt: args.isPublic ? now : undefined,
      updatedAt: now,
    });
  },
});

export const deleteTemplate = mutation({
  args: {
    templateId: v.id("templates"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const template = await ctx.db.get(args.templateId);

    if (!template) {
      throw new Error("Template not found");
    }

    if (template.ownerId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.templateId);
    return true;
  },
});

export const installTemplate = mutation({
  args: {
    templateId: v.id("templates"),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const template = await ctx.db.get(args.templateId);

    if (!template) {
      throw new Error("Template not found");
    }

    if (!template.isPublic && template.ownerId !== userId) {
      throw new Error("This template is private");
    }

    const member = await ensureCanCreateInWorkspace(ctx, args.workspaceId, userId);
    const snapshot = parseSnapshot(template.snapshot);

    if (snapshot.nodes.length === 0) {
      throw new Error("Template has no content");
    }

    const pendingNodes = [...snapshot.nodes];
    const idMap = new Map<string, Id<"documents">>();
    let rootDocumentId: Id<"documents"> | null = null;
    const now = Date.now();

    while (pendingNodes.length > 0) {
      let insertedInPass = false;

      for (let index = pendingNodes.length - 1; index >= 0; index -= 1) {
        const node = pendingNodes[index];

        if (node.parentSourceId && !idMap.has(node.parentSourceId)) {
          continue;
        }

        const parentDocument = node.parentSourceId
          ? idMap.get(node.parentSourceId)
          : undefined;

        const newDocumentId = await ctx.db.insert("documents", {
          title: node.title || "Untitled",
          content: node.content,
          icon: node.icon,
          coverImage: node.coverImage,
          userId,
          workspaceId: args.workspaceId,
          parentDocument,
          isArchived: false,
          isPublished: false,
          allowEditing: false,
          order: node.order,
          updatedAt: now,
        });

        if (args.workspaceId && member.role !== "admin") {
          await ctx.db.insert("documentAccess", {
            documentId: newDocumentId,
            userId,
            permission: "edit",
          });
        }

        idMap.set(node.sourceDocumentId, newDocumentId);

        if (!node.parentSourceId && !rootDocumentId) {
          rootDocumentId = newDocumentId;
        }

        pendingNodes.splice(index, 1);
        insertedInPass = true;
      }

      if (!insertedInPass) {
        throw new Error("Template structure is invalid");
      }
    }

    if (!rootDocumentId) {
      throw new Error("Failed to create root document");
    }

    await ctx.db.patch(args.templateId, {
      usageCount: template.usageCount + 1,
      updatedAt: now,
    });

    return rootDocumentId;
  },
});

const aiTemplateBlockValidator = v.union(
  v.object({
    type: v.literal("paragraph"),
    text: v.string(),
  }),
  v.object({
    type: v.literal("heading"),
    text: v.string(),
    level: v.optional(v.number()),
    isToggleable: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal("quote"),
    text: v.string(),
  }),
  v.object({
    type: v.literal("bulletListItem"),
    text: v.string(),
  }),
  v.object({
    type: v.literal("numberedListItem"),
    text: v.string(),
    start: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("checkListItem"),
    text: v.string(),
    checked: v.optional(v.boolean()),
  }),
  v.object({
    type: v.literal("toggleListItem"),
    text: v.string(),
  }),
  v.object({
    type: v.literal("codeBlock"),
    code: v.string(),
    language: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("divider"),
  }),
  v.object({
    type: v.literal("table"),
    headers: v.optional(v.array(v.string())),
    rows: v.array(v.array(v.string())),
  }),
  v.object({
    type: v.literal("image"),
    name: v.optional(v.string()),
    caption: v.optional(v.string()),
    url: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("video"),
    name: v.optional(v.string()),
    caption: v.optional(v.string()),
    url: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("audio"),
    name: v.optional(v.string()),
    caption: v.optional(v.string()),
    url: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("file"),
    name: v.optional(v.string()),
    caption: v.optional(v.string()),
    url: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("emoji"),
    emoji: v.string(),
    text: v.optional(v.string()),
  }),
);

const aiTemplateNodeValidator = v.object({
  title: v.string(),
  content: v.optional(v.string()),
  parentIndex: v.optional(v.number()),
  icon: v.optional(v.string()),
  blocks: v.optional(v.array(aiTemplateBlockValidator)),
});

export const createFromAiTemplate = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    saveAsTemplate: v.optional(v.boolean()),
    workspaceId: v.optional(v.id("workspaces")),
    nodes: v.array(aiTemplateNodeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const member = await ensureCanCreateInWorkspace(ctx, args.workspaceId, userId);
    const shouldSaveAsTemplate = args.saveAsTemplate !== false;

    if (args.nodes.length === 0) {
      throw new Error("Template must have at least one node");
    }

    const rootNodes = args.nodes.filter((node) => node.parentIndex === undefined);
    if (rootNodes.length !== 1) {
      throw new Error("Template must contain exactly one root node");
    }

    for (let index = 0; index < args.nodes.length; index += 1) {
      const parentIndex = args.nodes[index]?.parentIndex;
      if (parentIndex === undefined) {
        continue;
      }

      if (!Number.isInteger(parentIndex)) {
        throw new Error("Template parent index must be an integer");
      }

      if (parentIndex < 0 || parentIndex >= args.nodes.length) {
        throw new Error("Template parent index is out of bounds");
      }

      if (parentIndex === index) {
        throw new Error("Template node cannot be parent of itself");
      }
    }

    const pendingNodes = args.nodes.map((_, index) => index);
    const idMap = new Map<number, Id<"documents">>();
    const normalizedNodes = new Map<
      number,
      {
        title: string;
        content?: string;
        icon?: string;
        parentIndex?: number;
      }
    >();
    const now = Date.now();

    while (pendingNodes.length > 0) {
      let insertedInPass = false;

      for (let index = pendingNodes.length - 1; index >= 0; index -= 1) {
        const nodeIndex = pendingNodes[index];
        const node = args.nodes[nodeIndex] as AiTemplateNodeInput;
        const parentIndex = node.parentIndex;

        if (parentIndex !== undefined && !idMap.has(parentIndex)) {
          continue;
        }

        const parentDocument = parentIndex !== undefined ? idMap.get(parentIndex) : undefined;
        const nodeTitle = normalizeText(node.title) ?? "Untitled";
        const nodeContent = toBlockNoteContent(node);
        const nodeIcon = normalizeText(node.icon);

        const newDocumentId = await ctx.db.insert("documents", {
          title: nodeTitle,
          content: nodeContent,
          icon: nodeIcon,
          userId,
          workspaceId: args.workspaceId,
          parentDocument,
          isArchived: false,
          isPublished: false,
          allowEditing: false,
          order: nodeIndex,
          updatedAt: now,
        });

        if (args.workspaceId && member.role !== "admin") {
          await ctx.db.insert("documentAccess", {
            documentId: newDocumentId,
            userId,
            permission: "edit",
          });
        }

        idMap.set(nodeIndex, newDocumentId);
        normalizedNodes.set(nodeIndex, {
          title: nodeTitle,
          content: nodeContent,
          icon: nodeIcon,
          parentIndex,
        });

        pendingNodes.splice(index, 1);
        insertedInPass = true;
      }

      if (!insertedInPass) {
        throw new Error("Template hierarchy is invalid");
      }
    }

    const rootIndex = args.nodes.findIndex((node) => node.parentIndex === undefined);
    const rootDocumentId = idMap.get(rootIndex);

    if (!rootDocumentId) {
      throw new Error("Failed to create root document");
    }

    const snapshotNodes: TemplateSnapshotNode[] = args.nodes.map((_, index) => {
      const createdId = idMap.get(index);
      const normalized = normalizedNodes.get(index);

      if (!createdId || !normalized) {
        throw new Error("Template node was not created");
      }

      let parentSourceId: string | undefined;
      if (normalized.parentIndex !== undefined) {
        const parentCreatedId = idMap.get(normalized.parentIndex);
        if (!parentCreatedId) {
          throw new Error("Template parent node was not created");
        }
        parentSourceId = String(parentCreatedId);
      }

      return {
        sourceDocumentId: String(createdId),
        parentSourceId,
        title: normalized.title,
        content: normalized.content,
        icon: normalized.icon,
        order: index,
      };
    });

    if (!shouldSaveAsTemplate) {
      return {
        templateId: undefined,
        rootDocumentId,
      };
    }

    const templateTitle = normalizeText(args.title) ?? normalizedNodes.get(rootIndex)?.title ?? "AI Template";

    const templateId = await ctx.db.insert("templates", {
      ownerId: userId,
      sourceDocumentId: rootDocumentId,
      sourceWorkspaceId: args.workspaceId,
      title: templateTitle,
      description: normalizeText(args.description),
      icon: normalizedNodes.get(rootIndex)?.icon,
      coverImage: undefined,
      category: normalizeText(args.category),
      tags: parseTags(args.tags),
      isPublic: false,
      snapshot: JSON.stringify({
        version: 1,
        nodes: snapshotNodes,
      }),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
    });

    return {
      templateId,
      rootDocumentId,
    };
  },
});

export const refineDocumentFromAi = mutation({
  args: {
    documentId: v.id("documents"),
    workspaceContextId: v.optional(v.id("workspaces")),
    node: aiTemplateNodeValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existingDocument = await ensureCanEditDocument(ctx, args.documentId, userId);

    if (args.workspaceContextId !== undefined) {
      if (existingDocument.workspaceId !== args.workspaceContextId) {
        throw new Error("Unauthorized");
      }
    } else if (existingDocument.workspaceId) {
      throw new Error("Unauthorized");
    }

    const node = args.node as AiTemplateNodeInput;
    const nextContent = toBlockNoteContent(node);
    const mergedContent = mergeRefinedContent(nextContent, existingDocument.content);

    if (!mergedContent) {
      throw new Error("AI refine result is empty");
    }

    await ctx.db.patch(args.documentId, {
      content: mergedContent,
      updatedAt: Date.now(),
    });

    return args.documentId;
  },
});

export const getMyTemplates = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const templates = await ctx.db
      .query("templates")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();

    const searchValue = args.search?.trim().toLowerCase();

    if (!searchValue) {
      return templates;
    }

    return templates.filter((template) => {
      return (
        template.title.toLowerCase().includes(searchValue) ||
        (template.description ?? "").toLowerCase().includes(searchValue) ||
        (template.category ?? "").toLowerCase().includes(searchValue) ||
        (template.tags ?? []).some((tag) => tag.toLowerCase().includes(searchValue))
      );
    });
  },
});

export const getPublicTemplates = query({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("templates")
      .withIndex("by_visibility", (q) => q.eq("isPublic", true))
      .order("desc")
      .collect();

    const searchValue = args.search?.trim().toLowerCase();
    const categoryValue = args.category?.trim().toLowerCase();

    let filtered = templates;

    if (searchValue) {
      filtered = filtered.filter((template) => {
        return (
          template.title.toLowerCase().includes(searchValue) ||
          (template.description ?? "").toLowerCase().includes(searchValue) ||
          (template.category ?? "").toLowerCase().includes(searchValue) ||
          (template.tags ?? []).some((tag) => tag.toLowerCase().includes(searchValue))
        );
      });
    }

    if (categoryValue) {
      filtered = filtered.filter(
        (template) => (template.category ?? "").toLowerCase() === categoryValue,
      );
    }

    filtered.sort((a, b) => {
      if (a.usageCount !== b.usageCount) {
        return b.usageCount - a.usageCount;
      }
      return (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt);
    });

    return filtered;
  },
});

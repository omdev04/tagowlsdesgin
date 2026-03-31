import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";

type AiTemplateNode = {
  title: string;
  content?: string;
  parentIndex?: number;
  icon?: string;
  blocks?: AiTemplateBlock[];
};

type AiTemplateTextBlock = {
  type: "paragraph";
  text: string;
};

type AiTemplateHeadingBlock = {
  type: "heading";
  text: string;
  level?: number;
  isToggleable?: boolean;
};

type AiTemplateQuoteBlock = {
  type: "quote";
  text: string;
};

type AiTemplateBulletListBlock = {
  type: "bulletListItem";
  text: string;
};

type AiTemplateNumberedListBlock = {
  type: "numberedListItem";
  text: string;
  start?: number;
};

type AiTemplateCheckListBlock = {
  type: "checkListItem";
  text: string;
  checked?: boolean;
};

type AiTemplateToggleListBlock = {
  type: "toggleListItem";
  text: string;
};

type AiTemplateCodeBlock = {
  type: "codeBlock";
  code: string;
  language?: string;
};

type AiTemplateDividerBlock = {
  type: "divider";
};

type AiTemplateTableBlock = {
  type: "table";
  headers?: string[];
  rows: string[][];
};

type AiTemplateMediaBlock = {
  type: "image" | "video" | "audio" | "file";
  name?: string;
  caption?: string;
  url?: string;
};

type AiTemplateEmojiBlock = {
  type: "emoji";
  emoji: string;
  text?: string;
};

type AiTemplateBlock =
  | AiTemplateTextBlock
  | AiTemplateHeadingBlock
  | AiTemplateQuoteBlock
  | AiTemplateBulletListBlock
  | AiTemplateNumberedListBlock
  | AiTemplateCheckListBlock
  | AiTemplateToggleListBlock
  | AiTemplateCodeBlock
  | AiTemplateDividerBlock
  | AiTemplateTableBlock
  | AiTemplateMediaBlock
  | AiTemplateEmojiBlock;

type AiTemplateBlueprint = {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  nodes: AiTemplateNode[];
};

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const MAX_PROMPT_LENGTH = 2500;
const MAX_NODES = 12;
const SYSTEM_INSTRUCTION =
  "You are an expert Notion-style content architect. Respond with ONLY valid JSON and no markdown. Generate practical structures for documents or templates. Output schema: { title: string, description?: string, category?: string, tags?: string[], nodes: [{ title: string, content?: string, parentIndex?: number, icon?: string, blocks?: [{ type: 'paragraph', text: string } | { type: 'heading', text: string, level?: number, isToggleable?: boolean } | { type: 'quote', text: string } | { type: 'bulletListItem', text: string } | { type: 'numberedListItem', text: string, start?: number } | { type: 'checkListItem', text: string, checked?: boolean } | { type: 'toggleListItem', text: string } | { type: 'codeBlock', code: string, language?: string } | { type: 'divider' } | { type: 'table', headers?: string[], rows: string[][] } | { type: 'image' | 'video' | 'audio' | 'file', name?: string, caption?: string, url?: string } | { type: 'emoji', emoji: string, text?: string }] }] }. The first node must be the root page and parentIndex must be omitted for root. For child nodes, parentIndex should point to a previous node index. Use table blocks whenever data is tabular. Prefer structured blocks over plain text.";

const safeTrim = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const extractTextContent = (content: unknown) => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }

        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .join("\n")
      .trim();

    return combined;
  }

  return "";
};

const extractJsonObject = (rawContent: string) => {
  const fencedMatch = rawContent.match(/```json\s*([\s\S]*?)```/i);
  const content = fencedMatch?.[1] ?? rawContent;

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model output did not contain a JSON object");
  }

  return content.slice(firstBrace, lastBrace + 1);
};

const collectJsonCandidates = (rawContent: string) => {
  const candidates: string[] = [];
  const trimmed = rawContent.trim();

  if (trimmed) {
    candidates.push(trimmed);
  }

  try {
    const extracted = extractJsonObject(rawContent);
    if (extracted && !candidates.includes(extracted)) {
      candidates.push(extracted);
    }
  } catch {
    // ignore; other candidates may still parse
  }

  const firstBrace = rawContent.indexOf("{");
  const lastBrace = rawContent.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const sliced = rawContent.slice(firstBrace, lastBrace + 1).trim();
    if (sliced && !candidates.includes(sliced)) {
      candidates.push(sliced);
    }
  }

  return candidates;
};

const parseAiJsonPayload = (rawContent: string) => {
  const candidates = collectJsonCandidates(rawContent);
  let firstErrorMessage = "Invalid JSON returned by model";

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      if (error instanceof Error) {
        firstErrorMessage = error.message;
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const withoutTrailingCommas = candidate.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(withoutTrailingCommas);
    } catch {
      // keep trying
    }
  }

  for (const candidate of candidates) {
    try {
      const repaired = jsonrepair(candidate);
      return JSON.parse(repaired);
    } catch {
      // keep trying
    }
  }

  throw new Error(`Model returned malformed JSON. ${firstErrorMessage}`);
};

const sanitizeTags = (tags: unknown) => {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(
      tags
        .map((tag) => safeTrim(tag).toLowerCase())
        .filter((tag) => tag.length > 0)
        .slice(0, 8),
    ),
  );

  return normalized.length > 0 ? normalized : undefined;
};

const sanitizeTableRows = (rows: unknown) => {
  if (!Array.isArray(rows)) {
    return undefined;
  }

  const normalizedRows = rows
    .slice(0, 20)
    .map((row) => {
      if (!Array.isArray(row)) {
        return [] as string[];
      }

      return row
        .slice(0, 8)
        .map((cell) => safeTrim(cell).slice(0, 320));
    })
    .filter((row) => row.length > 0);

  return normalizedRows.length > 0 ? normalizedRows : undefined;
};

const clampHeadingLevel = (level: unknown) => {
  if (typeof level !== "number" || !Number.isInteger(level)) {
    return 2;
  }

  return Math.min(6, Math.max(1, level));
};

const sanitizeBoolean = (value: unknown) => {
  return typeof value === "boolean" ? value : undefined;
};

const sanitizeBlocks = (blocks: unknown): AiTemplateBlock[] | undefined => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return undefined;
  }

  const sanitized: AiTemplateBlock[] = [];

  for (const rawBlock of blocks.slice(0, 24)) {
    if (!rawBlock || typeof rawBlock !== "object") {
      continue;
    }

    const blockType = safeTrim((rawBlock as { type?: unknown }).type);

    if (
      blockType === "paragraph" ||
      blockType === "quote" ||
      blockType === "bulletListItem" ||
      blockType === "numberedListItem" ||
      blockType === "checkListItem" ||
      blockType === "toggleListItem"
    ) {
      const text = safeTrim((rawBlock as { text?: unknown }).text).slice(0, 4000);
      if (!text) {
        continue;
      }

      if (blockType === "numberedListItem") {
        const start =
          typeof (rawBlock as { start?: unknown }).start === "number" &&
          Number.isInteger((rawBlock as { start?: unknown }).start) &&
          (rawBlock as { start?: number }).start! > 0
            ? (rawBlock as { start?: number }).start
            : undefined;

        sanitized.push({
          type: "numberedListItem",
          text,
          start,
        });
        continue;
      }

      if (blockType === "checkListItem") {
        sanitized.push({
          type: "checkListItem",
          text,
          checked: sanitizeBoolean((rawBlock as { checked?: unknown }).checked),
        });
        continue;
      }

      if (blockType === "quote") {
        sanitized.push({
          type: "quote",
          text,
        });
        continue;
      }

      if (blockType === "bulletListItem") {
        sanitized.push({
          type: "bulletListItem",
          text,
        });
        continue;
      }

      if (blockType === "toggleListItem") {
        sanitized.push({
          type: "toggleListItem",
          text,
        });
        continue;
      }

      sanitized.push({
        type: "paragraph",
        text,
      });
      continue;
    }

    if (blockType === "heading") {
      const text = safeTrim((rawBlock as { text?: unknown }).text).slice(0, 4000);
      if (!text) {
        continue;
      }

      sanitized.push({
        type: "heading",
        text,
        level: clampHeadingLevel((rawBlock as { level?: unknown }).level),
        isToggleable: sanitizeBoolean((rawBlock as { isToggleable?: unknown }).isToggleable),
      });
      continue;
    }

    if (blockType === "codeBlock") {
      const code =
        safeTrim((rawBlock as { code?: unknown }).code).slice(0, 12000) ||
        safeTrim((rawBlock as { text?: unknown }).text).slice(0, 12000);

      if (!code) {
        continue;
      }

      const language = safeTrim((rawBlock as { language?: unknown }).language).slice(0, 40) || undefined;

      sanitized.push({
        type: "codeBlock",
        code,
        language,
      });
      continue;
    }

    if (blockType === "divider") {
      sanitized.push({
        type: "divider",
      });
      continue;
    }

    if (blockType === "table") {
      const rawHeaders = (rawBlock as { headers?: unknown }).headers;
      const headers = Array.isArray(rawHeaders)
        ? rawHeaders
            .slice(0, 8)
            .map((header) => safeTrim(header).slice(0, 160))
        : undefined;
      const rows = sanitizeTableRows((rawBlock as { rows?: unknown }).rows);

      if (!rows || rows.length === 0) {
        continue;
      }

      const maxRowColumns = rows.reduce(
        (max, row) => (row.length > max ? row.length : max),
        0,
      );
      const columnCount = Math.max(headers?.length ?? 0, maxRowColumns, 1);

      const normalizedHeaders = headers
        ?.slice(0, columnCount)
        .concat(new Array(Math.max(0, columnCount - (headers?.length ?? 0))).fill(""));

      const normalizedRows = rows.map((row) => {
        const clipped = row.slice(0, columnCount);
        while (clipped.length < columnCount) {
          clipped.push("");
        }
        return clipped;
      });

      sanitized.push({
        type: "table",
        headers: normalizedHeaders,
        rows: normalizedRows,
      });
      continue;
    }

    if (blockType === "image" || blockType === "video" || blockType === "audio" || blockType === "file") {
      const name = safeTrim((rawBlock as { name?: unknown }).name).slice(0, 160) || undefined;
      const caption = safeTrim((rawBlock as { caption?: unknown }).caption).slice(0, 400) || undefined;
      const url = safeTrim((rawBlock as { url?: unknown }).url).slice(0, 1200) || undefined;

      sanitized.push({
        type: blockType,
        name,
        caption,
        url,
      });
      continue;
    }

    if (blockType === "emoji") {
      const emoji = safeTrim((rawBlock as { emoji?: unknown }).emoji).slice(0, 16);
      if (!emoji) {
        continue;
      }

      const text = safeTrim((rawBlock as { text?: unknown }).text).slice(0, 160) || undefined;

      sanitized.push({
        type: "emoji",
        emoji,
        text,
      });
    }
  }

  return sanitized.length > 0 ? sanitized : undefined;
};

const sanitizeNodes = (nodes: unknown, fallbackPrompt: string): AiTemplateNode[] => {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [
      {
        title: "Overview",
        content: fallbackPrompt,
      },
    ];
  }

  const sanitized: AiTemplateNode[] = [];

  for (const rawNode of nodes.slice(0, MAX_NODES)) {
    if (!rawNode || typeof rawNode !== "object") {
      continue;
    }

    const obj = rawNode as {
      title?: unknown;
      content?: unknown;
      parentIndex?: unknown;
      icon?: unknown;
    };

    const title = safeTrim(obj.title).slice(0, 120) || "Untitled";
    const content = safeTrim(obj.content).slice(0, 8000) || undefined;
    const icon = safeTrim(obj.icon).slice(0, 8) || undefined;
    const blocks = sanitizeBlocks((obj as { blocks?: unknown }).blocks);

    const parsedParentIndex =
      typeof obj.parentIndex === "number" && Number.isInteger(obj.parentIndex)
        ? obj.parentIndex
        : undefined;

    sanitized.push({
      title,
      content,
      parentIndex: parsedParentIndex,
      icon,
      blocks,
    });
  }

  if (sanitized.length === 0) {
    return [
      {
        title: "Overview",
        content: fallbackPrompt,
      },
    ];
  }

  sanitized[0] = {
    ...sanitized[0],
    parentIndex: undefined,
  };

  for (let index = 1; index < sanitized.length; index += 1) {
    const parent = sanitized[index]?.parentIndex;
    if (parent === undefined || parent < 0 || parent >= index) {
      sanitized[index] = {
        ...sanitized[index],
        parentIndex: 0,
      };
    }
  }

  return sanitized;
};

const sanitizeBlueprint = (raw: unknown, fallbackPrompt: string): AiTemplateBlueprint => {
  const payload = (raw ?? {}) as {
    title?: unknown;
    description?: unknown;
    category?: unknown;
    tags?: unknown;
    nodes?: unknown;
  };

  const title = safeTrim(payload.title).slice(0, 120) || "AI Generated Template";
  const description = safeTrim(payload.description).slice(0, 400) || undefined;
  const category = safeTrim(payload.category).slice(0, 60) || "general";

  return {
    title,
    description,
    category,
    tags: sanitizeTags(payload.tags),
    nodes: sanitizeNodes(payload.nodes, fallbackPrompt),
  };
};

const normalizeModelEndpoint = (rawEndpoint: string) => {
  const trimmed = safeTrim(rawEndpoint);
  if (!trimmed) {
    throw new Error("NVIDIA_AI_ENDPOINT is empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("NVIDIA_AI_ENDPOINT must be a valid URL");
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");

  if (
    normalizedPath.endsWith("/chat/completions") ||
    normalizedPath.endsWith("/completions")
  ) {
    return parsed.toString();
  }

  if (normalizedPath.endsWith("/v1")) {
    parsed.pathname = `${normalizedPath}/chat/completions`;
    return parsed.toString();
  }

  if (!normalizedPath || normalizedPath === "/") {
    parsed.pathname = "/v1/chat/completions";
    return parsed.toString();
  }

  parsed.pathname = `${normalizedPath}/chat/completions`;
  return parsed.toString();
};

const extractModelContent = (payload: any) => {
  const fromChat = extractTextContent(payload?.choices?.[0]?.message?.content);
  if (fromChat) {
    return fromChat;
  }

  const fromCompletion = safeTrim(payload?.choices?.[0]?.text);
  if (fromCompletion) {
    return fromCompletion;
  }

  return "";
};

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endpoint = process.env.NVIDIA_AI_ENDPOINT;
  const apiKey = process.env.NVIDIA_AI_API_KEY;
  const model = process.env.NVIDIA_AI_MODEL || DEFAULT_MODEL;

  if (!endpoint || !apiKey) {
    return NextResponse.json(
      { error: "AI endpoint is not configured. Set NVIDIA_AI_ENDPOINT and NVIDIA_AI_API_KEY." },
      { status: 500 },
    );
  }

  let resolvedEndpoint: string;
  try {
    resolvedEndpoint = normalizeModelEndpoint(endpoint);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid NVIDIA_AI_ENDPOINT";
    return NextResponse.json(
      {
        error: "AI endpoint configuration is invalid",
        detail: message,
      },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  const prompt = safeTrim((body as { prompt?: unknown } | null)?.prompt);

  if (prompt.length < 8) {
    return NextResponse.json(
      { error: "Please describe the request in at least 8 characters." },
      { status: 400 },
    );
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `Prompt is too long. Max ${MAX_PROMPT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  try {
    const isLegacyCompletionEndpoint =
      resolvedEndpoint.endsWith("/completions") &&
      !resolvedEndpoint.endsWith("/chat/completions");

    const userInstruction = prompt;

    const requestPayload = isLegacyCompletionEndpoint
      ? {
          model,
          temperature: 0.3,
          max_tokens: 1400,
          stream: false,
          prompt: `${SYSTEM_INSTRUCTION}\n\n${userInstruction}`,
        }
      : {
          model,
          temperature: 0.3,
          max_tokens: 1400,
          stream: false,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: SYSTEM_INSTRUCTION,
            },
            {
              role: "user",
              content: userInstruction,
            },
          ],
        };

    const upstreamResponse = await fetch(resolvedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestPayload),
    });

    if (!upstreamResponse.ok) {
      const failureText = await upstreamResponse.text().catch(() => "");
      const hint =
        upstreamResponse.status === 404
          ? "Check NVIDIA_AI_ENDPOINT. It usually ends with /v1/chat/completions."
          : upstreamResponse.status === 401 || upstreamResponse.status === 403
            ? "Check NVIDIA_AI_API_KEY and model access permissions."
            : upstreamResponse.status === 429
              ? "Rate limit reached on model provider."
              : "";

      return NextResponse.json(
        {
          error: "NVIDIA model request failed",
          detail:
            failureText.slice(0, 600) ||
            `Upstream returned HTTP ${upstreamResponse.status}. ${hint}`.trim(),
          upstreamStatus: upstreamResponse.status,
          hint: hint || undefined,
        },
        {
          status:
            upstreamResponse.status >= 400 && upstreamResponse.status < 500
              ? upstreamResponse.status
              : 502,
        },
      );
    }

    const upstreamPayload = await upstreamResponse.json();
    const rawContent = extractModelContent(upstreamPayload);

    if (!rawContent) {
      throw new Error("Empty model response");
    }

    const parsed = parseAiJsonPayload(rawContent);
    const sanitized = sanitizeBlueprint(parsed, prompt);

    return NextResponse.json(sanitized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate AI template";

    return NextResponse.json(
      {
        error: "Failed to generate AI blueprint",
        detail: message,
      },
      { status: 500 },
    );
  }
}

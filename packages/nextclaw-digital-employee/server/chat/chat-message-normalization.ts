import { dbNow, formatTimestamp } from "../db/knex";

const DM_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function readString(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const value = Reflect.get(source, key);
  return typeof value === "string" ? value : undefined;
}

function toImageMarkdown(source: unknown): string | null {
  const rawImageUrl = Reflect.get(source as Record<string, unknown>, "image_url");
  const nestedUrl = typeof rawImageUrl === "string"
    ? rawImageUrl
    : readString(rawImageUrl, "url");
  const url = nestedUrl ?? readString(source, "url") ?? readString(source, "imageUrl");
  if (!url?.trim()) {
    return null;
  }
  const alt = (readString(source, "alt_text") ?? readString(source, "alt") ?? "image")
    .replace(/\[|\]/g, "")
    .trim() || "image";
  return `![${alt}](${url})`;
}

function normalizeChatMessagePart(part: unknown): string | null {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return null;
  }

  const partType = readString(part, "type");
  if (partType === "text" || partType === "input_text") {
    return readString(part, "text") ?? readString(part, "content") ?? null;
  }
  if (partType === "image_url" || partType === "input_image" || partType === "image") {
    return toImageMarkdown(part);
  }

  if (readString(part, "text") || readString(part, "content")) {
    return readString(part, "text") ?? readString(part, "content") ?? null;
  }
  if (readString(part, "image_url") || readString(Reflect.get(part, "image_url"), "url") || readString(part, "url")) {
    return toImageMarkdown(part);
  }
  return null;
}

export function normalizeChatMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => normalizeChatMessagePart(part))
      .filter((part): part is string => Boolean(part?.trim()))
      .join("\n\n")
      .trim();
  }
  return normalizeChatMessagePart(content)?.trim() ?? "";
}

export function normalizeChatMessageTimestamp(value?: string | null): string {
  if (!value?.trim()) {
    return dbNow();
  }
  const trimmed = value.trim();
  if (DM_TIMESTAMP_RE.test(trimmed)) {
    return trimmed;
  }
  const parsedMs = Date.parse(trimmed);
  if (Number.isFinite(parsedMs)) {
    return formatTimestamp(new Date(parsedMs));
  }
  throw new Error(`Unsupported chat message timestamp format: ${value}`);
}
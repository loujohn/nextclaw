import { type ClassValue, clsx } from "clsx";
import MarkdownIt from "markdown-it";
import { twMerge } from "tailwind-merge";

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(ts?: string): string {
  const date = ts ? new Date(ts) : new Date();
  const y = date.getFullYear();
  const mo = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${m}`;
}

export function renderMarkdown(raw: string): string {
  if (!raw?.trim()) {
    return "";
  }

  const normalized = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\n(?=[ \t]*\|)/g, "\n");

  return markdownRenderer.render(normalized).trim();
}

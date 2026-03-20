export function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = normalizeString(value);
    if (trimmed) {
      deduped.add(trimmed);
    }
  }
  return [...deduped];
}

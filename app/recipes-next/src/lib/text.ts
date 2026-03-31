export function formatListValue(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).join(", ");
      }
    } catch {
      return trimmed
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .join(", ");
    }
  }
  return String(value);
}

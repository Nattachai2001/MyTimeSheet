export function formatDetailItems(items: string[]): string {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
}

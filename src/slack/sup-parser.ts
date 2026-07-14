export interface ParsedSupResponse {
  yesterdayRaw: string;
  todayRaw: string;
  yesterdayItems: string[];
  todayItems: string[];
}

type SectionName = "yesterday" | "today";

export function parseSupResponse(input: string): ParsedSupResponse {
  const normalized = normalizeSlackText(input);
  const sections: Record<SectionName, string[]> = { yesterday: [], today: [] };
  let active: SectionName | undefined;

  for (const line of normalized.split("\n")) {
    const heading = sectionHeading(line);
    if (heading) {
      active = heading;
      const remainder = line.replace(/^\s*(yesterday|today)\s*:?\s*/i, "").trim();
      if (remainder) sections[active].push(remainder);
      continue;
    }

    if (active && line.trim()) sections[active].push(line.trim());
  }

  const yesterdayRaw = sections.yesterday.join("\n").trim();
  const todayRaw = sections.today.join("\n").trim();
  return {
    yesterdayRaw,
    todayRaw,
    yesterdayItems: normalizeItems(yesterdayRaw),
    todayItems: normalizeItems(todayRaw)
  };
}

export function normalizeSlackText(input: string): string {
  return input
    .replace(/\u200b/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/<([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function normalizeItems(input: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const rawLine of normalizeSlackText(input).split("\n")) {
    const line = rawLine
      .trim()
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (!line) continue;
    if (/^added by\b/i.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
  }

  return items;
}

function sectionHeading(line: string): SectionName | undefined {
  if (/^\s*yesterday\b\s*:?\s*/i.test(line)) return "yesterday";
  if (/^\s*today\b\s*:?\s*/i.test(line)) return "today";
  return undefined;
}

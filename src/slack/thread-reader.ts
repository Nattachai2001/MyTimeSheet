import { Page } from "playwright";

import { ParsedSupResponse, parseSupResponse } from "./sup-parser.js";

export interface SlackCollectionResult {
  parsed: ParsedSupResponse;
  threadUrl?: string;
  messageTimestamp?: string;
}

export async function readSupResponseFromCurrentPage(
  page: Page,
  displayName: string,
  reportDate?: string
): Promise<SlackCollectionResult> {
  const text = await readBestSlackText(page, displayName);

  const responseText = extractResponseText(text, displayName, reportDate);
  const parsed = parseSupResponse(responseText);
  if (!parsed.yesterdayRaw && !parsed.todayRaw) {
    throw new Error(`No Sup! response found for ${displayName}.`);
  }

  return {
    parsed,
    threadUrl: page.url()
  };
}

async function readBestSlackText(page: Page, displayName: string): Promise<string> {
  const selectors = [
    "[data-qa='threads_flexpane']",
    "[data-qa='thread_flexpane']",
    "[data-qa='thread_view']",
    "[data-qa='thread-pane']",
    "[aria-label='Thread']"
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    const text = await locator.innerText({ timeout: 2_000 }).catch(() => "");
    if (text.includes(displayName) && /yesterday|today/i.test(text)) return text;
  }

  return page.locator("body").innerText({ timeout: 30_000 });
}

export function extractResponseText(
  pageText: string,
  displayName: string,
  reportDate?: string
): string {
  return extractResponseTextForDate(pageText, displayName, reportDate);
}

export function extractResponseTextForDate(
  pageText: string,
  displayName: string,
  reportDate?: string
): string {
  const lines = pageText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = findResponseCandidateStarts(lines, displayName);
  const orderedCandidates = orderCandidatesByReportDate(lines, candidates, reportDate);

  for (const start of orderedCandidates) {
    const block = sliceResponseBlock(lines, start, displayName);
    if (block.some((line) => /^yesterday\b/i.test(line)) || block.some((line) => /^today\b/i.test(line))) {
      return block.join("\n");
    }
  }

  const startIndex = lines.findIndex((line) => line.includes(displayName));
  const start = startIndex >= 0 ? startIndex : 0;
  const relevant = lines.slice(start);

  const yesterdayIndex = relevant.findIndex((line) => /^yesterday\b/i.test(line));
  const todayIndex = relevant.findIndex((line) => /^today\b/i.test(line));
  if (yesterdayIndex < 0 && todayIndex < 0) return relevant.join("\n");

  const sectionStart = Math.min(
    ...[yesterdayIndex, todayIndex].filter((index) => index >= 0)
  );
  const sectionLines = relevant.slice(sectionStart);
  const nextUserIndex = sectionLines.findIndex(
    (line, index) => index > 0 && !/^[-*•\d.)\s]/.test(line) && /^[A-Z][\w .'-]{2,}$/.test(line)
  );

  return (nextUserIndex > 0 ? sectionLines.slice(0, nextUserIndex) : sectionLines).join("\n");
}

function orderCandidatesByReportDate(
  lines: string[],
  candidates: number[],
  reportDate?: string
): number[] {
  if (!reportDate) return candidates;

  const expected = weekdayName(reportDate);
  if (!expected) return candidates;

  const matching = candidates.filter((start) => {
    const nearby = lines.slice(Math.max(0, start - 8), start + 8).join("\n");
    return new RegExp(`\\b${expected}\\b`, "i").test(nearby);
  });

  if (matching.length) return matching;

  return candidates;
}

function findResponseCandidateStarts(lines: string[], displayName: string): number[] {
  const lowerDisplayName = displayName.toLowerCase();
  const starts: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].toLowerCase();
    if (line.includes(`${lowerDisplayName} posted an update for`)) {
      starts.push(index);
      continue;
    }

    if (line === lowerDisplayName || line.startsWith(`${lowerDisplayName} `)) {
      const nearby = lines.slice(index, index + 5).join("\n").toLowerCase();
      if (nearby.includes(`${lowerDisplayName} posted an update for`)) {
        starts.push(index);
      }
    }
  }

  return [...new Set(starts)];
}

function sliceResponseBlock(lines: string[], start: number, displayName: string): string[] {
  const block: string[] = [];
  const lowerDisplayName = displayName.toLowerCase();

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const lower = line.toLowerCase();
    const nearby = lines.slice(index, index + 5).join("\n").toLowerCase();
    const looksLikeMessageHeader = /^[A-Z][\w .'-]+\s+APP\b/.test(line);
    const looksLikeSplitMessageHeader =
      /^[A-Z][\w .'-]{1,60}$/.test(line) && /^APP.*\bat\b/i.test(lines[index + 1] ?? "");
    const isNextResponse =
      index > start &&
      ((lower.includes(" posted an update for ") &&
        !lower.includes(`${lowerDisplayName} posted an update for`)) ||
        ((looksLikeMessageHeader || looksLikeSplitMessageHeader) &&
          nearby.includes(" posted an update for ") &&
          !nearby.includes(`${lowerDisplayName} posted an update for`)));

    if (isNextResponse) break;
    block.push(line);
  }

  const firstSection = block.findIndex((line) => /^yesterday\b|^today\b/i.test(line));
  return firstSection >= 0 ? block.slice(firstSection) : block;
}

function weekdayName(date: string): string | undefined {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString("en-US", { weekday: "long" });
}

function displayDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

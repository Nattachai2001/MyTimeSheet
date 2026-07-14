import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { format, isValid, parse } from "date-fns";

import { normalizeItems, normalizeSlackText } from "../slack/sup-parser.js";
import { buildRecordChecksum, DailyRecordRepository, SaveResult } from "../storage/daily-record-repository.js";
import { SupDailyRecord } from "../storage/schemas.js";
import { normalizeHeader } from "../timesheet/template-mapper.js";

export interface SupExportImportOptions {
  filePath: string;
  rootDirectory: string;
  displayName: string;
  workspaceUrl: string;
  channelUrl: string;
}

export interface SupExportImportResult {
  imported: number;
  skipped: number;
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  dates: string[];
  followupName?: string;
  exportUserName?: string;
  months: string[];
}

export interface ParsedSupExportRow {
  reportDate: string;
  yesterdayRaw: string;
  todayRaw: string;
  capturedAt?: string;
}

export interface ParsedSupExportSheet {
  followupName?: string;
  exportUserName?: string;
  rows: ParsedSupExportRow[];
}

const DATE_PATTERNS = ["MMM d, yyyy", "MMMM d, yyyy", "d/M/yyyy", "M/d/yyyy", "yyyy-MM-dd"] as const;
const SUBMISSION_PATTERNS = ["MMM d, yyyy HH:mm xxx", "MMM d, yyyy H:mm xxx"] as const;

const require = createRequire(import.meta.url);
// Resolve via exceljs so pnpm nested deps are found from dist/ as well.
const requireFromExcelJs = createRequire(require.resolve("exceljs"));
// Prefer JSZip (already pulled in by exceljs) to avoid ExcelJS stream SAX bugs in Electron.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = requireFromExcelJs("jszip") as {
  loadAsync: (data: Buffer) => Promise<{
    file: (name: string) => { async: (type: "string") => Promise<string> } | null;
    files: Record<string, { name: string; dir: boolean; async: (type: "string") => Promise<string> }>;
  }>;
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function textFromCellValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && isValid(value)) return format(value, "MMM d, yyyy");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return decodeHtmlEntities(String(value)).trim();
  }
  return decodeHtmlEntities(String(value)).trim();
}

export function parseSupExportDate(value: unknown): string | undefined {
  if (value instanceof Date && isValid(value)) return format(value, "yyyy-MM-dd");
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 86_400_000);
    if (isValid(parsed)) return format(parsed, "yyyy-MM-dd");
  }

  const text = textFromCellValue(value);
  if (!text) return undefined;

  for (const pattern of DATE_PATTERNS) {
    const parsed = parse(text, pattern, new Date());
    if (isValid(parsed)) return format(parsed, "yyyy-MM-dd");
  }

  return undefined;
}

export function parseSupExportDateTime(value: unknown): string | undefined {
  if (value instanceof Date && isValid(value)) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 86_400_000);
    if (isValid(parsed)) return parsed.toISOString();
  }

  const text = textFromCellValue(value);
  if (!text) return undefined;

  const normalized = text.replace(/\+(\d{2})(\d{2})$/, "+$1:$2");
  for (const pattern of SUBMISSION_PATTERNS) {
    const parsed = parse(normalized, pattern, new Date());
    if (isValid(parsed)) return parsed.toISOString();
  }

  const dateOnly = parseSupExportDate(text);
  return dateOnly ? `${dateOnly}T00:00:00.000Z` : undefined;
}

function colLettersToIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function decodeXmlEntities(text: string): string {
  return decodeHtmlEntities(
    text
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
  );
}

function parseSharedStrings(xml: string): string[] {
  const values: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml))) {
    const parts = [...match[1].matchAll(/<t([^>]*)>([\s\S]*?)<\/t>/g)].map((part) => decodeXmlEntities(part[2]));
    values.push(parts.join(""));
  }
  return values;
}

function parseSheetMatrix(sheetXml: string, sharedStrings: string[]): unknown[][] {
  const rows: unknown[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const rowXml = rowMatch[1];
    const cells: unknown[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowXml))) {
      const attrs = cellMatch[1] ?? cellMatch[3] ?? "";
      const body = cellMatch[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)(\d+)"/i);
      if (!ref) continue;
      const col = colLettersToIndex(ref[1]);
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = body.match(/<is>([\s\S]*?)<\/is>/)?.[1];

      let value: unknown = "";
      if (inline) {
        value = [...inline.matchAll(/<t([^>]*)>([\s\S]*?)<\/t>/g)].map((part) => decodeXmlEntities(part[2])).join("");
      } else if (raw != null) {
        if (type === "s") value = sharedStrings[Number(raw)] ?? "";
        else if (type === "b") value = raw === "1";
        else if (type === "str" || type === "inlineStr") value = decodeXmlEntities(raw);
        else {
          const asNumber = Number(raw);
          value = Number.isFinite(asNumber) ? asNumber : decodeXmlEntities(raw);
        }
      }

      while (cells.length <= col) cells.push("");
      cells[col] = value;
    }

    rows.push(cells);
  }

  return rows;
}

async function readSupExportMatrix(filePath: string): Promise<unknown[][]> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const sheetEntry =
    zip.file("xl/worksheets/sheet1.xml") ??
    Object.values(zip.files).find((entry) => /xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name) && !entry.dir) ??
    null;
  if (!sheetEntry) {
    throw new Error("Sup! export workbook has no worksheets.");
  }

  const sharedStringsXml = zip.file("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? parseSharedStrings(await sharedStringsXml.async("string")) : [];
  return parseSheetMatrix(await sheetEntry.async("string"), sharedStrings);
}

export function parseSupExportMatrix(matrix: unknown[][]): ParsedSupExportSheet {
  let followupName: string | undefined;
  let exportUserName: string | undefined;
  let headerRow: number | undefined;
  const columns: Partial<Record<"date" | "submission" | "yesterday" | "today", number>> = {};

  matrix.forEach((row, rowIndex) => {
    const first = normalizeHeader(textFromCellValue(row[0]));
    const second = textFromCellValue(row[1]);
    if (first === "followup name" && second) followupName = second;
    if (first === "user name" && second) exportUserName = second;

    if (headerRow != null) return;
    const detected: Partial<Record<"date" | "submission" | "yesterday" | "today", number>> = {};
    row.forEach((cell, colIndex) => {
      const text = normalizeHeader(textFromCellValue(cell));
      if (text === "date") detected.date = colIndex;
      if (text.includes("submission")) detected.submission = colIndex;
      if (text === "yesterday") detected.yesterday = colIndex;
      if (text === "today") detected.today = colIndex;
    });
    if (detected.date != null && detected.yesterday != null && detected.today != null) {
      headerRow = rowIndex;
      Object.assign(columns, detected);
    }
  });

  if (headerRow == null || columns.date == null || columns.yesterday == null || columns.today == null) {
    throw new Error("Could not find Date, Yesterday, and Today columns in the Sup! export.");
  }

  const rows: ParsedSupExportRow[] = [];
  for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const reportDate = parseSupExportDate(row[columns.date]);
    if (!reportDate) continue;

    const yesterdayRaw = decodeHtmlEntities(textFromCellValue(row[columns.yesterday])).trim();
    const todayRaw = decodeHtmlEntities(textFromCellValue(row[columns.today])).trim();
    if (!yesterdayRaw && !todayRaw) continue;

    const capturedAt =
      columns.submission != null ? parseSupExportDateTime(row[columns.submission]) : undefined;

    rows.push({ reportDate, yesterdayRaw, todayRaw, capturedAt });
  }

  return { followupName, exportUserName, rows };
}

export async function importSupExportFile(options: SupExportImportOptions): Promise<SupExportImportResult> {
  if (!options.rootDirectory?.trim()) {
    throw new Error("Data folder is not configured. Finish Settings setup first.");
  }
  if (!options.displayName?.trim()) {
    throw new Error("Display name is empty. Set it in Settings before importing.");
  }

  const matrix = await readSupExportMatrix(options.filePath);
  const parsed = parseSupExportMatrix(matrix);
  const repository = new DailyRecordRepository(options.rootDirectory);
  const result: SupExportImportResult = {
    imported: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    conflicts: 0,
    dates: [],
    months: [],
    followupName: parsed.followupName,
    exportUserName: parsed.exportUserName
  };

  const months = new Set<string>();
  for (const row of parsed.rows) {
    const normalizedYesterday = normalizeSlackText(row.yesterdayRaw);
    const normalizedToday = normalizeSlackText(row.todayRaw);
    if (!normalizedYesterday && !normalizedToday) {
      result.skipped += 1;
      continue;
    }

    const now = new Date().toISOString();
    const withoutChecksum: Omit<SupDailyRecord, "checksum"> = {
      schemaVersion: 1,
      reportDate: row.reportDate,
      timezone: "Asia/Bangkok",
      user: { displayName: options.displayName },
      source: {
        workspaceUrl: options.workspaceUrl,
        channelUrl: options.channelUrl,
        threadUrl: "manual-entry://sup-export"
      },
      content: {
        yesterdayRaw: normalizedYesterday,
        todayRaw: normalizedToday,
        yesterdayItems: normalizeItems(normalizedYesterday),
        todayItems: normalizeItems(normalizedToday)
      },
      capturedAt: row.capturedAt ?? now,
      updatedAt: now
    };
    const record: SupDailyRecord = {
      ...withoutChecksum,
      checksum: buildRecordChecksum(withoutChecksum)
    };

    const saveResult = await repository.save(record);
    result.imported += 1;
    result.dates.push(row.reportDate);
    months.add(row.reportDate.slice(0, 7));
    incrementSaveResult(result, saveResult);
  }

  result.months = [...months].sort();
  result.dates.sort();
  return result;
}

function incrementSaveResult(result: SupExportImportResult, saveResult: SaveResult): void {
  if (saveResult === "created") result.created += 1;
  else if (saveResult === "updated") result.updated += 1;
  else if (saveResult === "unchanged") result.unchanged += 1;
  else if (saveResult === "conflict") result.conflicts += 1;
}

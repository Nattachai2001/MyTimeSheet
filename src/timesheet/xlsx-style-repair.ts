import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA_COLUMNS = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);

export interface RepairTimesheetStylesOptions {
  holidayReferenceRow: number;
  workReferenceRow?: number;
  prestyledHolidayRows: ReadonlySet<number>;
  convertedHolidayRows: ReadonlySet<number>;
  firstDataRow: number;
  lastDataRow: number;
  detailColumnNumber?: number;
  worksheetPath?: string;
  overtimeWorksheetPath?: string;
}

const DEFAULT_OVERTIME_WORKSHEET_PATH = "xl/worksheets/sheet2.xml";

export function repairTimesheetStylesFromTemplate(
  templatePath: string,
  outputPath: string,
  options: RepairTimesheetStylesOptions
): void {
  const tempRoot = mkdtempSync(join(tmpdir(), "timesheet-style-repair-"));
  const templateDir = join(tempRoot, "template");

  try {
    extractArchive(templatePath, templateDir);

    const worksheetPath = options.worksheetPath ?? "xl/worksheets/sheet1.xml";
    const overtimeWorksheetPath = options.overtimeWorksheetPath ?? DEFAULT_OVERTIME_WORKSHEET_PATH;
    const templateSheet = readFileSync(join(templateDir, worksheetPath), "utf8");
    const templateOvertimeSheet = tryReadTemplateSheet(templateDir, overtimeWorksheetPath);
    const detailColumn = columnNumberToLetter(options.detailColumnNumber ?? 8);
    const templateSheets = templateOvertimeSheet ? [templateSheet, templateOvertimeSheet] : [templateSheet];
    const templateStyles = patchTemplateStyles(
      readFileSync(join(templateDir, "xl/styles.xml"), "utf8"),
      templateSheets,
      detailColumn,
      options.firstDataRow
    );

    const outputSheetEntry = readZipEntry(outputPath, worksheetPath);
    let outputSheet = outputSheetEntry.toString("utf8");
    outputSheet = syncSheetStylesFromTemplate(templateSheet, outputSheet, options);

    const zipEntries: Array<{ path: string; data: Buffer }> = [
      { path: "xl/styles.xml", data: Buffer.from(templateStyles, "utf8") },
      { path: worksheetPath, data: Buffer.from(outputSheet, "utf8") }
    ];

    if (templateOvertimeSheet) {
      const outputOvertimeSheet = tryReadZipEntry(outputPath, overtimeWorksheetPath);
      if (outputOvertimeSheet) {
        let overtimeSheet = outputOvertimeSheet.toString("utf8");
        overtimeSheet = syncSheetStylesSimple(templateOvertimeSheet, overtimeSheet);
        zipEntries.push({ path: overtimeWorksheetPath, data: Buffer.from(overtimeSheet, "utf8") });
      }
    }

    writeZipEntries(outputPath, zipEntries);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function tryReadTemplateSheet(templateDir: string, worksheetPath: string): string | undefined {
  try {
    return readFileSync(join(templateDir, worksheetPath), "utf8");
  } catch {
    return undefined;
  }
}

function tryReadZipEntry(archivePath: string, entryPath: string): Buffer | undefined {
  try {
    return readZipEntry(archivePath, entryPath);
  } catch {
    return undefined;
  }
}

function syncSheetStylesFromTemplate(
  templateSheet: string,
  outputSheet: string,
  options: RepairTimesheetStylesOptions
): string {
  const templateStylesByRef = readAllCellStyleIndices(templateSheet);
  const outputRefs = readAllCellRefs(outputSheet);
  let updated = outputSheet;

  for (const ref of outputRefs) {
    const parsed = parseCellRef(ref);
    if (!parsed) continue;

    const styleSourceRef = resolveStyleSourceRef(parsed, options);
    const styleIndex = templateStylesByRef.get(styleSourceRef);
    if (styleIndex == null) continue;

    updated = setCellStyleIndex(updated, ref, styleIndex);
  }

  return updated;
}

function syncSheetStylesSimple(templateSheet: string, outputSheet: string): string {
  const templateStylesByRef = readAllCellStyleIndices(templateSheet);
  const outputRefs = readAllCellRefs(outputSheet);
  let updated = outputSheet;

  for (const ref of outputRefs) {
    const styleIndex = templateStylesByRef.get(ref);
    if (styleIndex == null) continue;
    updated = setCellStyleIndex(updated, ref, styleIndex);
  }

  return updated;
}

function resolveStyleSourceRef(
  parsed: { column: string; row: number },
  options: RepairTimesheetStylesOptions
): string {
  const { column, row } = parsed;
  if (
    row >= options.firstDataRow &&
    row <= options.lastDataRow &&
    DATA_COLUMNS.has(column)
  ) {
    if (options.convertedHolidayRows.has(row) || options.prestyledHolidayRows.has(row)) {
      return `${column}${options.holidayReferenceRow}`;
    }
    if (options.workReferenceRow != null) {
      return `${column}${options.workReferenceRow}`;
    }
  }
  return `${column}${row}`;
}

function parseCellRef(ref: string): { column: string; row: number } | undefined {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) return undefined;
  return { column: match[1], row: Number(match[2]) };
}

function readAllCellRefs(sheetXml: string): string[] {
  const refs: string[] = [];
  const cellRe = /<c\s+([^>]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(sheetXml)) !== null) {
    const ref = match[1].match(/\br="([A-Z]+\d+)"/)?.[1];
    if (ref) refs.push(ref);
  }
  return refs;
}

function readAllCellStyleIndices(sheetXml: string): Map<string, string> {
  const styles = new Map<string, string>();
  const cellRe = /<c\s+([^>]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(sheetXml)) !== null) {
    const attrs = match[1];
    const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
    const styleIndex = attrs.match(/\bs="(\d+)"/)?.[1];
    if (ref && styleIndex) styles.set(ref, styleIndex);
  }
  return styles;
}

function setCellStyleIndex(sheetXml: string, ref: string, styleIndex: string): string {
  const withoutStyle = (attrs: string) => attrs.replace(/\s*s="[^"]*"/, "").replace(/\s+/g, " ").trim();

  const selfClosingPattern = new RegExp(`<c\\s+([^>]*\\br="${ref}"[^>]*)/>`, "g");
  let updated = sheetXml.replace(selfClosingPattern, (_match, attrs: string) => {
    return `<c ${withoutStyle(attrs)} s="${styleIndex}"/>`;
  });

  const openTagPattern = new RegExp(`<c\\s+([^>]*\\br="${ref}"[^>]*)>`, "g");
  updated = updated.replace(openTagPattern, (match, attrs: string) => {
    if (/\/\s*$/.test(attrs)) return match;
    return `<c ${withoutStyle(attrs)} s="${styleIndex}">`;
  });

  return updated;
}

function extractArchive(archivePath: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  execFileSync("tar", ["-xf", archivePath, "-C", targetDir], { stdio: "pipe" });
}

function readZipEntry(archivePath: string, entryPath: string): Buffer {
  const normalized = entryPath.replace(/\\/g, "/");
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${escapePs(archivePath)}')
try {
  $entry = $zip.GetEntry('${normalized}')
  if ($null -eq $entry) { throw "Missing zip entry: ${normalized}" }
  $stream = $entry.Open()
  try {
    $buffer = New-Object byte[] $entry.Length
    [void]$stream.Read($buffer, 0, $entry.Length)
    [Console]::OpenStandardOutput().Write($buffer, 0, $entry.Length)
  } finally {
    $stream.Dispose()
  }
} finally {
  $zip.Dispose()
}
`;
  return execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024
  });
}

function writeZipEntries(
  archivePath: string,
  entries: Array<{ path: string; data: Buffer }>
): void {
  const payloadPath = join(tmpdir(), `zip-patch-${process.pid}.json`);
  writeFileSync(payloadPath, JSON.stringify(entries.map((entry) => ({
    path: entry.path.replace(/\\/g, "/"),
    data: entry.data.toString("base64")
  }))));

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$entries = Get-Content -Raw '${escapePs(payloadPath)}' | ConvertFrom-Json
$zip = [System.IO.Compression.ZipFile]::Open('${escapePs(archivePath)}', [System.IO.Compression.ZipArchiveMode]::Update)
try {
  foreach ($entry in $entries) {
    $existing = $zip.GetEntry($entry.path)
    if ($existing) { $existing.Delete() }
    $newEntry = $zip.CreateEntry($entry.path, [System.IO.Compression.CompressionLevel]::Optimal)
    $bytes = [Convert]::FromBase64String($entry.data)
    $stream = $newEntry.Open()
    try {
      $stream.Write($bytes, 0, $bytes.Length)
    } finally {
      $stream.Dispose()
    }
  }
} finally {
  $zip.Dispose()
}
`;
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      stdio: "pipe"
    });
  } finally {
    rmSync(payloadPath, { force: true });
  }
}

function escapePs(value: string): string {
  return value.replace(/'/g, "''");
}

export function columnNumberToLetter(columnNumber: number): string {
  let letter = "";
  let column = columnNumber;
  while (column > 0) {
    const remainder = (column - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    column = Math.floor((column - 1) / 26);
  }
  return letter;
}

function collectExclusiveColumnStyleIndices(sheetXml: string, columnLetter: string): Set<string> {
  const columnsByStyle = new Map<string, Set<string>>();
  const cellRe = /<c\s+([^>]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(sheetXml)) !== null) {
    const attrs = match[1];
    const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
    const styleIndex = attrs.match(/\bs="(\d+)"/)?.[1];
    if (!ref || !styleIndex) continue;
    const column = ref.replace(/\d+$/, "");
    const columns = columnsByStyle.get(styleIndex) ?? new Set<string>();
    columns.add(column);
    columnsByStyle.set(styleIndex, columns);
  }

  const exclusive = new Set<string>();
  for (const [styleIndex, columns] of columnsByStyle.entries()) {
    if (columns.size === 1 && columns.has(columnLetter)) {
      exclusive.add(styleIndex);
    }
  }
  return exclusive;
}

function collectColumnStyleIndicesFromRow(
  sheetXml: string,
  columnLetter: string,
  minRow: number
): Set<string> {
  const indices = new Set<string>();
  const cellRe = /<c\s+([^>]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(sheetXml)) !== null) {
    const attrs = match[1];
    const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
    if (!ref?.startsWith(columnLetter)) continue;
    const row = Number(ref.slice(columnLetter.length));
    if (row < minRow) continue;
    const styleIndex = attrs.match(/\bs="(\d+)"/)?.[1];
    if (styleIndex) indices.add(styleIndex);
  }
  return indices;
}

function extractXfElement(xml: string, start: number): string {
  const openEnd = xml.indexOf(">", start);
  if (openEnd === -1) throw new Error("Malformed xf element");
  if (xml[openEnd - 1] === "/") {
    return xml.slice(start, openEnd + 1);
  }

  const close = xml.indexOf("</xf>", openEnd + 1);
  if (close === -1) throw new Error("Unterminated xf element");
  return xml.slice(start, close + 5);
}

function mapXfElements(cellXfsBody: string, mapper: (xfXml: string, index: number) => string): string {
  let result = "";
  let position = 0;
  let xfIndex = 0;

  while (position < cellXfsBody.length) {
    const start = cellXfsBody.indexOf("<xf", position);
    if (start === -1) {
      result += cellXfsBody.slice(position);
      break;
    }

    result += cellXfsBody.slice(position, start);
    const element = extractXfElement(cellXfsBody, start);
    result += mapper(element, xfIndex);
    xfIndex += 1;
    position = start + element.length;
  }

  return result;
}

function mergeAlignmentElement(
  existingAttrs: string,
  patch: { horizontal?: string; vertical?: string; wrapText?: string }
): string {
  let attrs = existingAttrs;
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) continue;
    attrs = attrs.replace(new RegExp(`\\s*${key}="[^"]*"`, "g"), "");
    attrs += ` ${key}="${value}"`;
  }
  return `<alignment ${attrs.trim()}/>`.replace("<alignment >", "<alignment ");
}

function setXfAlignment(
  xfXml: string,
  patch: { horizontal?: string; vertical?: string; wrapText?: string }
): string {
  if (xfXml.includes("<alignment")) {
    return xfXml.replace(/<alignment\b[^>]*(?:\/>|>[\s\S]*?<\/alignment>)/, (match) => {
      const existingAttrs = match.match(/<alignment\b([^>]*)\/>/)?.[1] ?? "";
      return mergeAlignmentElement(existingAttrs, patch);
    });
  }

  const alignment = mergeAlignmentElement("", patch);
  if (/\/>$/.test(xfXml.trim())) {
    return xfXml.replace(/\/>$/, `>${alignment}</xf>`);
  }
  return xfXml.replace(/(<xf\b[^>]*>)/, `$1${alignment}`);
}

function setDetailWrapAlignment(xfXml: string): string {
  return setXfAlignment(xfXml, { vertical: "top", wrapText: "1" });
}

function patchXfAlignments(
  stylesXml: string,
  styleIndices: ReadonlySet<string>,
  patch: { horizontal?: string; vertical?: string; wrapText?: string }
): string {
  const cellXfsMatch = stylesXml.match(/<cellXfs([^>]*)>([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsMatch) return stylesXml;

  const [fullMatch, cellXfsAttrs, cellXfsBody] = cellXfsMatch;
  const patchedBody = mapXfElements(cellXfsBody, (xfXml, xfIndex) => {
    if (!styleIndices.has(String(xfIndex))) return xfXml;
    return setXfAlignment(xfXml, patch);
  });

  return stylesXml.replace(fullMatch, `<cellXfs${cellXfsAttrs}>${patchedBody}</cellXfs>`);
}

export function patchDetailWrapText(
  stylesXml: string,
  templateSheet: string,
  detailColumn: string
): string {
  return patchDetailWrapTextIndices(
    stylesXml,
    collectExclusiveColumnStyleIndices(templateSheet, detailColumn)
  );
}

function patchDetailWrapTextIndices(stylesXml: string, styleIndices: ReadonlySet<string>): string {
  const cellXfsMatch = stylesXml.match(/<cellXfs([^>]*)>([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsMatch) return stylesXml;

  const [fullMatch, cellXfsAttrs, cellXfsBody] = cellXfsMatch;
  const patchedBody = mapXfElements(cellXfsBody, (xfXml, xfIndex) => {
    if (!styleIndices.has(String(xfIndex))) return xfXml;
    return setDetailWrapAlignment(xfXml);
  });

  return stylesXml.replace(fullMatch, `<cellXfs${cellXfsAttrs}>${patchedBody}</cellXfs>`);
}

export function patchTimeColumnCenter(
  stylesXml: string,
  templateSheets: string[],
  firstDataRow: number
): string {
  const styleIndices = new Set<string>();

  for (const templateSheet of templateSheets) {
    const timeInStyles = collectColumnStyleIndicesFromRow(templateSheet, "D", firstDataRow);
    const timeOutStyles = collectColumnStyleIndicesFromRow(templateSheet, "E", firstDataRow);
    const exclusiveTimeIn = collectExclusiveColumnStyleIndices(templateSheet, "D");
    const exclusiveTimeOut = collectExclusiveColumnStyleIndices(templateSheet, "E");

    for (const styleIndex of timeInStyles) {
      if (exclusiveTimeIn.has(styleIndex)) styleIndices.add(styleIndex);
    }
    for (const styleIndex of timeOutStyles) {
      if (exclusiveTimeOut.has(styleIndex)) styleIndices.add(styleIndex);
    }
  }

  return patchXfAlignments(stylesXml, styleIndices, {
    horizontal: "center",
    vertical: "center"
  });
}

export function patchTemplateStyles(
  stylesXml: string,
  templateSheets: string[],
  detailColumn: string,
  firstDataRow: number
): string {
  const detailStyleIndices = new Set<string>();
  for (const templateSheet of templateSheets) {
    for (const styleIndex of collectExclusiveColumnStyleIndices(templateSheet, detailColumn)) {
      detailStyleIndices.add(styleIndex);
    }
  }

  let patched = patchDetailWrapTextIndices(stylesXml, detailStyleIndices);
  patched = patchTimeColumnCenter(patched, templateSheets, firstDataRow);
  return patched;
}

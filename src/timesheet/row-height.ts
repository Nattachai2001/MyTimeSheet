import ExcelJS from "exceljs";

const DEFAULT_COLUMN_WIDTH_CHARS = 30;
const MIN_ROW_HEIGHT = 15;
const MAX_ROW_HEIGHT = 409;
const POINTS_PER_LINE = 15;

export function resolveColumnWidthChars(worksheet: ExcelJS.Worksheet, columnNumber: number): number {
  const width = worksheet.getColumn(columnNumber).width;
  if (typeof width === "number" && width > 0) {
    return Math.max(1, Math.floor(width));
  }
  return DEFAULT_COLUMN_WIDTH_CHARS;
}

export function estimateWrappedLineCount(text: string, charsPerLine: number): number {
  if (!text) return 1;

  return text.split(/\r?\n/).reduce((total, segment) => {
    const length = segment.length;
    return total + Math.max(1, Math.ceil(length / charsPerLine));
  }, 0);
}

export function rowHeightForWrappedText(text: string, charsPerLine: number): number {
  const lines = estimateWrappedLineCount(text, charsPerLine);
  const height = lines * POINTS_PER_LINE;
  return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, height));
}

export function applyDetailRowHeight(
  worksheet: ExcelJS.Worksheet,
  row: ExcelJS.Row,
  detailColumn: number,
  text: string
): void {
  const charsPerLine = resolveColumnWidthChars(worksheet, detailColumn);
  const height = rowHeightForWrappedText(text, charsPerLine);
  if (!row.height || height > row.height) {
    row.height = height;
  }
}

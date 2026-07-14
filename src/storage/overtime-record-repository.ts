import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { OvertimeEntry, OvertimeEntryInput, OvertimeEntrySchema, OvertimeMonthRecordSchema } from "../timesheet/overtime-types.js";

function sortEntries(entries: OvertimeEntry[]): OvertimeEntry[] {
  return [...entries].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) return dateCompare;
    return (left.timeIn ?? "").localeCompare(right.timeIn ?? "");
  });
}

export class OvertimeRecordRepository {
  constructor(private readonly rootDirectory: string) {}

  filePathFor(month: string): string {
    const [year, monthText] = month.split("-");
    return path.join(this.rootDirectory, "overtime", year, monthText, "overtime.json");
  }

  async readMonth(month: string): Promise<OvertimeEntry[]> {
    const filePath = this.filePathFor(month);
    if (!existsSync(filePath)) return [];

    const raw = JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
    const record = OvertimeMonthRecordSchema.parse(raw);
    if (record.month !== month) {
      throw new Error(`Overtime file month mismatch: expected ${month}, found ${record.month}`);
    }
    return sortEntries(record.entries.map((entry) => OvertimeEntrySchema.parse(entry)));
  }

  async readEntriesForDate(date: string): Promise<OvertimeEntry[]> {
    const month = date.slice(0, 7);
    return (await this.readMonth(month)).filter((entry) => entry.date === date);
  }

  async readEntry(date: string): Promise<OvertimeEntry | undefined> {
    return (await this.readEntriesForDate(date))[0];
  }

  async saveEntry(entry: OvertimeEntryInput): Promise<OvertimeEntry> {
    const month = entry.date.slice(0, 7);
    const entries = await this.readMonth(month);
    const normalized = OvertimeEntrySchema.parse(entry);
    const next = entries.filter((candidate) => candidate.id !== normalized.id);
    next.push(normalized);

    const filePath = this.filePathFor(month);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ schemaVersion: 1, month, entries: sortEntries(next) }, null, 2)}\n`,
      "utf8"
    );
    return normalized;
  }

  async removeEntryById(id: string, month: string): Promise<boolean> {
    const entries = await this.readMonth(month);
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) return false;

    const filePath = this.filePathFor(month);
    if (!next.length) {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
      return true;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ schemaVersion: 1, month, entries: next }, null, 2)}\n`,
      "utf8"
    );
    return true;
  }

  async removeEntriesForDate(date: string): Promise<boolean> {
    const month = date.slice(0, 7);
    const entries = await this.readMonth(month);
    const next = entries.filter((entry) => entry.date !== date);
    if (next.length === entries.length) return false;

    const filePath = this.filePathFor(month);
    if (!next.length) {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
      return true;
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ schemaVersion: 1, month, entries: next }, null, 2)}\n`,
      "utf8"
    );
    return true;
  }

  async removeEntry(dateOrId: string, month?: string): Promise<boolean> {
    if (month) {
      return this.removeEntryById(dateOrId, month);
    }
    return this.removeEntriesForDate(dateOrId);
  }
}

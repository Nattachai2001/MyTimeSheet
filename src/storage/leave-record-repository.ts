import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { LeaveEntry, LeaveMonthRecordSchema, normalizeLeaveEntry } from "../timesheet/leave-types.js";

export class LeaveRecordRepository {
  constructor(private readonly rootDirectory: string) {}

  filePathFor(month: string): string {
    const [year, monthText] = month.split("-");
    return path.join(this.rootDirectory, "leave", year, monthText, "leave.json");
  }

  async readMonth(month: string): Promise<LeaveEntry[]> {
    const filePath = this.filePathFor(month);
    if (!existsSync(filePath)) return [];

    const raw = JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
    const record = LeaveMonthRecordSchema.parse(raw);
    if (record.month !== month) {
      throw new Error(`Leave file month mismatch: expected ${month}, found ${record.month}`);
    }
    return record.entries.map(normalizeLeaveEntry);
  }

  async readEntry(date: string): Promise<LeaveEntry | undefined> {
    const month = date.slice(0, 7);
    return (await this.readMonth(month)).find((entry) => entry.date === date);
  }

  async saveEntry(entry: LeaveEntry): Promise<LeaveEntry> {
    const month = entry.date.slice(0, 7);
    const entries = await this.readMonth(month);
    const normalized = normalizeLeaveEntry(entry);
    const next = entries.filter((candidate) => candidate.date !== entry.date);
    next.push(normalized);
    next.sort((a, b) => a.date.localeCompare(b.date));

    const filePath = this.filePathFor(month);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ schemaVersion: 1, month, entries: next }, null, 2)}\n`,
      "utf8"
    );
    return normalized;
  }

  async removeEntry(date: string): Promise<boolean> {
    const month = date.slice(0, 7);
    const entries = await this.readMonth(month);
    const next = entries.filter((entry) => entry.date !== date);
    if (next.length === entries.length) return false;

    const filePath = this.filePathFor(month);
    if (!next.length) {
      if (existsSync(filePath)) {
        await import("node:fs/promises").then(({ unlink }) => unlink(filePath));
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
}

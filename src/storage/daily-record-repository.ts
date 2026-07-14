import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { sha256 } from "../shared/crypto.js";
import { readJsonFile, writeJsonAtomic } from "../shared/files.js";
import { SupDailyRecord, SupDailyRecordSchema } from "./schemas.js";

export type SaveResult = "created" | "updated" | "unchanged" | "conflict";

export class DailyRecordRepository {
  constructor(private readonly rootDirectory: string) {}

  inboxPathFor(reportDate: string, displayName: string): string {
    const [year, month] = reportDate.split("-");
    return path.join(this.rootDirectory, "inbox", year, month, `${reportDate}-${slugify(displayName)}.json`);
  }

  async save(record: SupDailyRecord): Promise<SaveResult> {
    const parsed = SupDailyRecordSchema.parse(record);
    const filePath = this.inboxPathFor(parsed.reportDate, parsed.user.displayName);

    if (!existsSync(filePath)) {
      await writeJsonAtomic(filePath, parsed);
      return "created";
    }

    const existing = SupDailyRecordSchema.parse(await readJsonFile<SupDailyRecord>(filePath));
    if (existing.checksum === parsed.checksum) return "unchanged";

    if (existing.updatedAt <= parsed.updatedAt) {
      await writeJsonAtomic(filePath, parsed);
      return "updated";
    }

    const conflictDir = path.join(path.dirname(filePath), "conflicts");
    await mkdir(conflictDir, { recursive: true });
    await writeJsonAtomic(
      path.join(conflictDir, `${parsed.reportDate}-${slugify(parsed.user.displayName)}-${Date.now()}.json`),
      parsed
    );
    return "conflict";
  }

  async readMonth(yearMonth: string): Promise<SupDailyRecord[]> {
    const [year, month] = yearMonth.split("-");
    const dir = path.join(this.rootDirectory, "inbox", year, month);
    if (!existsSync(dir)) return [];

    const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
    const records: SupDailyRecord[] = [];
    for (const file of files) {
      const raw = JSON.parse(await readFile(path.join(dir, file), "utf8"));
      records.push(SupDailyRecordSchema.parse(raw));
    }
    return records.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  }
}

export function buildRecordChecksum(record: Omit<SupDailyRecord, "checksum">): string {
  return sha256({
    reportDate: record.reportDate,
    user: record.user,
    source: record.source,
    content: record.content
  });
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

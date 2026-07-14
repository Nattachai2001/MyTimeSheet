import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { OvertimeRecordRepository } from "../src/storage/overtime-record-repository.js";

describe("OvertimeRecordRepository", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("saves, reads, and removes overtime entries by month", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "overtime-repo-"));
    const repository = new OvertimeRecordRepository(tempDir);

    const saved = await repository.saveEntry({
      date: "2026-07-09",
      timeIn: "18:00",
      timeOut: "20:00",
      includedLunchTime: "NO",
      detail: "[Testing]\nRegression overtime"
    });

    expect(saved.detail).toBe("[Testing]\nRegression overtime");
    expect(await repository.readEntry("2026-07-09")).toEqual(saved);
    expect(await repository.readMonth("2026-07")).toEqual([saved]);

    const filePath = repository.filePathFor("2026-07");
    const raw = JSON.parse(await readFile(filePath, "utf8"));
    expect(raw.entries).toHaveLength(1);

    await repository.saveEntry({
      date: "2026-07-10",
      detail: "Release support"
    });
    expect((await repository.readMonth("2026-07")).map((entry) => entry.date)).toEqual([
      "2026-07-09",
      "2026-07-10"
    ]);

    expect(await repository.removeEntry("2026-07-09")).toBe(true);
    expect(await repository.readEntry("2026-07-09")).toBeUndefined();
    expect((await repository.readMonth("2026-07")).map((entry) => entry.date)).toEqual(["2026-07-10"]);

    expect(await repository.removeEntry("2026-07-10")).toBe(true);
    expect(await repository.readMonth("2026-07")).toEqual([]);
  });
});

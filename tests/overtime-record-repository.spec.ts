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

    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(saved.detail).toBe("[Testing]\nRegression overtime");
    expect(await repository.readEntriesForDate("2026-07-09")).toEqual([saved]);
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

    expect(await repository.removeEntriesForDate("2026-07-09")).toBe(true);
    expect(await repository.readEntriesForDate("2026-07-09")).toEqual([]);
    expect((await repository.readMonth("2026-07")).map((entry) => entry.date)).toEqual(["2026-07-10"]);

    expect(await repository.removeEntriesForDate("2026-07-10")).toBe(true);
    expect(await repository.readMonth("2026-07")).toEqual([]);
  });

  it("supports multiple overtime slots on the same day", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "overtime-repo-"));
    const repository = new OvertimeRecordRepository(tempDir);

    const morning = await repository.saveEntry({
      date: "2026-07-09",
      timeIn: "18:00",
      timeOut: "20:00",
      detail: "Evening regression"
    });
    const late = await repository.saveEntry({
      date: "2026-07-09",
      timeIn: "20:30",
      timeOut: "22:00",
      detail: "Late support"
    });

    expect(morning.id).not.toBe(late.id);
    expect(await repository.readEntriesForDate("2026-07-09")).toEqual([morning, late]);

    const updatedLate = await repository.saveEntry({
      ...late,
      detail: "Late support updated"
    });
    expect(updatedLate.detail).toBe("Late support updated");
    expect(await repository.readEntriesForDate("2026-07-09")).toEqual([morning, updatedLate]);

    expect(await repository.removeEntryById(morning.id, "2026-07")).toBe(true);
    expect(await repository.readEntriesForDate("2026-07-09")).toEqual([updatedLate]);
  });

  it("assigns ids to legacy entries without id", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "overtime-repo-"));
    const repository = new OvertimeRecordRepository(tempDir);
    const filePath = repository.filePathFor("2026-07");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          month: "2026-07",
          entries: [
            {
              date: "2026-07-09",
              timeIn: "18:00",
              timeOut: "20:00",
              detail: "Legacy entry"
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const [entry] = await repository.readMonth("2026-07");
    expect(entry.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(entry.detail).toBe("Legacy entry");
  });
});

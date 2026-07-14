import { AppConfig } from "../config/env.js";
import { normalizeItems, normalizeSlackText } from "../slack/sup-parser.js";
import { buildRecordChecksum, DailyRecordRepository } from "../storage/daily-record-repository.js";
import { SupDailyRecord } from "../storage/schemas.js";

export interface ManualEntryInput {
  reportDate: string;
  yesterdayRaw: string;
  todayRaw: string;
}

export async function saveManualEntry(
  config: AppConfig,
  input: ManualEntryInput
): Promise<{ fileStatus: string; record: SupDailyRecord }> {
  const now = new Date().toISOString();
  const yesterdayRaw = normalizeSlackText(input.yesterdayRaw);
  const todayRaw = normalizeSlackText(input.todayRaw);

  const withoutChecksum: Omit<SupDailyRecord, "checksum"> = {
    schemaVersion: 1,
    reportDate: input.reportDate,
    timezone: "Asia/Bangkok",
    user: { displayName: config.slack.displayName },
    source: {
      workspaceUrl: config.slack.workspaceUrl,
      channelUrl: config.slack.channelUrl,
      threadUrl: "manual-entry://desktop"
    },
    content: {
      yesterdayRaw,
      todayRaw,
      yesterdayItems: normalizeItems(yesterdayRaw),
      todayItems: normalizeItems(todayRaw)
    },
    capturedAt: now,
    updatedAt: now
  };

  const record: SupDailyRecord = {
    ...withoutChecksum,
    checksum: buildRecordChecksum(withoutChecksum)
  };

  const repository = new DailyRecordRepository(config.storage.rootDirectory);
  const fileStatus = await repository.save(record);
  return { fileStatus, record };
}

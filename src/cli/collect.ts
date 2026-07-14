import { loadConfig } from "../config/env.js";
import { parseArgs } from "../shared/args.js";
import { todayBangkok } from "../shared/date.js";
import { Logger } from "../shared/logger.js";
import { openSlackBrowser, openSlackPage } from "../slack/slack-browser.js";
import { readSupResponseFromCurrentPage } from "../slack/thread-reader.js";
import { buildRecordChecksum, DailyRecordRepository } from "../storage/daily-record-repository.js";
import { SupDailyRecord } from "../storage/schemas.js";

const args = parseArgs();
const config = await loadConfig();
const logger = new Logger();
const reportDate = typeof args.date === "string" ? args.date : todayBangkok();

await logger.info("Collection started", { reportDate, channelUrl: config.slack.channelUrl });
const session = await openSlackBrowser({
  profileDirectory: config.browser.profileDirectory,
  headless: config.browser.headless,
  channel: config.browser.channel,
  cdpUrl: config.browser.cdpUrl
});

try {
  const page =
    args.current === true
      ? await selectCurrentSlackPage(session.context.pages())
      : await openSlackPage(session.context, config.slack.channelUrl);

  if (!page) {
    throw new Error("No active browser page found. Open Slack in Chrome first or run without --current.");
  }

  if (/signin|login/i.test(page.url())) {
    throw new Error("Slack session expired. Run: pnpm slack:login");
  }

  if (args.current === true) {
    console.log(`Reading current Slack page: ${page.url()}`);
  }

  const result = await readSupResponseFromCurrentPage(page, config.slack.displayName, reportDate);
  const now = new Date().toISOString();
  const withoutChecksum: Omit<SupDailyRecord, "checksum"> = {
    schemaVersion: 1,
    reportDate,
    timezone: "Asia/Bangkok",
    user: { displayName: config.slack.displayName },
    source: {
      workspaceUrl: config.slack.workspaceUrl,
      channelUrl: config.slack.channelUrl,
      threadUrl: result.threadUrl,
      messageTimestamp: result.messageTimestamp
    },
    content: result.parsed,
    capturedAt: now,
    updatedAt: now
  };
  const record: SupDailyRecord = {
    ...withoutChecksum,
    checksum: buildRecordChecksum(withoutChecksum)
  };

  const repository = new DailyRecordRepository(config.storage.rootDirectory);
  const saveResult = await repository.save(record);
  await logger.info("Collection finished", { reportDate, saveResult });
  console.log(`Collected ${reportDate}: ${saveResult}`);
} catch (error) {
  await logger.error("Collection failed", { reportDate, error: String(error) });
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await session.close();
}

async function selectCurrentSlackPage(pages: import("playwright").Page[]): Promise<import("playwright").Page | undefined> {
  const ranked = await Promise.all(
    pages.map(async (page, index) => {
      const visibility = await page
        .evaluate(() => document.visibilityState)
        .catch(() => "unknown");
      const isSlack = /slack\.com/i.test(page.url());
      return { page, index, visibility, isSlack };
    })
  );

  return (
    ranked.find((entry) => entry.isSlack && entry.visibility === "visible")?.page ??
    ranked.find((entry) => entry.isSlack)?.page ??
    ranked.find((entry) => entry.visibility === "visible")?.page ??
    ranked.at(-1)?.page
  );
}

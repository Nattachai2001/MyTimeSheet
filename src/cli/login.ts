import { loadConfig } from "../config/env.js";
import { openSlackBrowser, openSlackPage } from "../slack/slack-browser.js";

const config = await loadConfig();
const session = await openSlackBrowser({
  profileDirectory: config.browser.profileDirectory,
  headless: false,
  channel: config.browser.channel,
  cdpUrl: config.browser.cdpUrl
});

await openSlackPage(session.context, config.slack.workspaceUrl, "load");
console.log("Slack login browser is open. Complete login/MFA in the browser.");
console.log("Press Enter here when login is complete.");
await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
await session.close();

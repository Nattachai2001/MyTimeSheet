import { mkdir } from "node:fs/promises";
import { chromium, Browser, BrowserContext, Page } from "playwright";

export interface SlackBrowserOptions {
  profileDirectory: string;
  headless: boolean;
  channel?: "chrome" | "msedge";
  cdpUrl?: string;
}

export interface SlackBrowserSession {
  context: BrowserContext;
  close: () => Promise<void>;
}

export async function openSlackBrowser(options: SlackBrowserOptions): Promise<SlackBrowserSession> {
  if (options.cdpUrl) {
    let browser: Browser;
    try {
      browser = await chromium.connectOverCDP(options.cdpUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/ECONNREFUSED|connect/i.test(message)) {
        throw new Error(
          `Cannot connect to Chrome at ${options.cdpUrl}. Run "pnpm chrome:debug", login to Slack in that browser, then run collect again.`
        );
      }
      throw error;
    }
    const context = browser.contexts()[0] ?? (await browser.newContext());
    return {
      context,
      close: () => browser.close()
    };
  }

  await mkdir(options.profileDirectory, { recursive: true });
  const context = await chromium.launchPersistentContext(options.profileDirectory, {
    channel: options.channel,
    headless: options.headless,
    viewport: { width: 1440, height: 1000 }
  });
  return {
    context,
    close: () => context.close()
  };
}

export async function openSlackPage(
  context: BrowserContext,
  url: string,
  waitUntil: "load" | "domcontentloaded" = "domcontentloaded"
): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url, { waitUntil, timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  return page;
}

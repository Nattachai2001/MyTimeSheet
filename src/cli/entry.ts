import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { loadConfig } from "../config/env.js";
import { parseArgs } from "../shared/args.js";
import { todayBangkok } from "../shared/date.js";
import { saveManualEntry } from "../entry/manual-record.js";

const args = parseArgs();
const reportDate = typeof args.date === "string" ? args.date : todayBangkok();
const config = await loadConfig();
const rl = readline.createInterface({ input, output });

const yesterdayRaw = await rl.question("Yesterday:\n");
const todayRaw = await rl.question("Today:\n");
rl.close();

const result = await saveManualEntry(config, { reportDate, yesterdayRaw, todayRaw });
console.log(`Saved ${reportDate}: ${result.fileStatus}`);

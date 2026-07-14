import { addCalendarDays } from "../shared/date.js";
import { parseArgs, requireStringArg } from "../shared/args.js";

const args = parseArgs();
const from = requireStringArg(args, "from");
const to = requireStringArg(args, "to");

let current = from;
while (current <= to) {
  console.log(`Run collection for ${current} with: pnpm collect --date ${current}`);
  current = addCalendarDays(current, 1);
}

console.log("Range collection is intentionally conservative. Run the printed commands after Slack search selectors are tuned for your workspace.");

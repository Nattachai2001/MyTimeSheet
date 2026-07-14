import { spawn } from "node:child_process";

import { previousMonthBangkok } from "../shared/date.js";

const child = spawn(process.execPath, ["--import", "tsx", "src/cli/generate.ts", "--month", previousMonthBangkok()], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

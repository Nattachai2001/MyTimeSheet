import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export class Logger {
  constructor(private readonly logDirectory = "logs") {}

  async info(message: string, details?: unknown): Promise<void> {
    await this.write("INFO", message, details);
  }

  async warn(message: string, details?: unknown): Promise<void> {
    await this.write("WARN", message, details);
  }

  async error(message: string, details?: unknown): Promise<void> {
    await this.write("ERROR", message, details);
  }

  private async write(level: string, message: string, details?: unknown): Promise<void> {
    await mkdir(this.logDirectory, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const line = JSON.stringify({
      at: new Date().toISOString(),
      level,
      message,
      details
    });
    await appendFile(path.join(this.logDirectory, `${day}.log`), `${line}\n`, "utf8");
  }
}

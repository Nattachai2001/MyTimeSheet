export function parseArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
    } else if (next && !next.startsWith("--")) {
      args[rawKey] = next;
      index += 1;
    } else {
      args[rawKey] = true;
    }
  }

  return args;
}

export function requireStringArg(
  args: Record<string, string | boolean>,
  name: string,
  fallback?: string
): string {
  const value = args[name] ?? fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
}

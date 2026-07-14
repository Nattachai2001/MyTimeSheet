import { createRequire } from "node:module";
import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";

const require = createRequire(import.meta.url);

let applied = false;

export function ensureExcelJsPackagedCompat(): void {
  if (applied) return;
  applied = true;

  const modulePath = require.resolve("exceljs/lib/utils/parse-sax.js");
  const { bufferToString } = require("exceljs/lib/utils/browser-buffer-decode") as {
    bufferToString: (value: unknown) => string;
  };
  const { SaxesParser } = require("saxes") as { SaxesParser: new () => SaxesParserLike };
  const { PassThrough: LegacyPassThrough } = require("stream") as {
    PassThrough: typeof PassThrough;
  };

  require.cache[modulePath]!.exports = async function* patchedParseSax(iterable: unknown) {
    const source = await normalizeIterable(iterable, LegacyPassThrough);
    const saxesParser = new SaxesParser();
    let error: Error | undefined;
    saxesParser.on("error", (err: Error) => {
      error = err;
    });
    let events: Array<{ eventType: string; value: unknown }> = [];
    saxesParser.on("opentag", (value) => events.push({ eventType: "opentag", value }));
    saxesParser.on("text", (value) => events.push({ eventType: "text", value }));
    saxesParser.on("closetag", (value) => events.push({ eventType: "closetag", value }));

    for await (const chunk of source) {
      saxesParser.write(bufferToString(chunk));
      if (error) throw error;
      yield events;
      events = [];
    }
  };
}

interface SaxesParserLike {
  write(chunk: string): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "opentag" | "text" | "closetag", listener: (value: unknown) => void): void;
}

async function normalizeIterable(
  iterable: unknown,
  PassThroughCtor: typeof PassThrough
): Promise<AsyncIterable<unknown>> {
  if (iterable != null && typeof (iterable as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
    return iterable as AsyncIterable<unknown>;
  }

  if (iterable != null && typeof (iterable as Readable).pipe === "function") {
    return (iterable as Readable).pipe(new PassThroughCtor()) as unknown as AsyncIterable<unknown>;
  }

  if (isReadable(iterable)) {
    const chunks: Buffer[] = [];
    let chunk: Buffer | string | null;
    while ((chunk = iterable.read()) !== null) {
      chunks.push(toBuffer(chunk));
    }

    if (!chunks.length && !iterable.readableEnded) {
      await new Promise<void>((resolve, reject) => {
        iterable.on("data", (data) => {
          chunks.push(toBuffer(data));
        });
        iterable.on("error", reject);
        iterable.on("end", () => resolve());
      });
    }

    const bytes = Buffer.concat(chunks);
    return (async function* singleChunk() {
      yield bytes;
    })();
  }

  if (typeof iterable === "string" || Buffer.isBuffer(iterable)) {
    return (async function* singleChunk() {
      yield iterable;
    })();
  }

  if (iterable != null && typeof (iterable as Iterable<unknown>)[Symbol.iterator] === "function") {
    const syncIterable = iterable as Iterable<unknown>;
    return (async function* fromSync() {
      for (const item of syncIterable) {
        yield item;
      }
    })();
  }

  throw new TypeError("iterable is not async iterable");
}

function isReadable(value: unknown): value is Readable {
  return Boolean(value && typeof (value as Readable).on === "function");
}

function toBuffer(chunk: Buffer | string): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

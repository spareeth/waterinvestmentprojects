import net from "node:net";

// Minimal clamd client (M8, PLAN section 5: virus scan before a file is visible). Speaks clamd's INSTREAM
// command over TCP, so no extra package is needed: the file is sent in chunks, each prefixed with its length as
// a 4-byte big-endian number, and ended with a zero-length chunk. clamd answers "stream: OK" or
// "stream: <signature> FOUND". No server-only import, so tests can run it against a fake clamd.

export interface ClamdOptions {
  host: string;
  port: number;
  /** Gives up when clamd is silent for this long (connecting, sending or waiting for the verdict). */
  timeoutMs?: number;
}

export type ClamdVerdict =
  { status: "clean" } | { status: "infected"; signature: string };

/** clamd answered, but with an error (for example the file is over its StreamMaxLength). */
export class ClamdReplyError extends Error {
  constructor(public readonly reply: string) {
    super(`clamd error: ${reply}`);
    this.name = "ClamdReplyError";
  }
}

/** clamd could not be reached or stopped answering. The file stays unscanned and is tried again later. */
export class ClamdUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClamdUnavailableError";
  }
}

const CHUNK_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Reads clamd's reply to INSTREAM. Exported for tests. */
export function parseClamdReply(raw: string): ClamdVerdict {
  const reply = raw.replace(/\0/g, "").trim();
  if (reply === "stream: OK") return { status: "clean" };
  const found = /^stream: (.+) FOUND$/.exec(reply);
  if (found) return { status: "infected", signature: found[1] };
  throw new ClamdReplyError(reply || "empty reply");
}

function lengthPrefix(length: number): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(length, 0);
  return header;
}

/** A file's bytes: a web stream (from storage) or any async iterable (tests). */
export type ScanSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

async function* pieces(source: ScanSource): AsyncGenerator<Uint8Array> {
  if (!("getReader" in source)) {
    yield* source;
    return;
  }
  const reader = source.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Scans one file's bytes with clamd. Throws ClamdUnavailableError or ClamdReplyError when there is no verdict. */
export function clamdScan(
  source: ScanSource,
  { host, port, timeoutMs = DEFAULT_TIMEOUT_MS }: ClamdOptions,
): Promise<ClamdVerdict> {
  return new Promise<ClamdVerdict>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let reply = "";
    let settled = false;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      outcome();
    };
    const fail = (error: Error) =>
      finish(() =>
        reject(
          error instanceof ClamdReplyError
            ? error
            : new ClamdUnavailableError(
                `clamd at ${host}:${port} is not available (${error.message})`,
              ),
        ),
      );

    socket.setTimeout(timeoutMs, () =>
      fail(new Error(`no answer within ${timeoutMs} ms`)),
    );
    socket.on("error", (error) => {
      // clamd closes the connection early when it refuses a stream (size limit); its reply arrives first.
      if (reply.length > 0) return;
      fail(error);
    });
    socket.on("data", (data) => {
      reply += data.toString("utf8");
      if (reply.includes("\0")) {
        finish(() => {
          try {
            resolve(parseClamdReply(reply));
          } catch (error) {
            reject(error);
          }
        });
      }
    });
    socket.on("close", () => {
      if (settled) return;
      if (reply.length > 0) {
        finish(() => {
          try {
            resolve(parseClamdReply(reply));
          } catch (error) {
            reject(error);
          }
        });
      } else {
        fail(new Error("connection closed without a verdict"));
      }
    });

    const write = (chunk: Uint8Array): Promise<void> =>
      new Promise((done) => {
        if (socket.write(chunk)) done();
        else socket.once("drain", () => done());
      });

    socket.once("connect", async () => {
      try {
        await write(Buffer.from("zINSTREAM\0", "ascii"));
        for await (const piece of pieces(source)) {
          for (
            let offset = 0;
            offset < piece.byteLength;
            offset += CHUNK_BYTES
          ) {
            if (settled) return;
            const part = piece.subarray(offset, offset + CHUNK_BYTES);
            await write(lengthPrefix(part.byteLength));
            await write(part);
          }
        }
        if (!settled) await write(lengthPrefix(0));
      } catch (error) {
        fail(error as Error);
      }
    });
  });
}

/** True when clamd answers PING. Used at start-up to say whether scanning works. */
export function clamdPing({
  host,
  port,
  timeoutMs = 5_000,
}: ClamdOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let reply = "";
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on("error", () => done(false));
    socket.on("data", (data) => {
      reply += data.toString("utf8");
      if (reply.includes("\0"))
        done(reply.replace(/\0/g, "").trim() === "PONG");
    });
    socket.once("connect", () => socket.write("zPING\0"));
  });
}

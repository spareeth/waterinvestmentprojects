// @vitest-environment node
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  ClamdReplyError,
  ClamdUnavailableError,
  clamdPing,
  clamdScan,
  parseClamdReply,
} from "./clamd";

// A fake clamd that speaks INSTREAM: it rebuilds the file from the length-prefixed chunks and answers FOUND when
// the file contains the word VIRUS, an error when it is longer than `limit`, and OK otherwise.
function fakeClamd(limit = 1024 * 1024): Promise<{
  port: number;
  received: Buffer[];
  close: () => Promise<void>;
}> {
  const received: Buffer[] = [];
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let command: string | null = null;
    const file: Buffer[] = [];
    let size = 0;
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      if (command === null) {
        const end = buffer.indexOf(0);
        if (end < 0) return;
        command = buffer.subarray(0, end).toString("ascii");
        buffer = buffer.subarray(end + 1);
        if (command === "zPING") {
          socket.end("PONG\0");
          return;
        }
      }
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (length === 0) {
          const whole = Buffer.concat(file);
          received.push(whole);
          socket.end(
            whole.includes("VIRUS")
              ? "stream: Fake.Test.Signature FOUND\0"
              : "stream: OK\0",
          );
          return;
        }
        if (buffer.length < 4 + length) return;
        file.push(buffer.subarray(4, 4 + length));
        size += length;
        buffer = buffer.subarray(4 + length);
        if (size > limit) {
          socket.end("INSTREAM size limit exceeded. ERROR\0");
          return;
        }
      }
    });
    socket.on("error", () => undefined);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        port,
        received,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function* chunks(...parts: (string | Buffer)[]) {
  for (const part of parts) yield Buffer.from(part);
}

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

describe("parseClamdReply", () => {
  it("reads clean and infected verdicts", () => {
    expect(parseClamdReply("stream: OK\0")).toEqual({ status: "clean" });
    expect(parseClamdReply("stream: Eicar-Signature FOUND\0")).toEqual({
      status: "infected",
      signature: "Eicar-Signature",
    });
  });

  it("treats anything else as a clamd error", () => {
    expect(() =>
      parseClamdReply("INSTREAM size limit exceeded. ERROR\0"),
    ).toThrow(ClamdReplyError);
    expect(() => parseClamdReply("")).toThrow(ClamdReplyError);
  });
});

describe("clamdScan against a fake clamd", () => {
  it("sends the whole file and reports it clean", async () => {
    const fake = await fakeClamd();
    close = fake.close;
    const big = Buffer.alloc(200 * 1024, 7); // more than one 64 KB chunk
    const verdict = await clamdScan(chunks("%PDF-1.7 ", big), {
      host: "127.0.0.1",
      port: fake.port,
    });
    expect(verdict).toEqual({ status: "clean" });
    expect(fake.received[0].byteLength).toBe(9 + big.byteLength);
  });

  it("reports the signature of an infected file", async () => {
    const fake = await fakeClamd();
    close = fake.close;
    await expect(
      clamdScan(chunks("hello VIRUS"), { host: "127.0.0.1", port: fake.port }),
    ).resolves.toEqual({
      status: "infected",
      signature: "Fake.Test.Signature",
    });
  });

  it("passes on clamd's refusal of a file that is too large", async () => {
    const fake = await fakeClamd(10);
    close = fake.close;
    await expect(
      clamdScan(chunks(Buffer.alloc(100, 1)), {
        host: "127.0.0.1",
        port: fake.port,
      }),
    ).rejects.toBeInstanceOf(ClamdReplyError);
  });

  it("says clamd is unavailable when nothing listens", async () => {
    const fake = await fakeClamd();
    await fake.close();
    await expect(
      clamdScan(chunks("x"), {
        host: "127.0.0.1",
        port: fake.port,
        timeoutMs: 2000,
      }),
    ).rejects.toBeInstanceOf(ClamdUnavailableError);
    expect(
      await clamdPing({ host: "127.0.0.1", port: fake.port, timeoutMs: 2000 }),
    ).toBe(false);
  });

  it("answers PING", async () => {
    const fake = await fakeClamd();
    close = fake.close;
    expect(await clamdPing({ host: "127.0.0.1", port: fake.port })).toBe(true);
  });
});

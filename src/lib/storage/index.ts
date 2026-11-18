import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getEnv } from "@/lib/env";
import { assertSafeKey } from "./keys";

// One storage interface for uploaded files (PLAN section 4). Files are never public: callers check permission
// through src/lib/authz (authorizeDocumentFile) first, then stream the file. A signed URL of at most 5 minutes
// becomes possible once the S3-compatible driver (MinIO, M10) exists.

export { assertSafeKey, isSafeKey, teaserBlobKey } from "./keys";

export interface StoredFile {
  sizeBytes: number;
  /** Web stream of the file contents, for a Response body. */
  stream: ReadableStream<Uint8Array>;
}

export interface BlobStore {
  /** Writes the file. Refuses to overwrite: every version gets its own key. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** The file, or null when there is no file under this key. */
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

/** Files on the local disk under one root folder (local development, and staging until MinIO). */
export class LocalBlobStore implements BlobStore {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private pathFor(key: string): string {
    const file = path.resolve(this.root, assertSafeKey(key));
    // Belt and braces: the key rules already exclude "..", absolute paths and backslashes.
    if (!file.startsWith(this.root + path.sep)) {
      throw new Error("Unsafe storage key");
    }
    return file;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const file = this.pathFor(key);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    // "wx": fail if the file exists, so a version can never be replaced in place.
    await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  }

  async get(key: string): Promise<StoredFile | null> {
    const file = this.pathFor(key);
    try {
      const info = await stat(file);
      if (!info.isFile()) return null;
      const stream = Readable.toWeb(
        createReadStream(file),
      ) as ReadableStream<Uint8Array>;
      return { sizeBytes: info.size, stream };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

let cached: BlobStore | undefined;

/** The configured store (STORAGE_DRIVER). */
export function getBlobStore(): BlobStore {
  if (cached) return cached;
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3") {
    throw new Error(
      "STORAGE_DRIVER=s3 is not available yet (S3-compatible storage arrives in M10); use local",
    );
  }
  cached = new LocalBlobStore(env.STORAGE_LOCAL_DIR);
  return cached;
}

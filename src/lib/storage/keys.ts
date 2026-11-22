// Object keys for uploaded files. Pure, so the rules can be unit tested.
// Keys are always built by us from database ids, never from the uploader's file name, and never form a URL.

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/** Key for a teaser version: projects/<projectId>/teaser/<documentId>.pdf */
export function teaserBlobKey(projectId: string, documentId: string): string {
  return assertSafeKey(`projects/${projectId}/teaser/${documentId}.pdf`);
}

/**
 * Key for a file sent through an upload link (M0): submissions/<uploadId>/<fileId>.<type>, where the type is one
 * of the accepted teaser formats (M11). Both ids are random UUIDs made before the database rows exist, so the file
 * can be stored first and removed if the transaction fails.
 */
export function submissionBlobKey(
  uploadId: string,
  fileId: string,
  extension: string,
): string {
  if (!/^[a-z0-9]{2,5}$/.test(extension)) throw new Error("Unsafe extension");
  return assertSafeKey(`submissions/${uploadId}/${fileId}.${extension}`);
}

/**
 * Accepts only plain relative keys: letters, digits, dot, dash and underscore in segments separated by single
 * slashes, no segment starting with a dot (so no "..", no hidden files), no absolute paths or backslashes.
 */
export function isSafeKey(key: string): boolean {
  return key.length > 0 && key.length <= 512 && SAFE_KEY.test(key);
}

export function assertSafeKey(key: string): string {
  if (!isSafeKey(key)) throw new Error("Unsafe storage key");
  return key;
}

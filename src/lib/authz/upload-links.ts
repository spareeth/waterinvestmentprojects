import "server-only";
import { db } from "@/lib/db";
import type { DataOptions } from "./data";
import { type UploadLinkState, uploadLinkState } from "./submissions";
import { hashUploadToken, isWellFormedUploadToken } from "./upload-token";

// The only way from a /submit/<token> URL to an upload link (M0). The token is hashed and looked up; the token
// itself is never stored or logged. Malformed tokens never reach the database.

export interface ResolvedUploadLink {
  state: UploadLinkState;
  link: {
    id: string;
    countryId: string | null;
    expiresAt: Date;
    country: { id: string; name: string } | null;
  } | null;
}

export async function resolveUploadLink(
  token: string,
  { client = db, now = new Date() }: DataOptions = {},
): Promise<ResolvedUploadLink> {
  if (!isWellFormedUploadToken(token))
    return { state: "not_found", link: null };
  const link = await client.uploadLink.findUnique({
    where: { tokenHash: hashUploadToken(token) },
    select: {
      id: true,
      countryId: true,
      expiresAt: true,
      revokedAt: true,
      country: { select: { id: true, name: true, status: true } },
    },
  });
  const state = uploadLinkState(link, now);
  if (!link || state !== "valid") return { state, link: null };
  return {
    state,
    link: {
      id: link.id,
      countryId: link.countryId,
      expiresAt: link.expiresAt,
      country: link.country
        ? { id: link.country.id, name: link.country.name }
        : null,
    },
  };
}

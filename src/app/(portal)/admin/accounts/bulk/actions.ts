"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import {
  applyBulkAccounts,
  type BulkAccountsPreview,
  type BulkAccountsResult,
  previewBulkAccounts,
} from "@/lib/admin/accounts";
import { ADMIN_MESSAGES, AdminError } from "@/lib/admin/errors";

// Bulk account hand-out (M7, PLAN 0a.4). The temporary passwords travel back to the admin's browser in the
// response and nowhere else: not stored, not logged, not in the audit trail.

const MAX_TEXT = 300_000;

function message(error: unknown): string {
  if (error instanceof AdminError) return ADMIN_MESSAGES[error.code];
  throw error;
}

export async function previewBulkAccountsAction(
  text: string,
): Promise<
  { ok: true; preview: BulkAccountsPreview } | { ok: false; error: string }
> {
  const viewer = await requireViewer();
  if (typeof text !== "string" || text.length > MAX_TEXT) {
    return {
      ok: false,
      error: "The file is too large. Split it into smaller files.",
    };
  }
  try {
    return { ok: true, preview: await previewBulkAccounts(viewer, text) };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function applyBulkAccountsAction(
  text: string,
  digest: string,
): Promise<
  { ok: true; result: BulkAccountsResult } | { ok: false; error: string }
> {
  const viewer = await requireViewer();
  if (
    typeof text !== "string" ||
    text.length > MAX_TEXT ||
    typeof digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(digest)
  ) {
    return { ok: false, error: ADMIN_MESSAGES.invalid };
  }
  try {
    const result = await applyBulkAccounts(viewer, text, digest, {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

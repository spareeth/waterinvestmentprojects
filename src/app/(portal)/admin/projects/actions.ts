"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import { ADMIN_MESSAGES, AdminError } from "@/lib/admin/errors";
import {
  applyMetadataImport,
  BULK_PUBLISH_MAX,
  type ImportResult,
  type MetadataPreview,
  previewMetadataImport,
  publishProjects,
  unpublishProject,
} from "@/lib/admin/projects";
import { WORKSPACE_MESSAGES, WorkspaceError } from "@/lib/workspace/errors";

// Admin projects (M7). Thin wrappers: each action gets the Viewer and the services decide through src/lib/authz.

export interface ProjectActionState {
  error?: string;
  message?: string;
  /** Per project refusals of a bulk publish, by project id. */
  refused?: Record<string, string>;
}

const ids = z.array(z.string().min(1).max(64)).min(1).max(BULK_PUBLISH_MAX);

function refusedMessage(error: unknown): string {
  if (error instanceof AdminError) return ADMIN_MESSAGES[error.code];
  if (error instanceof WorkspaceError) return WORKSPACE_MESSAGES[error.code];
  throw error;
}

export async function publishProjectsAction(
  projectIds: string[],
): Promise<ProjectActionState> {
  const viewer = await requireViewer();
  const parsed = ids.safeParse(projectIds);
  if (!parsed.success) return { error: "Choose at least one project." };
  try {
    const results = await publishProjects(viewer, parsed.data, {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    const published = results.filter((r) => r.ok).length;
    const refused = Object.fromEntries(
      results
        .filter((r) => !r.ok && r.error)
        .map((r) => [r.projectId, WORKSPACE_MESSAGES[r.error!]]),
    );
    return {
      message:
        published === 1
          ? "1 project published."
          : `${published} projects published.`,
      ...(Object.keys(refused).length > 0
        ? {
            refused,
            error: `${Object.keys(refused).length} could not be published. See the notes in the list.`,
          }
        : {}),
    };
  } catch (error) {
    return { error: refusedMessage(error) };
  }
}

export async function unpublishProjectAction(
  projectId: string,
): Promise<ProjectActionState> {
  const viewer = await requireViewer();
  try {
    await unpublishProject(viewer, String(projectId).slice(0, 64), {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return { message: "Taken out of the pipeline." };
  } catch (error) {
    return { error: refusedMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const MAX_TEXT = 1_000_000;

export type PreviewState =
  { ok: true; preview: MetadataPreview } | { ok: false; error: string };

export async function previewMetadataAction(
  text: string,
): Promise<PreviewState> {
  const viewer = await requireViewer();
  if (typeof text !== "string" || text.length > MAX_TEXT) {
    return {
      ok: false,
      error: "The file is too large. Split it into smaller files.",
    };
  }
  try {
    return { ok: true, preview: await previewMetadataImport(viewer, text) };
  } catch (error) {
    return { ok: false, error: refusedMessage(error) };
  }
}

export type ApplyState =
  { ok: true; result: ImportResult } | { ok: false; error: string };

export async function applyMetadataAction(
  text: string,
  digest: string,
): Promise<ApplyState> {
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
    const result = await applyMetadataImport(viewer, text, digest, {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: refusedMessage(error) };
  }
}

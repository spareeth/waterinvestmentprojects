"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import { describeFacts } from "@/lib/teaser/facts";
import { MAX_TEASER_BYTES } from "@/lib/workspace/teaser-file";
import {
  WORKSPACE_MESSAGES,
  WorkspaceError,
  type WorkspaceErrorCode,
} from "@/lib/workspace/errors";
import {
  parseProjectInput,
  type ProjectFormValues,
  projectValuesFrom,
} from "@/lib/workspace/project-input";
import {
  createProject,
  publishProject,
  readProjectTeaserFacts,
  setTeaserDownload,
  updateProject,
  uploadTeaser,
  withdrawProject,
} from "@/lib/workspace/service";

// Country workspace server actions (M5). Each one gets the Viewer itself (requireViewer) and leaves every
// permission decision to the workspace service, which checks through src/lib/authz. Nothing here trusts the
// page that rendered the form.

export interface WorkspaceFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** What the person typed, so a refused form keeps it. */
  values?: ProjectFormValues;
  success?: string;
}

/** Field that shows the message for each refusal; anything else is shown above the form. */
const FIELD_FOR: Partial<Record<WorkspaceErrorCode, string>> = {
  file_missing: "teaser",
  file_too_large: "teaser",
  file_not_pdf: "teaser",
  file_wrong_type: "teaser",
  ack_required: "acknowledge",
};

function refused(
  error: unknown,
  values?: ProjectFormValues,
): WorkspaceFormState {
  if (!(error instanceof WorkspaceError)) throw error;
  const message = WORKSPACE_MESSAGES[error.code];
  const field = FIELD_FOR[error.code];
  return field
    ? { fieldErrors: { [field]: message }, values }
    : { error: message, values };
}

async function meta() {
  return requestMetaFrom(await headers());
}

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function acknowledgementFrom(formData: FormData) {
  return { acknowledged: text(formData, "acknowledge") === "yes" };
}

export async function createProjectAction(
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const viewer = await requireViewer();
  const values = projectValuesFrom(formData);
  const countryId = text(formData, "countryId");
  const parsed = parseProjectInput(values);
  if (!countryId || !parsed.ok) {
    return {
      fieldErrors: {
        ...(parsed.ok ? {} : parsed.fieldErrors),
        ...(countryId ? {} : { countryId: "Choose the country." }),
      },
      values,
    };
  }
  let id: string;
  try {
    id = await createProject(viewer, countryId, parsed.data, {
      meta: await meta(),
    });
  } catch (error) {
    return refused(error, values);
  }
  redirect(`/workspace/projects/${id}?created=1`);
}

export async function updateProjectAction(
  projectId: string,
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const viewer = await requireViewer();
  const values = projectValuesFrom(formData);
  const parsed = parseProjectInput(values);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  try {
    const changed = await updateProject(viewer, projectId, parsed.data, {
      meta: await meta(),
    });
    refresh();
    return {
      values,
      success: changed.length > 0 ? "Changes saved." : "No changes to save.",
    };
  } catch (error) {
    return refused(error, values);
  }
}

export async function uploadTeaserAction(
  projectId: string,
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const viewer = await requireViewer();
  const file = formData.get("teaser");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { teaser: WORKSPACE_MESSAGES.file_missing } };
  }
  // Refuse before reading a too-large file into memory; the service checks the bytes again.
  if (file.size > MAX_TEASER_BYTES) {
    return { fieldErrors: { teaser: WORKSPACE_MESSAGES.file_too_large } };
  }
  const report = { filled: [] as string[] };
  try {
    await uploadTeaser(
      viewer,
      projectId,
      { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
      { allowDownload: text(formData, "allowDownload") !== "view" },
      acknowledgementFrom(formData),
      { meta: await meta(), report },
    );
  } catch (error) {
    return refused(error);
  }
  refresh();
  return {
    success:
      report.filled.length > 0
        ? `Teaser uploaded. Filled in from the teaser: ${describeFacts(report.filled)}. Please check them under Key facts.`
        : "Teaser uploaded.",
  };
}

export async function setTeaserDownloadAction(
  documentId: string,
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const viewer = await requireViewer();
  try {
    await setTeaserDownload(
      viewer,
      documentId,
      text(formData, "allowDownload") !== "view",
      { meta: await meta() },
    );
  } catch (error) {
    return refused(error);
  }
  refresh();
  return { success: "Download setting saved." };
}

export async function publishProjectAction(
  projectId: string,
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const viewer = await requireViewer();
  try {
    await publishProject(viewer, projectId, {
      allowDownload: text(formData, "allowDownload") !== "view",
      meta: await meta(),
    });
  } catch (error) {
    return refused(error);
  }
  refresh();
  return { success: "Published to the pipeline." };
}

export async function withdrawProjectAction(
  projectId: string,
  _prev: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const viewer = await requireViewer();
  if (text(formData, "confirm") !== "yes") {
    return {
      fieldErrors: {
        confirm: "Tick the box to confirm you want to withdraw the project.",
      },
    };
  }
  try {
    await withdrawProject(viewer, projectId, { meta: await meta() });
  } catch (error) {
    return refused(error);
  }
  refresh();
  return { success: "Withdrawn from the pipeline." };
}

/** "Fill from teaser" (22 Nov): values for the Key facts form, read from the current PDF teaser; not saved. */
export async function teaserFactsAction(projectId: string): Promise<{
  values?: ProjectFormValues;
  filled?: string;
  error?: string;
}> {
  const viewer = await requireViewer();
  try {
    const facts = await readProjectTeaserFacts(viewer, projectId);
    if (!facts) {
      return {
        error:
          "Nothing could be read from the current teaser (it may be a scanned image or not a PDF). Please enter the details by hand.",
      };
    }
    const values: ProjectFormValues = {};
    if (facts.title) values.title = facts.title;
    if (facts.sector) values.sector = facts.sector;
    if (facts.region) values.region = facts.region;
    if (facts.pppModel) values.pppModel = facts.pppModel;
    if (facts.sizeMinUsdMillion !== undefined) {
      values.sizeMinUsdMillion = String(facts.sizeMinUsdMillion);
    }
    if (facts.sizeMaxUsdMillion !== undefined) {
      values.sizeMaxUsdMillion = String(facts.sizeMaxUsdMillion);
    }
    if (facts.developmentStage)
      values.developmentStage = facts.developmentStage;
    return { values, filled: describeFacts(Object.keys(facts)) };
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return { error: WORKSPACE_MESSAGES[error.code] };
    }
    throw error;
  }
}

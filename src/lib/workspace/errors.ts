// Why a workspace action was refused. Pure, so forms and tests can use the codes and messages.
// British spelling, no em dashes.

export type WorkspaceErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "file_missing"
  | "file_too_large"
  | "file_not_pdf"
  | "file_wrong_type"
  | "ack_required"
  | "no_clean_teaser"
  | "teaser_not_pdf"
  | "already_published"
  | "not_published";

export class WorkspaceError extends Error {
  constructor(public readonly code: WorkspaceErrorCode) {
    super(`Workspace action refused: ${code}`);
    this.name = "WorkspaceError";
  }
}

export const WORKSPACE_MESSAGES: Record<WorkspaceErrorCode, string> = {
  not_found: "This project could not be found in your workspace.",
  forbidden: "You do not have permission to do this.",
  conflict:
    "The project changed while you were working on it. Reload the page and try again.",
  file_missing: "Choose the teaser file to upload.",
  file_too_large: "The teaser must be 25 MB or smaller.",
  file_not_pdf:
    "The teaser must be a PDF file. If you have a PowerPoint, Word, Excel or image file, save it as PDF first.",
  file_wrong_type:
    "Upload a PDF (preferred), PowerPoint, Word, Excel, OpenDocument, RTF, JPG or PNG file. Other formats, macro-enabled files, and files whose content does not match their name, are not accepted.",
  ack_required:
    "Tick the consent box. A teaser can only be stored with the Government's consent to share it.",
  no_clean_teaser:
    "Upload a teaser first. It can be published once its virus check has passed.",
  teaser_not_pdf:
    "The current teaser is not a PDF. Convert it to PDF and upload the PDF as a new version, then publish.",
  already_published: "This project is already in the pipeline.",
  not_published: "This project is not in the pipeline.",
};

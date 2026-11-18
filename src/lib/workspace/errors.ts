// Why a workspace action was refused. Pure, so forms and tests can use the codes and messages.
// British spelling, no em dashes.

export type WorkspaceErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "file_missing"
  | "file_too_large"
  | "file_not_pdf"
  | "ack_required"
  | "evidence_required"
  | "no_clean_teaser"
  | "no_acknowledgement"
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
    "The teaser must be a PDF file. If you have a PowerPoint file, save it as PDF first.",
  ack_required:
    "Tick the confirmation box. The teaser can only be shared once it is confirmed.",
  evidence_required:
    "Note where the country's written confirmation is kept (for example the date and sender of its email).",
  no_clean_teaser:
    "Upload a teaser first. It can be published once its virus check has passed.",
  no_acknowledgement:
    "The confirmation could not be recorded. Please try again.",
  already_published: "This project is already in the pipeline.",
  not_published: "This project is not in the pipeline.",
};

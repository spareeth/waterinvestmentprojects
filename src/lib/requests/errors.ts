// Why a meeting request action was refused (M5, PLAN v0.3 F5/F6). Pure, so forms and tests can use the codes
// and messages. British spelling, no em dashes.

export type RequestErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid"
  | "already_requested"
  | "not_pending"
  | "not_open";

export class RequestError extends Error {
  constructor(public readonly code: RequestErrorCode) {
    super(`Meeting request refused: ${code}`);
    this.name = "RequestError";
  }
}

export const REQUEST_MESSAGES: Record<RequestErrorCode, string> = {
  not_found: "This request or project could not be found.",
  forbidden: "You do not have permission to do this.",
  invalid: "Check the highlighted fields and try again.",
  already_requested:
    "You have already requested a meeting on this project. You can follow it under My meeting requests.",
  not_pending:
    "This request has already been answered or withdrawn. Reload the page to see its status.",
  not_open: "This request can no longer be withdrawn.",
};

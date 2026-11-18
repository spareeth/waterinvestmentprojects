// The consent given with every teaser uploaded in the portal workspace (PLAN v0.3, CLAUDE.md: a teaser cannot be
// stored without a Submission carrying the acknowledgement text version and timestamp). Pure.
// Wording and versions live in src/lib/config.ts: change the text AND bump the version together.

import { appConfig } from "@/lib/config";

export interface UploadAcknowledgement {
  version: string;
  text: string;
}

/**
 * A country user gives the government's consent themselves, with the exact WBG wording used on the upload link.
 * An admin acting for a country instead confirms that the government's written consent has been received.
 */
export function workspaceUploadAcknowledgement(
  onBehalf: boolean,
): UploadAcknowledgement {
  return onBehalf
    ? appConfig.uploadAcknowledgementOnBehalf
    : appConfig.uploadAcknowledgement;
}

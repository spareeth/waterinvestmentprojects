// Confidentiality acknowledgement given before a teaser goes to the pipeline (PLAN F4). Pure.
// The wording is still to be agreed with the Summit group: change the text AND bump the version together, so
// every stored Acknowledgement says exactly which wording was accepted.

import { appConfig } from "@/lib/config";

/** Version stored on Acknowledgement.textVersion when a country user confirms for their own country. */
export const ACKNOWLEDGEMENT_TEXT_VERSION = "teaser-ack-v1";
/** Version stored when a Summit or platform admin records the country's written confirmation on its behalf. */
export const ACKNOWLEDGEMENT_ON_BEHALF_TEXT_VERSION = "teaser-ack-v1-on-behalf";

/** Evidence notes (where the country's written confirmation is kept) must say something useful. */
export const EVIDENCE_NOTE_MIN = 10;
export const EVIDENCE_NOTE_MAX = 1000;

export function acknowledgementTextVersion(onBehalf: boolean): string {
  return onBehalf
    ? ACKNOWLEDGEMENT_ON_BEHALF_TEXT_VERSION
    : ACKNOWLEDGEMENT_TEXT_VERSION;
}

/** The sentence shown next to the tick box. */
export function acknowledgementText(
  countryName: string,
  onBehalf: boolean,
): string {
  const portal = appConfig.tagline;
  if (onBehalf) {
    return `I confirm that the Government of ${countryName} has confirmed in writing that this teaser contains no confidential or commercially sensitive information, and that it may be shared with investors and operators invited to the ${portal}. I have noted below where that confirmation is kept.`;
  }
  return `I confirm, on behalf of the Government of ${countryName}, that this teaser contains no confidential or commercially sensitive information, and that it may be shared with investors and operators invited to the ${portal}.`;
}

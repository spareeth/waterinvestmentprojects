// Email texts for investor registration (M13, PLAN v0.4 0b.19). Pure. British spelling, no em dashes.
// The Summit mailbox is told of every registration; the registrant hears the outcome by email only when
// REGISTRATION_NOTIFY_REGISTRANT is on (PLAN v0.4 0b.26: no portal email to external users until delivery works).

import type { OrganisationType } from "@/generated/prisma/enums";
import { appConfig } from "@/lib/config";
import {
  describeMatch,
  ORGANISATION_TYPE_LABEL,
  type PreApprovalMatch,
} from "./pre-approval";

function portalLink(path: string): string {
  return `${appConfig.url.replace(/\/+$/, "")}${path}`;
}

/** Notice to the Summit mailbox about a new registration. */
export function registrationNotice(facts: {
  name: string;
  email: string;
  organisation: string;
  organisationType: OrganisationType;
  jobTitle: string;
  match: PreApprovalMatch | null;
  /** True when the registrant got immediate access (pre-approved, REGISTRATION_AUTO_APPROVE). */
  approved: boolean;
}): { subject: string; text: string } {
  return {
    subject: facts.approved
      ? `New registration, access given: ${facts.organisation}`
      : `New registration waiting for approval: ${facts.organisation}`,
    text: [
      `${facts.name} <${facts.email}> registered on ${appConfig.name}.`,
      "",
      `Organisation: ${facts.organisation}`,
      `Organisation type: ${ORGANISATION_TYPE_LABEL[facts.organisationType]}`,
      `Job title: ${facts.jobTitle}`,
      `Pre-approved list: ${describeMatch(facts.match)}`,
      "",
      facts.approved
        ? "The account was on the pre-approved list and has access now. To take it away, switch the account off here (sign-in needed):"
        : "The account sees nothing until it is approved. Approve or reject it here (sign-in needed):",
      portalLink("/admin/accounts"),
    ].join("\n"),
  };
}

/** The outcome, to the registrant. */
export function registrationOutcomeEmail(
  name: string,
  decision: "approve" | "reject",
): { subject: string; text: string } {
  return decision === "approve"
    ? {
        subject: `${appConfig.name}: your access is approved`,
        text: [
          `Dear ${name},`,
          "",
          `Your account on ${appConfig.name} has been approved. Sign in with the email address and password you chose:`,
          portalLink("/sign-in"),
          "",
          "Kind regards,",
          "The Water Investment Summit team",
        ].join("\n"),
      }
    : {
        subject: `${appConfig.name}: your registration`,
        text: [
          `Dear ${name},`,
          "",
          `Thank you for registering on ${appConfig.name}. The Summit team was not able to approve access for this account. If you think this is a mistake, please reply to this email.`,
          "",
          "Kind regards,",
          "The Water Investment Summit team",
        ].join("\n"),
      };
}

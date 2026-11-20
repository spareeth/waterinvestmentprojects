// Email texts for the upload link (M0). Pure. British spelling, no em dashes. A first draft for the Summit team
// to adjust; the acknowledgement itself comes from config.

import { appConfig } from "@/lib/config";
import { formatUaeTime } from "./format";

export interface SubmissionMailFacts {
  submissionId: string;
  countryName: string;
  uploaderName: string;
  uploaderEmail: string;
  /** "Represented government organisation"; may be empty for older submissions. */
  governmentOrganisation?: string;
  acceptedAt: Date;
  ackText: string;
  files: { filename: string; sector: string }[];
}

function fileLines(files: SubmissionMailFacts["files"]): string[] {
  return files.map((f) => `- ${f.filename} (sector: ${f.sector})`);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Confirmation to the person who uploaded, from the Summit mailbox. */
export function uploaderConfirmationEmail(facts: SubmissionMailFacts): {
  subject: string;
  text: string;
} {
  return {
    subject: `${appConfig.name}: we received your ${plural(facts.files.length, "teaser")} (${facts.countryName})`,
    text: [
      `Dear ${facts.uploaderName},`,
      "",
      `Thank you. We received the following project ${facts.files.length === 1 ? "teaser" : "teasers"} for ${facts.countryName}:`,
      "",
      ...fileLines(facts.files),
      "",
      ...(facts.governmentOrganisation
        ? [
            `Represented government organisation: ${facts.governmentOrganisation}`,
            "",
          ]
        : []),
      `On ${formatUaeTime(facts.acceptedAt)} you confirmed:`,
      `"${facts.ackText}"`,
      "",
      "The Summit team will check the files before they are shared with the invited participants. To replace a file, upload it again through the same link and reply to this email to say which one it replaces.",
      "",
      `Reference: ${facts.submissionId}`,
      "",
      "Kind regards,",
      "The Water Investment Summit team",
      `${appConfig.name}, ${appConfig.tagline}`,
    ].join("\n"),
  };
}

/** Notice to the Summit team mailbox. */
export function summitSubmissionNotice(facts: SubmissionMailFacts): {
  subject: string;
  text: string;
} {
  return {
    subject: `New teaser submission: ${facts.countryName} (${plural(facts.files.length, "file")})`,
    text: [
      `${facts.uploaderName} <${facts.uploaderEmail}> sent ${plural(facts.files.length, "teaser")} for ${facts.countryName} on ${formatUaeTime(facts.acceptedAt)}.`,
      ...(facts.governmentOrganisation
        ? [
            `Represented government organisation: ${facts.governmentOrganisation}`,
          ]
        : []),
      "",
      ...fileLines(facts.files),
      "",
      "The projects are saved as drafts. Review and download them here (sign-in needed):",
      `${appConfig.url.replace(/\/+$/, "")}/admin/submissions`,
      "",
      `Reference: ${facts.submissionId}`,
    ].join("\n"),
  };
}

// Email texts for meeting sign-ups (25 Nov, Sajid: "an email from summit to the govt on each respective sign up and
// an email to the summit admins on every sign up"). Pure. British spelling, no em dashes. The note is the investor's
// own text, so it is quoted as given. The government email leaves out the investor's address (they see it in the
// portal); the Summit notice names it.

import { appConfig } from "@/lib/config";
import { formatUaeTime } from "@/lib/submission/format";
import { MEETING_SIGNUP } from "./schedule";

export type SignupMailKind = "new" | "updated" | "withdrawn";

export interface SignupMailFacts {
  signupId: string;
  countryName: string;
  investorName: string;
  investorEmail: string;
  organisation: string;
  role: string;
  note: string;
  /** Project titles of interest. */
  projects: string[];
  /** "Tuesday 8 December, 09:00–09:20", in time order. */
  times: string[];
  at: Date;
}

export interface MailContent {
  subject: string;
  text: string;
}

function link(path: string): string {
  return `${appConfig.url.replace(/\/+$/, "")}${path}`;
}

function signupLines(facts: SignupMailFacts, withEmail: boolean): string[] {
  return [
    `Country: ${facts.countryName}`,
    `Who will attend: ${facts.investorName}${withEmail ? ` <${facts.investorEmail}>` : ""}, ${facts.role}, ${facts.organisation}`,
    "Projects of interest:",
    ...facts.projects.map((p) => `- ${p}`),
    "Times they could make (UAE time):",
    ...facts.times.map((t) => `- ${t}`),
    ...(facts.note ? ["", "Note:", facts.note] : []),
  ];
}

const WHAT: Record<SignupMailKind, string> = {
  new: "New meeting sign-up",
  updated: "Meeting sign-up changed",
  withdrawn: "Meeting sign-up withdrawn",
};

/** To the Summit team mailbox on every new, changed or withdrawn sign-up. Names the investor's address. */
export function summitSignupNotice(
  facts: SignupMailFacts,
  kind: SignupMailKind,
): MailContent {
  const lead =
    kind === "withdrawn"
      ? `${facts.investorName} <${facts.investorEmail}> withdrew their sign-up to meet the ${facts.countryName} delegation.`
      : `${facts.investorName} <${facts.investorEmail}> ${kind === "new" ? "signed up" : "changed their sign-up"} to meet the ${facts.countryName} delegation.`;
  return {
    subject: `${WHAT[kind]}: ${facts.countryName} (${facts.organisation})`,
    text: [
      lead,
      "",
      ...(kind === "withdrawn"
        ? [
            `Country: ${facts.countryName}`,
            `Organisation: ${facts.organisation}`,
          ]
        : signupLines(facts, true)),
      "",
      `${kind === "withdrawn" ? "Withdrawn" : "Saved"}: ${formatUaeTime(facts.at)}`,
      "All sign-ups, with a CSV download (sign-in needed):",
      link("/inbox"),
      "",
      `Reference: ${facts.signupId}`,
    ].join("\n"),
  };
}

/** To the country's focal point(s), with the WBG coordinator(s) in copy. */
export function countrySignupEmail(
  facts: SignupMailFacts,
  kind: SignupMailKind,
): MailContent {
  const lead =
    kind === "new"
      ? `An investor invited to the ${appConfig.summit.name} has signed up to meet the ${facts.countryName} delegation.`
      : kind === "updated"
        ? `An investor has changed their sign-up to meet the ${facts.countryName} delegation. The details below replace the earlier ones.`
        : `${facts.investorName} (${facts.organisation}) has withdrawn their sign-up to meet the ${facts.countryName} delegation.`;
  return {
    subject: `${appConfig.name}: ${WHAT[kind].toLowerCase()} for ${facts.countryName}`,
    text: [
      "Dear colleague,",
      "",
      lead,
      ...(kind === "withdrawn" ? [] : ["", ...signupLines(facts, false)]),
      "",
      `Sign-ups close on ${MEETING_SIGNUP.deadlineLabel}. The Summit team then allocates the bilateral meetings and confirms them to you and the investors by ${MEETING_SIGNUP.confirmationLabel}. You do not need to reply to this email.`,
      "",
      "You can see all sign-ups for your country in the portal:",
      link("/inbox"),
      "",
      `Reference: ${facts.signupId}`,
      "",
      "Kind regards,",
      "The Water Investment Summit team",
      `${appConfig.name}, ${appConfig.tagline}`,
    ].join("\n"),
  };
}

// Email texts for meeting requests (M5, PLAN v0.3 F6 and 0a.5). Pure. British spelling, no em dashes. A first draft
// for the Summit team to adjust. The note is the investor's own text, so it is quoted as given.

import { appConfig } from "@/lib/config";
import { formatUaeTime } from "@/lib/submission/format";

export interface RequestMailFacts {
  requestId: string;
  projectTitle: string;
  countryName: string;
  investorName: string;
  investorEmail: string;
  organisation: string;
  role: string;
  note: string;
  createdAt: Date;
}

export interface MailContent {
  subject: string;
  text: string;
}

function link(path: string): string {
  return `${appConfig.url.replace(/\/+$/, "")}${path}`;
}

function requestLines(facts: RequestMailFacts): string[] {
  return [
    `Project: ${facts.projectTitle} (${facts.countryName})`,
    `From: ${facts.investorName}, ${facts.role}, ${facts.organisation}`,
    `Sent: ${formatUaeTime(facts.createdAt)}`,
    ...(facts.note ? ["", "Note:", facts.note] : []),
  ];
}

/** Notice to the Summit team mailbox on every new request (PLAN 0a.5). Names the investor's address. */
export function summitRequestNotice(facts: RequestMailFacts): MailContent {
  return {
    subject: `New meeting request: ${facts.projectTitle} (${facts.countryName})`,
    text: [
      `${facts.investorName} <${facts.investorEmail}> requested a bilateral meeting.`,
      "",
      ...requestLines(facts),
      "",
      "The country's focal point can accept or decline it in the portal (sign-in needed):",
      link("/inbox"),
      "",
      `Reference: ${facts.requestId}`,
    ].join("\n"),
  };
}

/**
 * To the country's focal point(s), with the WBG coordinator(s) in copy (PLAN F6). Sent only when
 * REQUEST_NOTIFY_FOCAL_POINTS is on. The investor's address is left out: the focal point sees it in the portal.
 */
export function focalPointRequestEmail(facts: RequestMailFacts): MailContent {
  return {
    subject: `${appConfig.name}: meeting request for ${facts.projectTitle}`,
    text: [
      "Dear colleague,",
      "",
      `An investor invited to the Water Investment Summit would like to meet about a project from ${facts.countryName}.`,
      "",
      ...requestLines(facts),
      "",
      "Please sign in to accept or decline the request:",
      link("/inbox"),
      "",
      `Reference: ${facts.requestId}`,
      "",
      "Kind regards,",
      "The Water Investment Summit team",
      `${appConfig.name}, ${appConfig.tagline}`,
    ].join("\n"),
  };
}

export type DecisionOutcome = "ACCEPTED" | "DECLINED";

/** To the investor when the country decides (PLAN F6). Sent only when REQUEST_NOTIFY_INVESTOR is on. */
export function investorDecisionEmail(
  facts: RequestMailFacts,
  outcome: DecisionOutcome,
): MailContent {
  const accepted = outcome === "ACCEPTED";
  return {
    subject: `${appConfig.name}: your meeting request was ${accepted ? "accepted" : "declined"} (${facts.projectTitle})`,
    text: [
      `Dear ${facts.investorName},`,
      "",
      accepted
        ? `${facts.countryName} has accepted your request for a bilateral meeting about ${facts.projectTitle}. The Summit team will be in touch about the time and place.`
        : `${facts.countryName} has declined your request for a bilateral meeting about ${facts.projectTitle}. Thank you for your interest in the project.`,
      "",
      "You can see all your requests in the portal:",
      link("/requests"),
      "",
      `Reference: ${facts.requestId}`,
      "",
      "Kind regards,",
      "The Water Investment Summit team",
      `${appConfig.name}, ${appConfig.tagline}`,
    ].join("\n"),
  };
}

// Investor registration with pre-approval (M13, PLAN v0.4 0b.17 to 0b.21). Pure and browser-safe, so the
// rules can be unit tested and the forms can share the labels.
//
// A registrant matches the pre-approved list when their exact email is an ApprovedContact, or their email
// domain is one of an ApprovedOrganisation's domains. Public email domains (gmail.com, outlook.com, ...) never
// match a domain, whatever an admin typed. Whether a match gives immediate access is decided by the caller
// (REGISTRATION_AUTO_APPROVE), because the portal cannot yet prove that the person owns the address.

import { OrganisationType } from "@/generated/prisma/enums";

/** PLAN v0.4 0b.16, in the order shown on the form. */
export const ORGANISATION_TYPE_LABEL: Record<OrganisationType, string> = {
  INFRASTRUCTURE_OPERATOR: "Infrastructure operator or developer",
  INVESTOR_FUND: "Investor or fund",
  DFI_MDB: "DFI or MDB",
  COMMERCIAL_BANK: "Commercial bank",
  ADVISER: "Transaction or technical adviser",
  OTHER: "Other",
};

export const ORGANISATION_TYPES = Object.keys(
  ORGANISATION_TYPE_LABEL,
) as OrganisationType[];

/** Free email services: never a pre-approved organisation's domain (PLAN v0.4 0b.18). */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "qq.com",
  "163.com",
  "126.com",
  "tutanota.com",
  "fastmail.com",
  "hey.com",
]);

const DOMAIN =
  /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The lower-case domain of an email address, or "" when there is none. */
export function emailDomain(email: string): string {
  const at = email.trim().lastIndexOf("@");
  return at < 0
    ? ""
    : email
        .trim()
        .slice(at + 1)
        .toLowerCase();
}

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase());
}

/**
 * Domains typed by an admin ("bank.example, @fund.example", one per line or separated by commas or spaces):
 * lower case, without "@", each a valid domain and never a public email domain. Returns the clean list or the
 * first problem.
 */
export function parseEmailDomains(
  text: string,
): { ok: true; domains: string[] } | { ok: false; error: string } {
  const parts = text
    .split(/[\s,;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  for (const d of parts) {
    if (!DOMAIN.test(d)) {
      return {
        ok: false,
        error: `"${d.slice(0, 60)}" is not an email domain.`,
      };
    }
    if (isPublicEmailDomain(d)) {
      return {
        ok: false,
        error: `${d} is a public email service and cannot be pre-approved. Add the people by email instead.`,
      };
    }
  }
  return { ok: true, domains: [...new Set(parts)] };
}

export type PreApprovalMatch =
  | { kind: "contact"; email: string; organisationName: string | null }
  | { kind: "domain"; domain: string; organisationName: string };

/** The pre-approved list, as the server loads it. */
export interface PreApprovedList {
  contacts: { email: string; organisationName: string | null }[];
  organisations: { name: string; emailDomains: string[] }[];
}

/** Does this email match the pre-approved list? An exact contact wins over a domain. */
export function preApprovalMatch(
  email: string,
  list: PreApprovedList,
): PreApprovalMatch | null {
  const address = email.trim().toLowerCase();
  const contact = list.contacts.find((c) => c.email.toLowerCase() === address);
  if (contact) {
    return {
      kind: "contact",
      email: address,
      organisationName: contact.organisationName,
    };
  }
  const domain = emailDomain(address);
  if (!domain || isPublicEmailDomain(domain)) return null;
  const organisation = list.organisations.find((o) =>
    o.emailDomains.some((d) => d.toLowerCase() === domain),
  );
  return organisation
    ? { kind: "domain", domain, organisationName: organisation.name }
    : null;
}

/** A short description of a match for the admin queue and the Summit notice. */
export function describeMatch(match: PreApprovalMatch | null): string {
  if (!match) return "Not on the pre-approved list";
  if (match.kind === "contact") {
    return match.organisationName
      ? `Pre-approved contact (${match.organisationName})`
      : "Pre-approved contact";
  }
  return `Pre-approved organisation (${match.organisationName}, ${match.domain})`;
}

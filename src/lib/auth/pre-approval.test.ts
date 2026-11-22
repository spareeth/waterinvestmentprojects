import { describe, expect, it } from "vitest";
import { describeDemand, summariseDemand } from "@/lib/requests/demand";
import {
  describeMatch,
  emailDomain,
  isPublicEmailDomain,
  ORGANISATION_TYPE_LABEL,
  parseEmailDomains,
  preApprovalMatch,
} from "./pre-approval";
import {
  registrationNotice,
  registrationOutcomeEmail,
} from "./registration-emails";

const list = {
  contacts: [
    { email: "ceo@bank.example", organisationName: "Bank One" },
    { email: "person@gmail.com", organisationName: null },
  ],
  organisations: [
    { name: "Fund Two", emailDomains: ["fund-two.example"] },
    { name: "Sneaky", emailDomains: ["gmail.com"] },
  ],
};

describe("pre-approval (M13)", () => {
  it("uses the PLAN v0.4 0b.16 organisation types", () => {
    expect(Object.values(ORGANISATION_TYPE_LABEL)).toEqual([
      "Infrastructure operator or developer",
      "Investor or fund",
      "DFI or MDB",
      "Commercial bank",
      "Transaction or technical adviser",
      "Other",
    ]);
  });

  it("matches an exact contact first, then an organisation's domain", () => {
    expect(preApprovalMatch(" CEO@Bank.example ", list)).toEqual({
      kind: "contact",
      email: "ceo@bank.example",
      organisationName: "Bank One",
    });
    expect(preApprovalMatch("analyst@fund-two.example", list)).toEqual({
      kind: "domain",
      domain: "fund-two.example",
      organisationName: "Fund Two",
    });
    expect(preApprovalMatch("x@other.example", list)).toBeNull();
    // A subdomain is a different domain.
    expect(preApprovalMatch("x@eu.fund-two.example", list)).toBeNull();
  });

  it("never matches a public email domain, but does match a listed person at one", () => {
    expect(preApprovalMatch("anyone@gmail.com", list)).toBeNull();
    expect(preApprovalMatch("person@gmail.com", list)?.kind).toBe("contact");
    expect(isPublicEmailDomain("Outlook.com")).toBe(true);
    expect(emailDomain("a@B.Example")).toBe("b.example");
  });

  it("cleans the domains an admin types and refuses public or broken ones", () => {
    expect(
      parseEmailDomains(" @Bank.example, fund.example\nbank.example "),
    ).toEqual({
      ok: true,
      domains: ["bank.example", "fund.example"],
    });
    expect(parseEmailDomains("")).toEqual({ ok: true, domains: [] });
    expect(parseEmailDomains("hotmail.com").ok).toBe(false);
    expect(parseEmailDomains("not a domain!").ok).toBe(false);
    expect(parseEmailDomains("localhost").ok).toBe(false);
  });

  it("describes matches in words", () => {
    expect(describeMatch(null)).toBe("Not on the pre-approved list");
    expect(
      describeMatch(preApprovalMatch("analyst@fund-two.example", list)),
    ).toBe("Pre-approved organisation (Fund Two, fund-two.example)");
  });
});

describe("registration emails (M13)", () => {
  it("tell the Summit team the facts and where to decide, without em dashes", () => {
    const notice = registrationNotice({
      name: "Ada",
      email: "ada@fund-two.example",
      organisation: "Fund Two",
      organisationType: "INVESTOR_FUND",
      jobTitle: "Partner",
      match: preApprovalMatch("ada@fund-two.example", list),
      approved: false,
    });
    expect(notice.subject).toBe(
      "New registration waiting for approval: Fund Two",
    );
    expect(notice.text).toContain("Organisation type: Investor or fund");
    expect(notice.text).toContain("Pre-approved organisation (Fund Two");
    const approved = registrationOutcomeEmail("Ada", "approve");
    const rejected = registrationOutcomeEmail("Ada", "reject");
    for (const text of [notice.text, approved.text, rejected.text]) {
      expect(text).not.toContain("—");
    }
    expect(approved.text).toMatch(/\/sign-in$/m);
  });
});

describe("demand summary (M13)", () => {
  it("counts per project in the form's order and says it in words", () => {
    const demand = summariseDemand([
      { projectId: "p", organisationType: null },
      { projectId: "p", organisationType: "DFI_MDB" },
      { projectId: "p", organisationType: "INVESTOR_FUND" },
      { projectId: "p", organisationType: "INVESTOR_FUND" },
      { projectId: "q", organisationType: "OTHER" },
    ]);
    expect(describeDemand(demand.get("p"))).toBe(
      "4 meeting requests: Investor or fund 2, DFI or MDB 1, Not stated 1",
    );
    expect(describeDemand(demand.get("q"))).toBe("1 meeting request: Other 1");
    expect(describeDemand(undefined)).toBe("No meeting requests yet");
  });
});

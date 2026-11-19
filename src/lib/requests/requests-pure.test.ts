import { describe, expect, it } from "vitest";
import { appConfig } from "@/lib/config";
import { CSV_BOM, csvCell, toCsv } from "./csv";
import {
  focalPointRequestEmail,
  investorDecisionEmail,
  type RequestMailFacts,
  summitRequestNotice,
} from "./emails";
import { REQUEST_MESSAGES } from "./errors";
import { parseRequestInput, REQUEST_LIMITS } from "./input";

describe("csvCell", () => {
  it("leaves plain text alone and writes empty cells for missing values", () => {
    expect(csvCell("Fictional Water Fund")).toBe("Fictional Water Fund");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("quotes commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
  });

  it.each([
    [
      '=HYPERLINK("http://evil.example")',
      `"'=HYPERLINK(""http://evil.example"")"`,
    ],
    ["+1+2", "'+1+2"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\t=1", "'\t=1"],
    ["  =1", "'  =1"],
    ["\r=1", `"'\r=1"`],
  ])("neutralises formula %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("writes dates as ISO 8601", () => {
    expect(csvCell(new Date("2026-12-09T11:30:00Z"))).toBe(
      "2026-12-09T11:30:00.000Z",
    );
  });
});

describe("toCsv", () => {
  it("adds a byte order mark, a header row and CRLF line ends", () => {
    const csv = toCsv(["A", "B"], [["1", "x,y"]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1)).toBe('A,B\r\n1,"x,y"\r\n');
  });
});

describe("parseRequestInput", () => {
  it("accepts organisation, role and an optional note, tidied", () => {
    const parsed = parseRequestInput({
      organisation: "  Fictional   Water Fund ",
      role: "Investment\tdirector",
      note: "",
    });
    expect(parsed).toEqual({
      ok: true,
      input: {
        organisation: "Fictional Water Fund",
        role: "Investment director",
        note: "",
      },
    });
  });

  it("keeps line breaks in the note but removes control characters", () => {
    const parsed = parseRequestInput({
      organisation: "Org",
      role: "Role",
      note: "First line\r\nSecond\u0007 line",
    });
    expect(parsed.ok && parsed.input.note).toBe("First line\nSecond line");
  });

  it("requires organisation and role", () => {
    const parsed = parseRequestInput({
      organisation: "   ",
      role: "",
      note: "x",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
        "organisation",
        "role",
      ]);
    }
  });

  it("limits the lengths", () => {
    const parsed = parseRequestInput({
      organisation: "o".repeat(REQUEST_LIMITS.organisation + 1),
      role: "r".repeat(REQUEST_LIMITS.role + 1),
      note: "n".repeat(REQUEST_LIMITS.note + 1),
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(Object.keys(parsed.fieldErrors)).toHaveLength(3);
  });
});

const facts: RequestMailFacts = {
  requestId: "req-1",
  projectTitle: "Fictional Desalination Plant",
  countryName: "Country A",
  investorName: "Ivy Investor",
  investorEmail: "ivy@fund.example",
  organisation: "Fictional Water Fund",
  role: "Investment director",
  note: "We would like to discuss the PPP structure.",
  createdAt: new Date("2026-11-25T08:00:00Z"),
};

describe("request emails", () => {
  const all = [
    summitRequestNotice(facts),
    focalPointRequestEmail(facts),
    investorDecisionEmail(facts, "ACCEPTED"),
    investorDecisionEmail(facts, "DECLINED"),
  ];

  it("contain no em dashes and name the reference", () => {
    for (const mail of all) {
      expect(mail.subject + mail.text).not.toMatch(/—/);
      expect(mail.text).toContain("req-1");
    }
  });

  it("give the Summit team the investor's address and a link to the inbox", () => {
    const notice = summitRequestNotice(facts);
    expect(notice.text).toContain("ivy@fund.example");
    expect(notice.text).toContain(`${appConfig.url.replace(/\/+$/, "")}/inbox`);
    expect(notice.text).toContain(facts.note);
  });

  it("tell the investor the outcome", () => {
    expect(investorDecisionEmail(facts, "ACCEPTED").subject).toContain(
      "accepted",
    );
    expect(investorDecisionEmail(facts, "DECLINED").text).toContain(
      "has declined",
    );
  });

  it("use the configured platform name", () => {
    expect(focalPointRequestEmail(facts).subject).toContain(appConfig.name);
  });
});

describe("request messages", () => {
  it("use no em dashes", () => {
    for (const message of Object.values(REQUEST_MESSAGES)) {
      expect(message).not.toMatch(/—/);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  describeFacts,
  matchPppModel,
  matchSector,
  matchStage,
  parseSize,
  readTeaserFacts,
  tidyTitle,
} from "./facts";

// A fictional teaser laid out like the WBG template (text as pdf.js returns it, one box per line).
const TEMPLATE = `WATER FORWARD INVESTOR SUMMIT · UNWC 2026
FICTIONLAND — DESALINATION BOT IN PORT EXAMPLE
DESALINATION · Port Example/ NORTH COAST UTILITY
INVESTMENT TEASER
PROJECT TYPE
Greenfield desalination
PPP MODEL
Build-Operate-Transfer
(25 years)
TOTAL PROJECT SIZE
US$120-150m CAPEX,
Capacity of 50,000 m3/day
TARGET BID DEADLINE
June 2027 (TBC)
INVESTMENT OPPORTUNITY
A fictional plant for testing.
TENDER FORMAT
Open tender
DEVELOPMENT STAGE
Feasibility study completed
PROJECT CONTACT Test Person`;

describe("readTeaserFacts", () => {
  it("reads the WBG template", () => {
    expect(
      readTeaserFacts(TEMPLATE, { countryNames: ["Fictionland"] }),
    ).toEqual({
      title: "Desalination BOT in Port Example",
      sector: "Desalination",
      region: "Port Example / NORTH COAST UTILITY",
      pppModel: "BOT",
      sizeMinUsdMillion: 120,
      sizeMaxUsdMillion: 150,
      developmentStage: "Post-feasibility",
    });
  });

  it("only takes a title after a known country name", () => {
    expect(readTeaserFacts(TEMPLATE).title).toBeUndefined();
    expect(
      readTeaserFacts("KENYA - NAIROBI NRW REDUCTION\nNRW · Nairobi").title,
    ).toBe("Nairobi NRW Reduction");
  });

  it("reads 'Label: value' lines too", () => {
    const facts = readTeaserFacts(
      "PPP model: Concession (30 years)\nProject size: USD 2.5 billion\nDevelopment stage: Pre-tender",
    );
    expect(facts).toEqual({
      pppModel: "Concession",
      sizeMinUsdMillion: 2500,
      sizeMaxUsdMillion: 2500,
      developmentStage: "Pre-tender",
    });
  });

  it("returns nothing it is not sure about", () => {
    expect(readTeaserFacts("A scanned page with no labels")).toEqual({});
    expect(
      readTeaserFacts("PPP MODEL\nTo be discussed\nSTAGE\nOngoing"),
    ).toEqual({});
  });
});

describe("value matching", () => {
  it.each([
    [
      "Management/Affermage (3+12 year proposed)",
      "Management contract and affermage",
    ],
    ["Affermage", "Affermage"],
    ["DBFOM", "DBFOM"],
    ["Design-Build-Operate", "DBO"],
    ["Performance-based NRW contract", "Performance-based contract (PBC)"],
    ["O&M contract", "O&M"],
    ["TBD", "Other / TBD"],
  ])("PPP %s", (text, expected) => {
    expect(matchPppModel(text)).toBe(expected);
  });

  it.each([
    ["Tender RFP", "RFP"],
    ["RFQ launched", "RFQ"],
    ["Transaction advisor appointed", "Transaction advisory"],
    ["Feasibility study under way", "Feasibility in progress"],
    ["Concept note", "Conceptual"],
  ])("stage %s", (text, expected) => {
    expect(matchStage(text)).toBe(expected);
  });

  it.each([
    ["WATER SUPPLY", "Water supply"],
    ["Wastewater treatment and reuse", "Wastewater and reuse"],
    ["Sewerage", "Wastewater treatment"],
    ["Non-revenue water", "Non-revenue water (NRW)"],
  ])("sector %s", (text, expected) => {
    expect(matchSector(text)).toBe(expected);
  });
});

describe("parseSize", () => {
  it.each([
    ["Up to US$294.3m CAPEX", { sizeMaxUsdMillion: 294.3 }],
    ["US$ 45 million", { sizeMinUsdMillion: 45, sizeMaxUsdMillion: 45 }],
    ["USD 1.2bn", { sizeMinUsdMillion: 1200, sizeMaxUsdMillion: 1200 }],
    ["US$50m to US$80m", { sizeMinUsdMillion: 50, sizeMaxUsdMillion: 80 }],
    ["USD 75,000,000", { sizeMinUsdMillion: 75, sizeMaxUsdMillion: 75 }],
    ["At least US$10m", { sizeMinUsdMillion: 10 }],
    ["Capacity of 98 m3/day", {}],
    ["To be confirmed", {}],
  ])("%s", (text, expected) => {
    expect(parseSize(text)).toEqual(expected);
  });
});

describe("tidyTitle and describeFacts", () => {
  it("turns capitals into title case and keeps acronyms", () => {
    expect(tidyTitle("MANAGEMENT AND AFFERMAGE PPP IN NORTH PORT")).toBe(
      "Management and Affermage PPP in North Port",
    );
    expect(tidyTitle("Already Mixed Case")).toBe("Already Mixed Case");
  });

  it("names the filled fields once each", () => {
    expect(
      describeFacts([
        "title",
        "sizeMinUsdMillion",
        "sizeMaxUsdMillion",
        "pppModel",
      ]),
    ).toBe("title, size and PPP model");
  });
});

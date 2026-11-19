import { describe, expect, it } from "vitest";
import {
  formatUsdRange,
  hasActiveFilters,
  parsePipelineFilters,
  pipelineFilterWhere,
  pipelineHref,
  sizeBucketWhere,
} from "./filters";

describe("parsePipelineFilters", () => {
  it("reads every filter from the query", () => {
    expect(
      parsePipelineFilters({
        q: "desalination",
        country: "xab",
        sector: "Wastewater and reuse",
        ppp: "Concession",
        stage: "Feasibility",
        size: "100-250",
      }),
    ).toEqual({
      q: "desalination",
      country: "XAB",
      sector: "Wastewater and reuse",
      ppp: "Concession",
      stage: "Feasibility",
      size: "100-250",
    });
  });

  it("returns no filters for an empty query", () => {
    expect(parsePipelineFilters({})).toEqual({});
    expect(parsePipelineFilters({ q: "", sector: "   " })).toEqual({});
    expect(hasActiveFilters(parsePipelineFilters({}))).toBe(false);
  });

  it("takes only the first value of a repeated key", () => {
    expect(
      parsePipelineFilters({ sector: ["Irrigation", "Desalination"] }),
    ).toEqual({ sector: "Irrigation" });
    const params = new URLSearchParams("country=XAA&country=XAB&size=lt50");
    expect(parsePipelineFilters(params)).toEqual({
      country: "XAA",
      size: "lt50",
    });
  });

  it("drops malformed country codes and unknown size buckets", () => {
    expect(parsePipelineFilters({ country: "XA" })).toEqual({});
    expect(parsePipelineFilters({ country: "X'A" })).toEqual({});
    expect(parsePipelineFilters({ country: "ABCD" })).toEqual({});
    expect(parsePipelineFilters({ size: "all" })).toEqual({});
    expect(parsePipelineFilters({ size: "__proto__" })).toEqual({});
  });

  it("ignores keys it does not know, such as a status or country id", () => {
    expect(
      parsePipelineFilters({ status: "DRAFT", countryId: "x", tier: "1" }),
    ).toEqual({});
  });

  it("trims, collapses whitespace, strips control characters and caps length", () => {
    expect(parsePipelineFilters({ q: "  water \n\t reuse  " })).toEqual({
      q: "water reuse",
    });
    expect(parsePipelineFilters({ q: "a\u0000b" })).toEqual({ q: "a b" });
    expect(parsePipelineFilters({ q: "x".repeat(500) }).q).toHaveLength(120);
  });
});

describe("pipelineFilterWhere", () => {
  it("is an empty AND without filters, so it never narrows or widens", () => {
    expect(pipelineFilterWhere({})).toEqual({ AND: [] });
  });

  it("ANDs one narrowing condition per filter and never touches status", () => {
    const where = pipelineFilterWhere({
      q: "reuse",
      country: "XAA",
      sector: "Irrigation",
      ppp: "Lease",
      stage: "Concept",
      size: "lt50",
    });
    expect(where.AND).toHaveLength(6);
    expect(JSON.stringify(where)).not.toContain("status");
    expect(where.AND).toContainEqual({ country: { iso3: "XAA" } });
    expect(where.AND).toContainEqual({ sector: "Irrigation" });
    expect(where.AND).toContainEqual({ pppModel: "Lease" });
    expect(where.AND).toContainEqual({ developmentStage: "Concept" });
    expect(where.AND).toContainEqual({
      OR: [
        { title: { contains: "reuse", mode: "insensitive" } },
        { country: { name: { contains: "reuse", mode: "insensitive" } } },
      ],
    });
  });

  it("matches size buckets by overlap with the indicative range", () => {
    expect(sizeBucketWhere("gte250")).toEqual({
      AND: [
        {
          OR: [
            { sizeMaxUsd: { gte: 250_000_000 } },
            { sizeMaxUsd: null, sizeMinUsd: { gte: 250_000_000 } },
          ],
        },
      ],
    });
    expect(sizeBucketWhere("50-100").AND).toHaveLength(2);
  });
});

describe("pipelineHref", () => {
  it("writes filters in a stable order and leaves empty ones out", () => {
    expect(pipelineHref({})).toBe("/pipeline");
    expect(pipelineHref({ size: "lt50", country: "XAA", q: "a b" })).toBe(
      "/pipeline?q=a+b&country=XAA&size=lt50",
    );
  });

  it("round-trips through the parser", () => {
    const filters = {
      q: "water & reuse",
      sector: "Wastewater and reuse",
      stage: "Pre-feasibility",
    };
    const href = pipelineHref(filters);
    const parsed = parsePipelineFilters(
      new URLSearchParams(href.split("?")[1]),
    );
    expect(parsed).toEqual(filters);
  });
});

describe("formatUsdRange", () => {
  it("formats ranges, single values and open ends", () => {
    expect(formatUsdRange(180_000_000, 220_000_000)).toBe(
      "USD 180 to 220 million",
    );
    expect(formatUsdRange(60_000_000, 60_000_000)).toBe("USD 60 million");
    expect(formatUsdRange(800_000_000, 1_200_000_000)).toBe(
      "USD 800 million to 1.2 billion",
    );
    expect(formatUsdRange(2_500_000, null)).toBe("From USD 2.5 million");
    expect(formatUsdRange(null, 90_000_000)).toBe("Up to USD 90 million");
    expect(formatUsdRange(null, null)).toBeNull();
  });

  it("uses no em dashes", () => {
    expect(formatUsdRange(1_000_000, 2_000_000)).toBe("USD 1 to 2 million");
    expect(formatUsdRange(1_000_000, 2_000_000)).not.toMatch(/—/);
  });
});

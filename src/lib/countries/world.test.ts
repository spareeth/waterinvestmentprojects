import { describe, expect, it } from "vitest";
import {
  normaliseCountryText,
  searchWorldCountries,
  WORLD_COUNTRIES,
} from "./world";

describe("world country list", () => {
  it("has unique three-letter codes and names", () => {
    const codes = WORLD_COUNTRIES.map((c) => c.iso3);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
    const names = WORLD_COUNTRIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(WORLD_COUNTRIES.length).toBeGreaterThan(240);
  });
});

describe("searchWorldCountries", () => {
  it("finds a country from its first letters", () => {
    expect(searchWorldCountries("tanz")[0]).toEqual({
      iso3: "TZA",
      name: "Tanzania",
    });
  });

  it("puts names starting with the text before names that only contain it", () => {
    const names = searchWorldCountries("sa").map((c) => c.name);
    expect(names[0]).toBe("Saint Barthélemy");
    expect(names.every((n) => /(^|\s)sa/i.test(n))).toBe(true);
  });

  it("matches a later word, an ISO code, other names and text without accents", () => {
    expect(searchWorldCountries("leone")[0]?.iso3).toBe("SLE");
    expect(searchWorldCountries("lka")[0]?.iso3).toBe("LKA");
    expect(searchWorldCountries("drc")[0]?.iso3).toBe("COD");
    expect(searchWorldCountries("ivory")[0]?.iso3).toBe("CIV");
    expect(searchWorldCountries("cote")[0]?.iso3).toBe("CIV");
    expect(searchWorldCountries("turkey")[0]?.iso3).toBe("TUR");
  });

  it("returns nothing for empty text and keeps to the limit", () => {
    expect(searchWorldCountries("   ")).toEqual([]);
    expect(searchWorldCountries("a", 5)).toHaveLength(5);
  });

  it("normalises case, accents and punctuation", () => {
    expect(normaliseCountryText("  Côte d'Ivoire ")).toBe("cote d ivoire");
  });
});

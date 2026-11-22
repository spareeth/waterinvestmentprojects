// Project key facts read from the text of a one-page teaser (PLAN v0.4 0b.7, 22 Nov: "the information on the
// title, size, PPP model etc. should be extracted from the file uploaded"). Pure: the PDF text comes from
// pdf-text.ts. Built for the WBG teaser template (country and title on one line, then "SECTOR · region", then
// labelled boxes such as PPP MODEL, TOTAL PROJECT SIZE and DEVELOPMENT STAGE), and tolerant of "Label: value"
// lines. Anything it is not sure about stays empty; an admin reviews every project before publishing.

import { normaliseCountryText, WORLD_COUNTRIES } from "@/lib/countries/world";
import {
  DEVELOPMENT_STAGE_SUGGESTIONS,
  PPP_MODEL_SUGGESTIONS,
  SECTOR_SUGGESTIONS,
} from "@/lib/workspace/project-input";

export interface TeaserFacts {
  title?: string;
  sector?: (typeof SECTOR_SUGGESTIONS)[number];
  region?: string;
  pppModel?: (typeof PPP_MODEL_SUGGESTIONS)[number];
  /** USD million. */
  sizeMinUsdMillion?: number;
  /** USD million. */
  sizeMaxUsdMillion?: number;
  developmentStage?: (typeof DEVELOPMENT_STAGE_SUGGESTIONS)[number];
}

/** The labelled boxes of the template. A value runs from its label to the next label. */
const LABELS = [
  "project type",
  "ppp model",
  "ppp modality",
  "total project size",
  "project size",
  "investment size",
  "total investment",
  "estimated investment",
  "estimated cost",
  "target bid deadline",
  "target financial close",
  "investment opportunity",
  "financing & commercial structure",
  "financing and commercial structure",
  "revenue model",
  "off-taker / counterparty",
  "private capital / financing sought",
  "public / concessional support",
  "key risks & mitigants",
  "project readiness",
  "feedback sought from investors",
  "other available risk mitigation tools",
  "tender format",
  "development stage",
  "development phase",
  "project stage",
  "stage",
  "project contact",
  "investment teaser",
] as const;

const SIZE_LABELS = [
  "total project size",
  "project size",
  "investment size",
  "total investment",
  "estimated investment",
  "estimated cost",
];
const PPP_LABELS = ["ppp model", "ppp modality"];
const STAGE_LABELS = [
  "development stage",
  "development phase",
  "project stage",
  "stage",
];

function key(line: string): string {
  return line
    .toLowerCase()
    .replace(/[:–—-]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLabel(line: string): boolean {
  const k = key(line);
  return (LABELS as readonly string[]).some(
    (l) => k === l || k.startsWith(`${l} –`) || k.startsWith(`${l} -`),
  );
}

/** The text after a label: "Label: value" on the same line, or the lines below it up to the next label. */
function valueOf(
  lines: string[],
  labels: readonly string[],
): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lower = line.toLowerCase();
    for (const label of labels) {
      if (key(line) === label) {
        const out: string[] = [];
        for (let j = i + 1; j < lines.length && out.length < 4; j++) {
          const next = lines[j].trim();
          if (!next || isLabel(next)) break;
          out.push(next);
        }
        if (out.length > 0) return out.join(" ");
      } else if (lower.startsWith(`${label}:`)) {
        const rest = line.slice(label.length + 1).trim();
        if (rest) return rest;
      }
    }
  }
  return undefined;
}

const COUNTRY_NAMES = new Set(
  WORLD_COUNTRIES.map((c) => normaliseCountryText(c.name)),
);
COUNTRY_NAMES.add("drc");
COUNTRY_NAMES.add("dr congo");
COUNTRY_NAMES.add("cote d ivoire");
COUNTRY_NAMES.add("turkey");
COUNTRY_NAMES.add("tanzania");

const ACRONYMS = new Set([
  "PPP",
  "BOT",
  "BOO",
  "DBO",
  "DBOM",
  "DBFOM",
  "DBFOMT",
  "NRW",
  "PBC",
  "O&M",
  "WTP",
  "WWTP",
  "STP",
  "EPC",
  "USD",
  "UN",
  "UNWC",
  "IPP",
  "IWP",
  "SWRO",
  "RO",
  "PV",
  "WBG",
  "II",
  "III",
  "IV",
  "EPAS",
  "MLD",
  "CAPEX",
  "OPEX",
]);
const SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/** Titles typed in capitals read better in title case; acronyms stay in capitals. */
export function tidyTitle(raw: string): string {
  const title = raw.replace(/\s+/g, " ").trim();
  if (/[a-z]/.test(title)) return title;
  return title
    .split(" ")
    .map((word, i) => {
      const bare = word.replace(/[^A-Z0-9&]/g, "");
      if (ACRONYMS.has(bare) || /\d/.test(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(
        /(^|[-/(])([a-z])/g,
        (_, p, c) => p + c.toUpperCase(),
      );
    })
    .join(" ");
}

/**
 * "ANGOLA — PROJECT NAME": the title is what follows a country name and a dash. `extra` adds the project's own
 * country name as the portal spells it.
 */
function titleAndHeaderIndex(
  lines: string[],
  extra: readonly string[],
): { title?: string; index: number } {
  const names = new Set([...COUNTRY_NAMES, ...extra.map(normaliseCountryText)]);
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const m =
      /^(.{2,60}?)\s*[—–]\s*(.{3,200})$/.exec(lines[i].trim()) ??
      /^(.{2,60}?)\s+-\s+(.{3,200})$/.exec(lines[i].trim());
    if (m && names.has(normaliseCountryText(m[1]))) {
      return { title: tidyTitle(m[2]), index: i };
    }
  }
  return { index: -1 };
}

export function matchSector(text: string): TeaserFacts["sector"] {
  const t = normaliseCountryText(text);
  const exact = SECTOR_SUGGESTIONS.find((s) => normaliseCountryText(s) === t);
  if (exact) return exact;
  if (/desalinat/.test(t)) return "Desalination";
  if (/non revenue|\bnrw\b/.test(t)) return "Non-revenue water (NRW)";
  if (/irrigat/.test(t)) return "Irrigation infrastructure";
  if (/sludge|biosolid/.test(t)) return "Sludge";
  if (/wastewater|sewer|sanitation/.test(t)) {
    if (/reuse|recycl/.test(t)) return "Wastewater and reuse";
    if (/supply/.test(t)) return "Water supply and wastewater";
    return "Wastewater treatment";
  }
  if (/treatment/.test(t)) return "Water treatment";
  if (/supply|distribution/.test(t)) return "Water supply";
  return undefined;
}

export function matchPppModel(text: string): TeaserFacts["pppModel"] {
  const t = text.toLowerCase();
  if (/\bdbfomt\b/.test(t)) return "DBFOMT";
  if (/\bdbfom\b/.test(t)) return "DBFOM";
  if (/\bdbom\b/.test(t)) return "DBOM";
  if (/\bdbo\b|design[- ]build[- ]operate/.test(t)) return "DBO";
  if (/\bbot\b|build[- ]operate[- ]transfer/.test(t)) return "BOT";
  if (/performance[- ]based|\bpbc\b/.test(t))
    return "Performance-based contract (PBC)";
  if (/management/.test(t) && /affermage|lease/.test(t)) {
    return "Management contract and affermage";
  }
  if (/affermage|\blease\b/.test(t)) return "Affermage";
  if (/concession/.test(t)) return "Concession";
  if (/\bo\s*&\s*m\b|operation(s)? and maintenance/.test(t)) return "O&M";
  if (/\btbd\b|\btbc\b|to be (determined|confirmed|defined)/.test(t)) {
    return "Other / TBD";
  }
  return undefined;
}

export function matchStage(text: string): TeaserFacts["developmentStage"] {
  const t = text.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(t)) return "RFP";
  if (/\brfq\b|request for qualifications?|prequalification/.test(t))
    return "RFQ";
  if (/pre-?tender|tender preparation/.test(t)) return "Pre-tender";
  if (/transaction advis/.test(t)) return "Transaction advisory";
  if (/due diligence/.test(t)) return "Due diligence";
  if (
    /post-?feasibility|feasibility (study )?(is )?(completed?|done|finished)/.test(
      t,
    )
  ) {
    return "Post-feasibility";
  }
  if (/feasibility/.test(t)) return "Feasibility in progress";
  if (/design/.test(t)) return "Design in progress";
  if (/concept/.test(t)) return "Conceptual";
  return undefined;
}

function toNumber(raw: string): number | null {
  let s = raw.trim();
  // "1,250" (thousands) or "1,25" (decimal comma).
  s = /,\d{3}(?!\d)/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toMillion(value: number, unit: string | undefined): number | null {
  const u = (unit ?? "").toLowerCase();
  if (u.startsWith("b")) return value * 1000;
  if (u.startsWith("m")) return value;
  if (u.startsWith("k") || u === "thousand") return value / 1000;
  // No unit: a large number is whole dollars; a small one is ambiguous, so leave it.
  return value >= 100_000 ? value / 1_000_000 : null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** "Up to US$294.3m", "USD 50-80 million", "US$1.2bn": the size in USD million. */
export function parseSize(
  text: string,
): Pick<TeaserFacts, "sizeMinUsdMillion" | "sizeMaxUsdMillion"> {
  const cur = String.raw`(?:US\$|USD|\$|US dollars?)`;
  const num = String.raw`(\d[\d,]*(?:\.\d+)?)`;
  const unit = String.raw`(bn|billion|b|mn|million|m|k|thousand)?\b`;
  const range = new RegExp(
    String.raw`${cur}\s*${num}\s*${unit}\s*(?:-|–|—|to)\s*(?:${cur})?\s*${num}\s*${unit}`,
    "i",
  );
  const single = new RegExp(String.raw`${cur}\s*${num}\s*${unit}`, "i");
  const after = new RegExp(
    String.raw`${num}\s*(bn|billion|mn|million|m)\b\s*(?:US\$|USD|US dollars?)`,
    "i",
  );

  const r = range.exec(text);
  if (r) {
    const a = toNumber(r[1]);
    const b = toNumber(r[3]);
    const unitB = r[4] ?? r[2];
    const unitA = r[2] ?? unitB;
    const min = a === null ? null : toMillion(a, unitA);
    const max = b === null ? null : toMillion(b, unitB);
    if (min !== null && max !== null && min <= max) {
      return { sizeMinUsdMillion: round(min), sizeMaxUsdMillion: round(max) };
    }
  }
  const s = single.exec(text) ?? after.exec(text);
  if (!s) return {};
  const value = toNumber(s[1]);
  const million = value === null ? null : toMillion(value, s[2]);
  if (million === null || million <= 0) return {};
  const before = text.slice(0, s.index).toLowerCase();
  if (/(up to|maximum|max\.?|not exceeding|below|under)\s*$/.test(before)) {
    return { sizeMaxUsdMillion: round(million) };
  }
  if (/(at least|minimum|min\.?|over|above|from|more than)\s*$/.test(before)) {
    return { sizeMinUsdMillion: round(million) };
  }
  return {
    sizeMinUsdMillion: round(million),
    sizeMaxUsdMillion: round(million),
  };
}

/** Everything the teaser text tells about the project. `countryNames`: the project's country, as the portal names it. */
export function readTeaserFacts(
  text: string,
  { countryNames = [] }: { countryNames?: readonly string[] } = {},
): TeaserFacts {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const facts: TeaserFacts = {};

  const { title, index } = titleAndHeaderIndex(lines, countryNames);
  if (title) facts.title = title.slice(0, 200);
  // The line under the title: "SECTOR · region".
  const header = index >= 0 ? lines[index + 1] : undefined;
  if (header && /[·•|]/.test(header)) {
    const [left, ...rest] = header.split(/\s*[·•|]\s*/);
    const sector = matchSector(left);
    if (sector) facts.sector = sector;
    const region = rest
      .join(", ")
      .replace(/\s*\/\s*/g, " / ")
      .trim();
    if (region) facts.region = region.slice(0, 120);
  }

  const ppp = valueOf(lines, PPP_LABELS);
  if (ppp) {
    const model = matchPppModel(ppp);
    if (model) facts.pppModel = model;
  }
  const size = valueOf(lines, SIZE_LABELS);
  if (size) Object.assign(facts, parseSize(size));
  const stage = valueOf(lines, STAGE_LABELS);
  if (stage) {
    const s = matchStage(stage);
    if (s) facts.developmentStage = s;
  }
  return facts;
}

/** Field names that the facts fill, for audit and messages. */
export function factFields(facts: TeaserFacts): string[] {
  return Object.entries(facts)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k]) => k);
}

export const FACT_LABEL: Record<keyof TeaserFacts, string> = {
  title: "title",
  sector: "sector",
  region: "region",
  pppModel: "PPP model",
  sizeMinUsdMillion: "size",
  sizeMaxUsdMillion: "size",
  developmentStage: "development stage",
};

/** "title, PPP model, size and development stage" */
export function describeFacts(fields: string[]): string {
  const names = [
    ...new Set(fields.map((f) => FACT_LABEL[f as keyof TeaserFacts] ?? f)),
  ];
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CountryContactRole, UserRole } from "@/generated/prisma/enums";
import { toCsv } from "@/lib/requests/csv";
import { planBulkAccounts, parseRole } from "./bulk-accounts-input";
import { planContactsImport, parseContactRole } from "./contacts-input";
import { type CsvTable, normaliseHeader, parseCsv } from "./csv-parse";
import {
  PROJECT_EXPORT_HEADER,
  planMetadataImport,
  type ProjectSnapshot,
} from "./metadata-import";
import { createZip, zipPath } from "./zip";

function table(text: string, maxRows = 100): CsvTable {
  const result = parseCsv(text, { maxRows });
  if (!result.ok) throw new Error(result.error);
  return result.table;
}

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, embedded line breaks, CRLF and a BOM", () => {
    const t = table(
      '﻿Name,Note\r\n"Smith, Jo","said ""hi""\nthen left"\r\nPlain , x \r\n',
    );
    expect(t.header).toEqual(["name", "note"]);
    expect(t.rows).toEqual([
      { line: 2, cells: ["Smith, Jo", 'said "hi"\nthen left'] },
      { line: 4, cells: ["Plain", "x"] },
    ]);
  });

  it("detects semicolons (Excel in many locales) and skips blank lines", () => {
    const t = table("a;b\n\n1;2\n;\n");
    expect(t.header).toEqual(["a", "b"]);
    expect(t.rows.map((r) => r.cells)).toEqual([["1", "2"]]);
  });

  it("removes the apostrophe our exports add before formula characters", () => {
    const t = table(`x\n'=SUM(A1)\n'plain\n'-\n`);
    expect(t.rows.map((r) => r.cells[0])).toEqual(["=SUM(A1)", "'plain", "-"]);
  });

  it("refuses empty files, unclosed quotes, too many rows and too much text", () => {
    expect(parseCsv("  \n", { maxRows: 5 }).ok).toBe(false);
    expect(parseCsv('a\n"open', { maxRows: 5 })).toMatchObject({
      ok: false,
      error: expect.stringContaining("line 2"),
    });
    expect(parseCsv("a\n1\n2\n3", { maxRows: 2 }).ok).toBe(false);
    expect(parseCsv("a\n1", { maxRows: 2, maxChars: 2 }).ok).toBe(false);
  });

  it("normalises header names", () => {
    expect(normaliseHeader(" Size min (USD million) ")).toBe(
      "size_min_usd_million",
    );
    expect(normaliseHeader("Job-title")).toBe("job_title");
  });

  it("round-trips our own export", () => {
    const csv = toCsv(["title", "ppp_model"], [["=evil()", "-"]]);
    const t = table(csv);
    expect(t.rows[0].cells).toEqual(["=evil()", "-"]);
  });
});

const projects: ProjectSnapshot[] = [
  {
    id: "p1",
    iso3: "AAA",
    countryName: "Country A",
    title: "Coastal Desalination",
    region: null,
    pppModel: null,
    sizeMinUsd: "100000000",
    sizeMaxUsd: "200000000",
    developmentStage: "Feasibility",
    updatedAt: "2026-11-18T10:00:00.000Z",
  },
  {
    id: "p2",
    iso3: "BBB",
    countryName: "Country B",
    title: "Same Title",
    region: null,
    pppModel: "Concession",
    sizeMinUsd: null,
    sizeMaxUsd: null,
    developmentStage: null,
    updatedAt: "2026-11-18T10:00:00.000Z",
  },
  {
    id: "p3",
    iso3: "BBB",
    countryName: "Country B",
    title: "same title",
    region: null,
    pppModel: null,
    sizeMinUsd: null,
    sizeMaxUsd: null,
    developmentStage: null,
    updatedAt: "2026-11-18T10:00:00.000Z",
  },
];

describe("planMetadataImport", () => {
  it("changes only the metadata, keeps blanks, clears '-', and canonicalises suggestions", () => {
    const plan = planMetadataImport(
      table(
        [
          PROJECT_EXPORT_HEADER.join(","),
          "p1,Country A,AAA,NEW TITLE,Energy,,X,concession,,250,-,DRAFT,,,",
        ].join("\n"),
      ),
      projects,
    );
    expect(plan.fileErrors).toEqual([]);
    expect(plan.ignoredColumns).toEqual([]);
    const [row] = plan.rows;
    expect(row.status).toBe("change");
    expect(row.data).toEqual({
      pppModel: "Concession",
      sizeMaxUsd: "250000000",
      developmentStage: null,
    });
    expect(Object.keys(row.data)).not.toContain("title");
    expect(row.changes).toContainEqual({
      field: "sizeMaxUsd",
      from: "200",
      to: "250",
    });
  });

  it("reports unchanged rows and row errors without stopping the file", () => {
    const plan = planMetadataImport(
      table(
        [
          "project_id,ppp_model,size_min_usd_million,size_max_usd_million",
          "p2,Concession,,",
          "nope,Lease,,",
          "p1,,abc,",
          "p3,,300,10",
          "p2,,,",
        ].join("\n"),
      ),
      projects,
    );
    expect(plan.rows.map((r) => r.status)).toEqual([
      "unchanged",
      "error",
      "error",
      "error",
      "error",
    ]);
    expect(plan.rows[1].errors[0]).toContain("No project has the id");
    expect(plan.rows[2].errors[0]).toContain("enter a number");
    expect(plan.rows[3].errors[0]).toContain("must not be below");
    expect(plan.rows[4].errors[0]).toContain("already on line 2");
    expect(plan.summary).toEqual({
      rows: 5,
      changes: 0,
      unchanged: 1,
      errors: 4,
    });
  });

  it("matches by ISO3 and title only when exactly one project fits", () => {
    const plan = planMetadataImport(
      table(
        [
          "iso3,title,development_stage",
          "aaa,  coastal   desalination ,Procurement",
          "BBB,Same Title,Concept",
          "CCC,Coastal Desalination,Concept",
        ].join("\n"),
      ),
      projects,
    );
    expect(plan.rows[0]).toMatchObject({ status: "change", projectId: "p1" });
    expect(plan.rows[1].errors[0]).toContain("More than one project");
    expect(plan.rows[2].errors[0]).toContain("No project of CCC");
  });

  it("refuses a file without a key or without metadata columns", () => {
    expect(
      planMetadataImport(table("title,ppp_model\nx,y"), projects).fileErrors,
    ).toHaveLength(1);
    expect(
      planMetadataImport(table("project_id,sector\np1,x"), projects).fileErrors,
    ).toHaveLength(1);
    const plan = planMetadataImport(
      table("project_id,ppp_model,mystery\np1,Lease,1"),
      projects,
    );
    expect(plan.ignoredColumns).toEqual(["mystery"]);
  });
});

describe("planBulkAccounts", () => {
  const context = {
    countries: [
      { id: "ca", iso3: "AAA" },
      { id: "cb", iso3: "BBB" },
    ],
    assignableRoles: [
      UserRole.INVESTOR,
      UserRole.COUNTRY,
      UserRole.WBG_COORDINATOR,
      UserRole.SUMMIT_ADMIN,
    ],
    existingEmails: new Set(["taken@x.example"]),
  };

  it("parses roles by code, label and alias", () => {
    expect(parseRole("investor")).toBe(UserRole.INVESTOR);
    expect(parseRole("Investor or operator")).toBe(UserRole.INVESTOR);
    expect(parseRole("WBG_COORDINATOR")).toBe(UserRole.WBG_COORDINATOR);
    expect(parseRole("focal point")).toBe(UserRole.COUNTRY);
    expect(parseRole("king")).toBeNull();
  });

  it("checks every row before anything is created", () => {
    const plan = planBulkAccounts(
      table(
        [
          "Email,Name,Organisation,Job title,Role,Countries",
          "New@X.example,Ann Investor,Bank,Analyst,Investor,",
          "fp@x.example,Fay Point,,,focal point,AAA;bbb",
          "taken@x.example,Tom Taken,,,investor,",
          "new@x.example,Dup,,,investor,",
          "bad,B,,,platform admin,",
          "co@x.example,Cora,,,coordinator,",
          "inv@x.example,Ivan,,,investor,AAA ZZZ",
        ].join("\n"),
      ),
      context,
    );
    expect(plan.rows[0]).toMatchObject({
      email: "new@x.example",
      role: UserRole.INVESTOR,
      errors: [],
    });
    expect(plan.rows[1]).toMatchObject({
      countryIds: ["ca", "cb"],
      errors: [],
    });
    expect(plan.rows[2].errors).toEqual([
      "An account already exists for this email address.",
    ]);
    expect(plan.rows[3].errors[0]).toContain("already on line 2");
    expect(plan.rows[4].errors).toEqual(
      expect.arrayContaining([
        "Enter a valid email address.",
        "Enter the full name (2 to 120 characters).",
        "You cannot hand out the role Platform administrator.",
      ]),
    );
    expect(plan.rows[5].errors[0]).toContain("at least one country");
    expect(plan.rows[6].errors).toEqual(
      expect.arrayContaining([
        'Unknown country code "ZZZ".',
        "Only country focal points and coordinators are linked to countries.",
      ]),
    );
    expect(plan.summary).toEqual({ rows: 7, ready: 2, errors: 5 });
  });

  it("needs email, name and role columns", () => {
    expect(
      planBulkAccounts(table("email,name\na@b.example,Ann"), context)
        .fileErrors,
    ).toEqual(["The file needs a column called role."]);
  });
});

describe("planContactsImport", () => {
  it("validates rows, skips stored contacts and duplicates", () => {
    expect(parseContactRole("WBG")).toBe(CountryContactRole.WBG_COORDINATOR);
    const plan = planContactsImport(
      table(
        [
          "iso3,name,email,role",
          "AAA,Fay Point,FP@x.example,focal point",
          "AAA,Fay Point,fp@x.example,Focal point",
          "BBB,Old One,old@x.example,coordinator",
          "ZZZ,Nobody,n@x.example,boss",
        ].join("\n"),
      ),
      [
        { id: "ca", iso3: "AAA" },
        { id: "cb", iso3: "BBB" },
      ],
      new Set(["cb|old@x.example|WBG_COORDINATOR"]),
    );
    expect(plan.rows[0]).toMatchObject({
      countryId: "ca",
      email: "fp@x.example",
      role: "FOCAL_POINT",
      errors: [],
      exists: false,
    });
    expect(plan.rows[1].errors).toEqual([
      "The same contact is already in the file.",
    ]);
    expect(plan.rows[2].exists).toBe(true);
    expect(plan.rows[3].errors).toHaveLength(2);
    expect(plan.summary).toEqual({ rows: 4, ready: 1, existing: 1, errors: 2 });
  });
});

/** Reads back a stored-only ZIP by its central directory. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const endAt = zip.byteLength - 22;
  expect(view.getUint32(endAt, true)).toBe(0x06054b50);
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      zip.slice(at + 46, at + 46 + nameLength),
    );
    expect(view.getUint32(localAt, true)).toBe(0x04034b50);
    const localName = view.getUint16(localAt + 26, true);
    const dataAt = localAt + 30 + localName;
    const data = zip.slice(dataAt, dataAt + size);
    expect(crc32(data) >>> 0).toBe(crc);
    files.push({ name, data });
    at += 46 + nameLength;
  }
  return files;
}

describe("createZip", () => {
  it("writes files that read back with matching CRCs", () => {
    const enc = new TextEncoder();
    const zip = createZip([
      { name: "projects.csv", data: enc.encode("a,b\r\n") },
      { name: "teasers/Pays Été.pdf", data: new Uint8Array([1, 2, 3]) },
      { name: "teasers/Pays Été.pdf", data: new Uint8Array([4]) },
      { name: "../../etc/passwd", data: new Uint8Array() },
    ]);
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual([
      "projects.csv",
      "teasers/Pays Été.pdf",
      "teasers/Pays Été (2).pdf",
      "etc/passwd",
    ]);
    expect(Array.from(files[1].data)).toEqual([1, 2, 3]);
  });

  it("cleans archive paths", () => {
    expect(zipPath("/a\\b/../c:?.pdf")).toBe("a/b/c.pdf");
    expect(zipPath("..")).toBe("file");
  });
});

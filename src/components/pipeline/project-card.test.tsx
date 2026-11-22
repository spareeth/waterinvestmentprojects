import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectCard, sectorTone } from "./project-card";

describe("sectorTone", () => {
  it("gives each sector family its own colour and icon, and falls back to water", () => {
    expect(sectorTone("Wastewater and reuse").tag).toContain("#2f4a8a");
    expect(sectorTone("Desalination").tag).toContain("sand");
    expect(sectorTone("Irrigation infrastructure").tag).toContain("#3a6a2a");
    expect(sectorTone("Water supply").tag).toContain("water");
    expect(sectorTone("Non-revenue water (NRW)").icon).not.toBe(
      sectorTone("Water supply").icon,
    );
  });
});

describe("ProjectCard", () => {
  it("names the sector and the key facts in words, with a link to the teaser", () => {
    render(
      <ProjectCard
        project={{
          id: "p1",
          title: "Galle NRW Project",
          sector: "Non-revenue water",
          region: null,
          pppModel: null,
          sizeMinUsd: null,
          sizeMaxUsd: null,
          developmentStage: "RFQ",
          projectType: "PROJECT" as never,
          publishedAt: null,
          country: { name: "Sri Lanka", iso3: "LKA" },
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Galle NRW Project" }),
    ).toHaveAttribute("href", "/pipeline/p1");
    expect(screen.getByText("Non-revenue water")).toBeInTheDocument();
    expect(screen.getByText("RFQ")).toBeInTheDocument();
    expect(screen.getAllByText("Not stated")).toHaveLength(1);
    // M11: an unknown size reads "TBC" (PLAN v0.4 0b.8).
    expect(screen.getByText("TBC")).toBeInTheDocument();
  });
});

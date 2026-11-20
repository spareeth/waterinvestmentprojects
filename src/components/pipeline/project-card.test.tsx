import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectCard, sectorTone } from "./project-card";

describe("sectorTone", () => {
  it("gives each sector family its own colour and falls back to water", () => {
    expect(sectorTone("Wastewater and reuse").stripe).toBe("bg-[#4f6fb3]");
    expect(sectorTone("Desalination").stripe).toBe("bg-sand-500");
    expect(sectorTone("Irrigation infrastructure").stripe).toBe("bg-[#4f8a3a]");
    expect(sectorTone("Water supply").stripe).toBe("bg-water-500");
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
    expect(screen.getAllByText("Not stated")).toHaveLength(2);
  });
});

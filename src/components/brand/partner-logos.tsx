import Image from "next/image";
import type { PartnerConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Partner marks from config (`appConfig.partners`), drawn on a dark background (the landing hero and footer).
 * One treatment for every mark (22 Nov styling pass): white artwork at one height; on light pages (upload,
 * teaser) the same marks in a quiet grey (`tone="muted"`). White artwork
 * (`artwork: "light"`) is shown as it is; dark artwork is turned white with a CSS filter, so no tile is needed.
 * A partner without a logo file is left out until the file is added (config keeps its place in the order).
 * The name is the logo's alt text. Logos are served as they are (`unoptimized`), so SVG files work too.
 */
export function PartnerLogos({
  partners,
  className,
  size = "md",
  tone = "onDark",
}: {
  partners: readonly PartnerConfig[];
  className?: string;
  /** "md" in the hero, "sm" in the footer, "xs" for the quiet strip on light pages. */
  size?: "md" | "sm" | "xs";
  /** "onDark": white marks (hero, footer). "muted": quiet grey marks for light pages (upload, teaser). */
  tone?: "onDark" | "muted";
}) {
  const shown = partners.filter((p) => p.logo);
  if (shown.length === 0) return null;
  return (
    <ul
      aria-label="Partners"
      className={cn("flex flex-wrap items-center gap-x-7 gap-y-4", className)}
    >
      {shown.map((partner) =>
        partner.logo ? (
          <li key={partner.id} className="flex items-center">
            <Image
              src={partner.logo.src}
              width={partner.logo.width}
              height={partner.logo.height}
              alt={partner.name}
              unoptimized
              className={cn(
                "w-auto object-contain",
                size === "md"
                  ? "h-8 max-w-44"
                  : size === "sm"
                    ? "h-6 max-w-36"
                    : "h-5 max-w-28",
                tone === "muted"
                  ? "opacity-55 brightness-0"
                  : partner.logo.artwork === "dark" && "brightness-0 invert",
              )}
            />
          </li>
        ) : null,
      )}
    </ul>
  );
}

/** A quiet "In partnership with" strip for light pages (22 Nov: the upload pages and the project teaser page). */
export function PartnerStrip({
  partners,
  className,
}: {
  partners: readonly PartnerConfig[];
  className?: string;
}) {
  if (!partners.some((p) => p.logo)) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-5 gap-y-3",
        className,
      )}
    >
      <span className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        In partnership with
      </span>
      <PartnerLogos
        partners={partners}
        size="xs"
        tone="muted"
        className="gap-x-5"
      />
    </div>
  );
}

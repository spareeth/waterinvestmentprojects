import Image from "next/image";
import type { PartnerConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Partner marks from config (`appConfig.partners`), drawn on a dark background (the landing hero and footer).
 * Marks share one height (22 Nov styling pass, a size larger on 23 Nov). On the dark hero and footer, white artwork
 * (`artwork: "light"`) is shown as it is and dark artwork is turned white with a CSS filter, so no tile is needed;
 * on light pages (upload, teaser) they are a quiet grey (`tone="muted"`). A colour mark (`onDarkSrc`, 23 Nov: WBG
 * and Water Forward) keeps its colours everywhere: its on-dark version on dark backgrounds, its original on light. A `tall` mark gets a larger height.
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
      {shown.map((partner) => {
        if (!partner.logo) return null;
        const colour = Boolean(partner.logo.onDarkSrc);
        const src =
          colour && tone === "onDark"
            ? (partner.logo.onDarkSrc as string)
            : partner.logo.src;
        return (
          <li key={partner.id} className="flex items-center">
            <Image
              src={src}
              width={partner.logo.width}
              height={partner.logo.height}
              alt={partner.name}
              unoptimized
              className={cn(
                "w-auto object-contain",
                partner.logo.tall
                  ? size === "md"
                    ? "h-14 max-w-56"
                    : size === "sm"
                      ? "h-11 max-w-44"
                      : "h-8 max-w-32"
                  : size === "md"
                    ? "h-10 max-w-56"
                    : size === "sm"
                      ? "h-8 max-w-44"
                      : "h-6 max-w-32",
                colour
                  ? tone === "muted" && "opacity-80"
                  : tone === "muted"
                    ? "opacity-55 brightness-0"
                    : partner.logo.artwork === "dark" && "brightness-0 invert",
              )}
            />
          </li>
        );
      })}
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

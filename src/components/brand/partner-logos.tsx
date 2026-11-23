import Image from "next/image";
import type { PartnerConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Partner marks from config (`appConfig.partners`). Marks share one height (22 Nov styling pass, a size larger on
 * 23 Nov); a `tall` mark (Water Forward, with icons and a tagline around its name) is drawn taller.
 * On the dark landing hero and footer (`tone="band"`, 23 Nov, Sajid's choice "one white band") the marks sit on one
 * white band in their original colours: dark artwork as it is, white artwork (`artwork: "light"`) turned dark.
 * On light pages (upload, teaser, `tone="muted"`) the marks are a quiet grey, except colour marks (`colour`: WBG
 * and Water Forward), which keep their original colours.
 * A partner without a logo file is left out until the file is added (config keeps its place in the order).
 * The name is the logo's alt text. Logos are served as they are (`unoptimized`), so SVG files work too.
 */
export function PartnerLogos({
  partners,
  className,
  size = "md",
  tone = "band",
}: {
  partners: readonly PartnerConfig[];
  className?: string;
  /** "md" in the hero, "sm" in the footer, "xs" for the quiet strip on light pages. */
  size?: "md" | "sm" | "xs";
  /** "band": original colours on a white band (hero, footer). "muted": quiet marks for light pages (upload, teaser). */
  tone?: "band" | "muted";
}) {
  const shown = partners.filter((p) => p.logo);
  if (shown.length === 0) return null;
  return (
    <ul
      aria-label="Partners"
      className={cn(
        "flex flex-wrap items-center gap-x-7 gap-y-4",
        tone === "band" && "w-fit max-w-full rounded-xl bg-white shadow-sm",
        tone === "band" && (size === "md" ? "px-6 py-4" : "px-5 py-3"),
        className,
      )}
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
                tone === "band"
                  ? partner.logo.artwork === "light" && "brightness-0"
                  : partner.logo.colour
                    ? "opacity-80"
                    : "opacity-55 brightness-0",
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

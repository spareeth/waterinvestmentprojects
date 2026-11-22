import Image from "next/image";
import type { PartnerConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Partner marks from config (`appConfig.partners`), drawn on a dark background (the landing hero and footer).
 * One treatment for every mark (22 Nov styling pass): white artwork at one height. White artwork
 * (`artwork: "light"`) is shown as it is; dark artwork is turned white with a CSS filter, so no tile is needed.
 * A partner without a logo file is left out until the file is added (config keeps its place in the order).
 * The name is the logo's alt text. Logos are served as they are (`unoptimized`), so SVG files work too.
 */
export function PartnerLogos({
  partners,
  className,
  size = "md",
}: {
  partners: readonly PartnerConfig[];
  className?: string;
  /** "md" in the hero, "sm" in the footer. */
  size?: "md" | "sm";
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
                size === "md" ? "h-8 max-w-44" : "h-6 max-w-36",
                partner.logo.artwork === "dark" && "brightness-0 invert",
              )}
            />
          </li>
        ) : null,
      )}
    </ul>
  );
}

import Image from "next/image";
import type { PartnerConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Partner marks from config (`appConfig.partners`), drawn for the dark landing hero. Every mark is the same
 * height, so the row lines up with the hero buttons. White artwork (`artwork: "light"`) is shown as it is; dark
 * artwork sits on a white tile so it stays legible on navy. A partner without a logo shows a dashed placeholder
 * carrying its name, so a missing file is obvious and nothing is invented. The name is the logo's alt text.
 * Logos are served as they are (`unoptimized`), so SVG files work too.
 */
export function PartnerLogos({
  partners,
  className,
}: {
  partners: readonly PartnerConfig[];
  className?: string;
}) {
  if (partners.length === 0) return null;
  return (
    <ul
      aria-label="Partners"
      className={cn("flex flex-wrap items-center gap-3", className)}
    >
      {partners.map((partner) => (
        <li key={partner.id} className="flex h-11 items-center">
          {partner.logo ? (
            <span
              className={cn(
                "flex h-11 items-center",
                partner.logo.artwork === "dark" &&
                  "rounded-md bg-white px-3 shadow-sm",
              )}
            >
              <Image
                src={partner.logo.src}
                width={partner.logo.width}
                height={partner.logo.height}
                alt={partner.name}
                unoptimized
                className={cn(
                  "w-auto object-contain",
                  partner.logo.artwork === "dark"
                    ? "h-6 max-w-36"
                    : "h-9 max-w-52",
                )}
              />
            </span>
          ) : (
            <span
              data-placeholder="partner-logo"
              title="Logo to follow"
              className="flex h-11 min-w-32 items-center justify-center rounded-md border-[1.5px] border-dashed border-white/50 bg-white/10 px-3 text-xs font-medium text-white/90"
            >
              {partner.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

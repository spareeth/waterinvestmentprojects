import Image from "next/image";
import type { PartnerConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Partner marks from config (`appConfig.partners`). A partner with a `logo` shows the image, with its name as
 * alt text; one without shows a dashed placeholder carrying the name, so a missing file is obvious and nothing
 * is invented. Logos are served as they are (`unoptimized`), so SVG files work.
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
        <li key={partner.id}>
          {partner.logo ? (
            <Image
              src={partner.logo.src}
              width={partner.logo.width}
              height={partner.logo.height}
              alt={partner.name}
              unoptimized
              className="h-11 w-auto max-w-40 object-contain"
            />
          ) : (
            <span
              data-placeholder="partner-logo"
              title="Logo to follow"
              className="flex h-11 min-w-32 items-center justify-center rounded-lg border-[1.5px] border-dashed border-[#9fb0b0] bg-card px-3 text-xs font-medium text-foreground/80"
            >
              {partner.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

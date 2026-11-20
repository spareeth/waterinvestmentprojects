import { cn } from "@/lib/utils";

/**
 * Logo mark "Water world" (option C on the design canvas, Nov 2026): a globe made of waves, for projects from
 * many countries in one place. Decorative; the platform name sits next to it. The same drawing is the favicon
 * (src/app/icon.svg).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 40 40"
      className={cn("size-9 shrink-0", className)}
    >
      <circle cx="20" cy="20" r="17" fill="#16596a" />
      <circle
        cx="20"
        cy="20"
        r="17"
        fill="none"
        stroke="#5fd0d6"
        strokeWidth="2"
      />
      <path
        d="M6 16c4.5-3 9.5-3 14 0s9.5 3 14 0"
        stroke="#5fd0d6"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M4.5 22c5-3 10.5-3 15.5 0s10.5 3 15.5 0"
        stroke="#ffffff"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M7 28c4.3-2.6 8.7-2.6 13 0s8.7 2.6 13 0"
        stroke="#b0e3e9"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

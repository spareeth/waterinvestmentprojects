import { cn } from "@/lib/utils";

/** Water-drop logo mark from the concept screens. Decorative; the platform name sits next to it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-7 shrink-0 -rotate-45 rounded-[50%_50%_50%_0] bg-linear-135 from-brand-aqua to-brand-teal",
        className,
      )}
    />
  );
}

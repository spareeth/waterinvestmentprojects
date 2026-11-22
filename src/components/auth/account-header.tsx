import { SignOutButton } from "@/components/auth/sign-out-button";

/** Up to two initials for the badge ("Sajid Pareeth" gives "SP"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

/**
 * Top-bar content for signed-in screens: who is signed in, and sign-out. The name sits in its own aqua badge,
 * set apart by a divider, so it never reads as one more menu link.
 */
export function AccountHeader({ name }: { name: string }) {
  return (
    <>
      <span
        className="hidden h-6 w-px bg-white/25 md:block"
        aria-hidden="true"
      />
      <span
        className="inline-flex items-center gap-2 rounded-full bg-brand-aqua/15 py-1 ps-1 pe-3 ring-1 ring-brand-aqua/40"
        data-testid="signed-in-user"
      >
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full bg-brand-aqua text-xs font-bold text-brand-navy"
        >
          {initials(name)}
        </span>
        <span className="sr-only">Signed in as </span>
        <span className="font-medium text-brand-aqua">{name}</span>
      </span>
      <SignOutButton />
    </>
  );
}

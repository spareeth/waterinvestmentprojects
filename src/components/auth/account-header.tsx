import { SignOutButton } from "@/components/auth/sign-out-button";

/** Top-bar content for signed-in screens: who is signed in, and sign-out. */
export function AccountHeader({ name }: { name: string }) {
  return (
    <>
      <span className="hidden text-white/90 sm:inline">{name}</span>
      <SignOutButton />
    </>
  );
}

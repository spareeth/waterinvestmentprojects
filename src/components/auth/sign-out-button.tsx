import { signOutAction } from "@/app/(account)/actions";
import { Button } from "@/components/ui/button";

/** Sign-out is a POST (a form), so a link on another site cannot sign people out. */
export function SignOutButton({
  variant = "header",
}: {
  variant?: "header" | "primary";
}) {
  return (
    <form action={signOutAction}>
      {variant === "header" ? (
        <Button
          type="submit"
          size="lg"
          variant="outline"
          className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          Sign out
        </Button>
      ) : (
        <Button type="submit" size="lg" className="h-10 w-full">
          Sign out
        </Button>
      )}
    </form>
  );
}

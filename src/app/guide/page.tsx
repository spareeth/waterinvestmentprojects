import type { Metadata } from "next";
import Link from "next/link";
import { UserGuide } from "@/components/guide/user-guide";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "User guide" };

/**
 * Public user guide, linked from every header ("User guide"). Contains no project or country information, so it
 * is open to everyone, including government uploaders who have no account. Pre-rendered: rebuild after changing
 * APP_NAME or SUPPORT_EMAIL.
 */
export default function GuidePage() {
  return (
    <>
      <SiteHeader>
        <Link href="/" className="text-white/90 hover:text-white">
          Home
        </Link>
        <Link href="/sign-in" className="text-white/90 hover:text-white">
          Sign in
        </Link>
      </SiteHeader>
      <main className="flex flex-1 flex-col">
        <UserGuide />
      </main>
    </>
  );
}

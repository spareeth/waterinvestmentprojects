import type { Metadata } from "next";
import { AccountHeader } from "@/components/auth/account-header";
import { AuthPage } from "@/components/auth/auth-page";
import { TermsForm } from "@/components/auth/terms-form";
import { TERMS_IS_DRAFT, TERMS_SECTIONS } from "@/lib/auth/terms";
import { requireStage } from "@/lib/authz";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Terms of use" };

export default async function TermsPage() {
  const { user } = await requireStage("terms");
  return (
    <AuthPage
      wide
      title="Terms of use"
      description="Please read and accept these terms before you use the portal."
      header={<AccountHeader name={user.name} />}
    >
      {TERMS_IS_DRAFT ? (
        <p className="mb-4 rounded-lg bg-pending px-3 py-2 text-xs text-pending-foreground">
          Draft wording for the demonstration. The final terms are being agreed
          with the Summit partners.
        </p>
      ) : null}
      <div className="mb-6 flex max-h-96 flex-col gap-4 overflow-y-auto rounded-lg border p-4 text-sm">
        {TERMS_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="font-semibold text-brand-navy">{section.heading}</h2>
            <p className="mt-1 text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
      <TermsForm />
    </AuthPage>
  );
}

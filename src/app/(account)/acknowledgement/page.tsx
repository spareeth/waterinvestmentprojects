import type { Metadata } from "next";
import { AccountHeader } from "@/components/auth/account-header";
import { AuthPage } from "@/components/auth/auth-page";
import { InvestorAckForm } from "@/components/auth/investor-ack-form";
import { requireStage } from "@/lib/authz";
import { appConfig } from "@/lib/config";

// Reads the session or the database and redirects on the server before rendering, so it may block.
export const instant = false;

export const metadata: Metadata = { title: "Acknowledgement" };

/**
 * Investors and operators accept the investor acknowledgement once, before they see any project (PLAN v0.3 0.6).
 * The wording and its version come from config; a new version asks everyone again.
 */
export default async function InvestorAcknowledgementPage() {
  const { user } = await requireStage("investor-ack");
  const ack = appConfig.investorAcknowledgement;
  return (
    <AuthPage
      wide
      title="Before you see the projects"
      description="The project teasers are shared by the participating Governments for the Water Investment Summit. Please confirm how you will use them."
      header={<AccountHeader name={user.name} />}
    >
      {ack.isPlaceholder ? (
        <p className="mb-4 rounded-lg bg-pending px-3 py-2 text-xs text-pending-foreground">
          Placeholder wording for the demonstration. The final text will be
          confirmed by the Summit team.
        </p>
      ) : null}
      <InvestorAckForm text={ack.text} />
    </AuthPage>
  );
}

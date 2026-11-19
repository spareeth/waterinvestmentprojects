"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { UserStatus } from "@/generated/prisma/enums";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import { setAccountStatus } from "@/lib/admin/accounts";
import { ADMIN_MESSAGES, AdminError } from "@/lib/admin/errors";

// Switching an account off and on again (M7). The policy lives in src/lib/authz/admin.ts (canSetAccountStatus).

export async function setAccountStatusAction(
  userId: string,
  active: boolean,
): Promise<{ error?: string; message?: string }> {
  const viewer = await requireViewer();
  try {
    await setAccountStatus(
      viewer,
      String(userId).slice(0, 64),
      active ? UserStatus.ACTIVE : UserStatus.DEACTIVATED,
      { meta: requestMetaFrom(await headers()) },
    );
    refresh();
    return {
      message: active
        ? "The account works again."
        : "The account is switched off and signed out everywhere.",
    };
  } catch (error) {
    if (error instanceof AdminError)
      return { error: ADMIN_MESSAGES[error.code] };
    throw error;
  }
}

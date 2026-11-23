"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { UserStatus } from "@/generated/prisma/enums";
import { requestMetaFrom } from "@/lib/audit";
import { requireViewer } from "@/lib/authz";
import { removeUser, setAccountStatus } from "@/lib/admin/accounts";
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

/** Removes an account (23 Nov): erase and disable. The policy is canRemoveUser in src/lib/authz/admin.ts. */
export async function removeUserAction(
  userId: string,
): Promise<{ error?: string; message?: string }> {
  const viewer = await requireViewer();
  try {
    await removeUser(viewer, String(userId).slice(0, 64), {
      meta: requestMetaFrom(await headers()),
    });
    refresh();
    return {
      message:
        "The account is removed: the person can no longer sign in, and their name and email are erased.",
    };
  } catch (error) {
    if (error instanceof AdminError)
      return { error: ADMIN_MESSAGES[error.code] };
    throw error;
  }
}

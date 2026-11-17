import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** Who did something and from where. Read from the incoming request headers. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface AuditInput {
  /** Empty for failed logins and system actions. */
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: RequestMeta;
  metadata?: Prisma.InputJsonValue;
}

type AuditClient = Pick<Prisma.TransactionClient, "auditEvent">;

/** Appends one row to the audit trail. Pass a transaction client to make it part of a larger change. */
export async function writeAudit(
  input: AuditInput,
  client: AuditClient = db,
): Promise<void> {
  await client.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ip: input.meta?.ip ?? null,
      userAgent: input.meta?.userAgent?.slice(0, 512) ?? null,
      metadata: input.metadata,
    },
  });
}

/**
 * Reads the client IP and user agent. The app runs behind exactly one reverse proxy (PLAN section 4), which
 * appends the address it saw to x-forwarded-for. Earlier entries can be forged by the client, so the last
 * entry is used.
 */
export function requestMetaFrom(headers: Headers): RequestMeta {
  const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || null;
  return { ip, userAgent: headers.get("user-agent") };
}

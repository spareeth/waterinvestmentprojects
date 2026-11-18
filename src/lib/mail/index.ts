import "server-only";
import { getEnv } from "@/lib/env";

// Outgoing email behind one interface. NOT USED by any flow yet: the user decided on 18 Nov that the portal sends
// no email for now (uploaders see a confirmation page, admins check the admin pages). Kept, log-only, so a
// provider can be added later without touching callers. Callers must send after their transaction has committed
// and never let a mail failure undo the work.

export interface MailMessage {
  to: string[];
  cc?: string[];
  subject: string;
  /** Plain text body. */
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Writes messages to the server log. Outside development only the recipients and subject are logged. */
export class LogMailer implements Mailer {
  constructor(
    private readonly from: string,
    private readonly includeBody: boolean,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const lines = [
      `[mail:log] from=${this.from} to=${message.to.join(", ")}` +
        (message.cc?.length ? ` cc=${message.cc.join(", ")}` : ""),
      `[mail:log] subject=${message.subject}`,
    ];
    if (this.includeBody) lines.push(message.text);
    console.info(lines.join("\n"));
  }
}

/** Keeps messages in memory (tests). */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

let cached: Mailer | undefined;

/** The configured mailer (MAIL_DRIVER). */
export function getMailer(): Mailer {
  if (cached) return cached;
  const env = getEnv();
  cached = new LogMailer(env.MAIL_FROM, env.APP_ENV === "development");
  return cached;
}

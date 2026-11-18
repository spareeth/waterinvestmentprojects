import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { type RequestMeta, writeAudit } from "@/lib/audit";
import { type Env, getEnv } from "@/lib/env";

// Outgoing email from the Summit mailbox (user decision, 18 Nov: e.g. summit@waterinvestmentprojects.org).
// Drivers: "log" writes messages to the server log (default, and in tests), "smtp" sends through any provider's
// SMTP server (Microsoft 365, Google Workspace, Zoho; Mailpit locally). The mailbox's inbox is read at the
// provider, not in the portal. Callers send after their transaction has committed: sendMail() never throws, so a
// mail failure can never undo the work; each send is audited (mail.sent / mail.failed, never the body).

export interface MailMessage {
  to: string[];
  cc?: string[];
  /** Defaults to the sender (the Summit mailbox), so replies reach the team. */
  replyTo?: string;
  subject: string;
  /** Plain text body. */
  text: string;
}

export interface Mailer {
  /** True when messages really leave the server (smtp); false for the log driver. */
  readonly delivers: boolean;
  send(message: MailMessage): Promise<void>;
}

/** Writes messages to the server log. Outside development only the recipients and subject are logged. */
export class LogMailer implements Mailer {
  readonly delivers = false;

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

/** Sends through an SMTP server. TLS is required except for a server on this machine (Mailpit). */
export class SmtpMailer implements Mailer {
  readonly delivers = true;
  private readonly transport: Transporter;

  constructor(
    private readonly from: string,
    options: {
      host: string;
      port: number;
      secure: boolean;
      user: string | null;
      password: string | null;
    },
  ) {
    const local = ["localhost", "127.0.0.1", "::1"].includes(options.host);
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      requireTLS: !options.secure && !local,
      auth:
        options.user && options.password
          ? { user: options.user, pass: options.password }
          : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      cc: message.cc,
      replyTo: message.replyTo ?? this.from,
      subject: message.subject,
      text: message.text,
    });
  }
}

/** Keeps messages in memory (tests). */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  constructor(readonly delivers = true) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export function mailerFrom(env: Env): Mailer {
  if (env.MAIL_DRIVER === "smtp" && env.SMTP_HOST && env.MAIL_FROM) {
    return new SmtpMailer(env.MAIL_FROM, {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
    });
  }
  return new LogMailer(
    env.MAIL_FROM ?? "no-reply@localhost",
    env.APP_ENV === "development",
  );
}

let cached: Mailer | undefined;

/** The configured mailer (MAIL_DRIVER). */
export function getMailer(): Mailer {
  cached ??= mailerFrom(getEnv());
  return cached;
}

export interface SendOptions {
  mailer?: Mailer;
  meta?: RequestMeta;
  /** What the email is about, for the audit trail. */
  entityType: string;
  entityId?: string | null;
}

/**
 * Sends one message and audits it. Never throws. Returns true only when the message really left the server
 * (an smtp driver accepted it), so callers can tell the person an email is on its way.
 */
export async function sendMail(
  kind: string,
  message: MailMessage,
  { mailer, meta, entityType, entityId = null }: SendOptions,
): Promise<boolean> {
  const send = mailer ?? getMailer();
  try {
    await send.send(message);
    await writeAudit({
      actorId: null,
      action: "mail.sent",
      entityType,
      entityId,
      meta,
      metadata: {
        kind,
        recipients: message.to.length + (message.cc?.length ?? 0),
        delivered: send.delivers,
      },
    }).catch(() => undefined);
    return send.delivers;
  } catch (error) {
    console.error(`Email (${kind}) failed`, error);
    await writeAudit({
      actorId: null,
      action: "mail.failed",
      entityType,
      entityId,
      meta,
      metadata: { kind },
    }).catch(() => undefined);
    return false;
  }
}

/**
 * Tells the Summit team mailbox (ADMIN_NOTIFY_EMAIL) about something that happened: a teaser submission now;
 * new projects and bilateral meeting requests when those features arrive. Does nothing when no mailbox is set.
 */
export async function notifySummitTeam(
  kind: string,
  content: { subject: string; text: string },
  options: SendOptions & { recipients?: string[] },
): Promise<boolean> {
  const to = options.recipients ?? getEnv().ADMIN_NOTIFY_EMAIL;
  if (to.length === 0) return false;
  return sendMail(kind, { to, ...content }, options);
}

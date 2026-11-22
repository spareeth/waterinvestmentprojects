import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a PostgreSQL connection string and applies safe defaults", () => {
    const env = parseEnv(base);
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_ENV).toBe("development");
    // M13: investor registration is on unless switched off; pre-approved auto-access and registrant emails are off.
    expect(env.SELF_REGISTRATION_ENABLED).toBe(true);
    expect(env.REGISTRATION_AUTO_APPROVE).toBe(false);
    expect(env.REGISTRATION_NOTIFY_REGISTRANT).toBe(false);
    expect(env.AUTH_SECOND_STEP).toBe("none");
    expect(env.SESSION_IDLE_MINUTES).toBe(120);
    expect(env.SESSION_MAX_HOURS).toBe(12);
  });

  it("logs email by default and needs a server and sender for smtp", () => {
    const env = parseEnv(base);
    expect(env.MAIL_DRIVER).toBe("log");
    expect(env.ADMIN_NOTIFY_EMAIL).toEqual([]);
    expect(env.SMTP_PORT).toBe(587);
    expect(() => parseEnv({ ...base, MAIL_DRIVER: "smtp" })).toThrow(
      /SMTP_HOST.*MAIL_FROM|MAIL_FROM.*SMTP_HOST/,
    );
    const smtp = parseEnv({
      ...base,
      MAIL_DRIVER: "smtp",
      SMTP_HOST: "smtp.example.org",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "summit@example.org",
      SMTP_PASSWORD: "app-password",
      MAIL_FROM: "summit@example.org",
      ADMIN_NOTIFY_EMAIL: "summit@example.org, team@example.org",
    });
    expect(smtp).toMatchObject({
      MAIL_DRIVER: "smtp",
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      ADMIN_NOTIFY_EMAIL: ["summit@example.org", "team@example.org"],
    });
    expect(() =>
      parseEnv({
        ...base,
        MAIL_DRIVER: "smtp",
        SMTP_HOST: "smtp.example.org",
        MAIL_FROM: "summit@example.org",
        SMTP_USER: "summit@example.org",
      }),
    ).toThrow(/SMTP_USER/);
    expect(() =>
      parseEnv({ ...base, ADMIN_NOTIFY_EMAIL: "summit, nope" }),
    ).toThrow(/ADMIN_NOTIFY_EMAIL/);
  });

  it("never echoes the SMTP password in an error", () => {
    let message = "";
    try {
      parseEnv({
        ...base,
        MAIL_DRIVER: "smtp",
        SMTP_PASSWORD: "very-secret-pass",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/SMTP/);
    expect(message).not.toContain("very-secret-pass");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() =>
      parseEnv({ BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-PostgreSQL URL without echoing the value", () => {
    const secret = "mysql://admin:topsecret@db/prod";
    let message = "";
    try {
      parseEnv({ ...base, DATABASE_URL: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain("topsecret");
  });

  it("requires a sign-in secret of at least 32 characters", () => {
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() =>
      parseEnv({ ...base, BETTER_AUTH_SECRET: "too-short" }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("treats only the exact word true as switched on", () => {
    const on = parseEnv({ ...base, SELF_REGISTRATION_ENABLED: "true" });
    expect(on.SELF_REGISTRATION_ENABLED).toBe(true);
    const off = parseEnv({ ...base, SELF_REGISTRATION_ENABLED: "false" });
    expect(off.SELF_REGISTRATION_ENABLED).toBe(false);
    expect(() =>
      parseEnv({ ...base, SELF_REGISTRATION_ENABLED: "yes" }),
    ).toThrow(/SELF_REGISTRATION_ENABLED/);
  });
});

describe("upload scan setting", () => {
  it("leaves uploads pending by default and uses local storage", () => {
    const env = parseEnv(base);
    expect(env.UPLOAD_SCAN).toBe("pending");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.STORAGE_LOCAL_DIR).toBe(".data/blobs");
  });

  it("allows assume-clean locally and on staging", () => {
    expect(parseEnv({ ...base, UPLOAD_SCAN: "assume-clean" }).UPLOAD_SCAN).toBe(
      "assume-clean",
    );
    const staging = parseEnv({
      ...base,
      NODE_ENV: "production",
      APP_ENV: "staging",
      UPLOAD_SCAN: "assume-clean",
    });
    expect(staging.UPLOAD_SCAN).toBe("assume-clean");
  });

  it("refuses assume-clean in production, including the production default", () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        UPLOAD_SCAN: "assume-clean",
      }),
    ).toThrow(/UPLOAD_SCAN/);
  });

  it("scans with ClamAV in production, at the configured address", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "production",
      UPLOAD_SCAN: "clamav",
      CLAMAV_HOST: "clamav",
    });
    expect(env.UPLOAD_SCAN).toBe("clamav");
    expect(env.CLAMAV_HOST).toBe("clamav");
    expect(env.CLAMAV_PORT).toBe(3310);
    expect(env.SCAN_SWEEP_SECONDS).toBe(60);
    expect(parseEnv(base).CLAMAV_HOST).toBe("localhost");
    expect(() => parseEnv({ ...base, CLAMAV_PORT: "0" })).toThrow(
      /CLAMAV_PORT/,
    );
  });

  it("rejects an unknown scan mode", () => {
    expect(() => parseEnv({ ...base, UPLOAD_SCAN: "off" })).toThrow(
      /UPLOAD_SCAN/,
    );
  });
});

describe("second step at sign-in", () => {
  it("asks for no second step by default, in production too (PLAN 0a.3)", () => {
    expect(parseEnv(base).AUTH_SECOND_STEP).toBe("none");
    const production = parseEnv({ ...base, NODE_ENV: "production" });
    expect(production.APP_ENV).toBe("production");
    expect(production.AUTH_SECOND_STEP).toBe("none");
  });

  it("switches the authenticator app on with totp only", () => {
    expect(
      parseEnv({ ...base, AUTH_SECOND_STEP: "totp" }).AUTH_SECOND_STEP,
    ).toBe("totp");
    expect(() => parseEnv({ ...base, AUTH_SECOND_STEP: "sms" })).toThrow(
      /AUTH_SECOND_STEP/,
    );
  });
});

describe("startup check", () => {
  it("stops the server from starting with a demo-only setting in production", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", base.DATABASE_URL);
    vi.stubEnv("BETTER_AUTH_SECRET", base.BETTER_AUTH_SECRET);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("UPLOAD_SCAN", "assume-clean");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "");
    try {
      const { register } = await import("@/instrumentation");
      await expect(register()).rejects.toThrow(/UPLOAD_SCAN/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

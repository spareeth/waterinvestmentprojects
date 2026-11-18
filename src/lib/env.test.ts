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
    expect(env.SELF_REGISTRATION_ENABLED).toBe(false);
    expect(env.AUTH_SKIP_SECOND_STEP).toBe(false);
    expect(env.SESSION_IDLE_MINUTES).toBe(120);
    expect(env.SESSION_MAX_HOURS).toBe(12);
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

  it("rejects an unknown scan mode", () => {
    expect(() => parseEnv({ ...base, UPLOAD_SCAN: "off" })).toThrow(
      /UPLOAD_SCAN/,
    );
  });
});

describe("staging switch to skip the second step", () => {
  it("is allowed locally and on staging", () => {
    const local = parseEnv({ ...base, AUTH_SKIP_SECOND_STEP: "true" });
    expect(local.AUTH_SKIP_SECOND_STEP).toBe(true);
    const staging = parseEnv({
      ...base,
      NODE_ENV: "production",
      APP_ENV: "staging",
      AUTH_SKIP_SECOND_STEP: "true",
    });
    expect(staging.AUTH_SKIP_SECOND_STEP).toBe(true);
  });

  it("is refused when APP_ENV is production", () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
        AUTH_SKIP_SECOND_STEP: "true",
      }),
    ).toThrow(/AUTH_SKIP_SECOND_STEP/);
  });

  it("is refused in a production build that does not say it is staging", () => {
    expect(parseEnv({ ...base, NODE_ENV: "production" }).APP_ENV).toBe(
      "production",
    );
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: "production",
        AUTH_SKIP_SECOND_STEP: "true",
      }),
    ).toThrow(/AUTH_SKIP_SECOND_STEP/);
  });

  it("stops the server from starting in production", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", base.DATABASE_URL);
    vi.stubEnv("BETTER_AUTH_SECRET", base.BETTER_AUTH_SECRET);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("AUTH_SKIP_SECOND_STEP", "true");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "");
    try {
      const { register } = await import("@/instrumentation");
      await expect(register()).rejects.toThrow(/AUTH_SKIP_SECOND_STEP/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

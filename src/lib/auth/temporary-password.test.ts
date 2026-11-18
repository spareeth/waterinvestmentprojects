import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH } from "./constants";
import {
  generateTemporaryPassword,
  TEMPORARY_PASSWORD_PATTERN,
} from "./temporary-password";

describe("generateTemporaryPassword", () => {
  it("gives four groups of easy-to-read characters, long enough for the password rules", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(TEMPORARY_PASSWORD_PATTERN);
    expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(password).not.toMatch(/[01ilo]/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => generateTemporaryPassword()),
    );
    expect(seen.size).toBe(200);
  });
});

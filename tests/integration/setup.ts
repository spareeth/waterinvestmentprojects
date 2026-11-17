// Integration tests talk to the real PostgreSQL in DATABASE_URL (local: docker compose; CI: service container).
import "dotenv/config";
import { vi } from "vitest";

// Outside a Next.js request there are no request headers or cookie store. The services take headers
// explicitly; Better Auth's nextCookies plugin gets a store that ignores writes (tests read Set-Cookie instead).
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  }),
}));

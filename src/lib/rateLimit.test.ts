import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearRateLimits,
  clientIp,
  hitRateLimit,
  peekRateLimit,
  resetRateLimit,
  tooManyRequests,
} from "./rateLimit";

beforeEach(() => {
  clearRateLimits();
  delete process.env.ANIME_HUB_RATE_LIMIT_DISABLED;
});
afterEach(() => {
  delete process.env.ANIME_HUB_RATE_LIMIT_DISABLED;
});

describe("hitRateLimit", () => {
  it("allows up to the limit inside the window, then blocks with a Retry-After", () => {
    const t = 1_000;
    for (let i = 0; i < 3; i += 1) expect(hitRateLimit("k", 3, 60_000, t).allowed).toBe(true);
    const blocked = hitRateLimit("k", 3, 60_000, t + 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(59);
  });

  it("opens a fresh window after it expires", () => {
    hitRateLimit("k", 1, 1000, 0);
    expect(hitRateLimit("k", 1, 1000, 500).allowed).toBe(false);
    expect(hitRateLimit("k", 1, 1000, 1001).allowed).toBe(true);
  });

  it("keeps separate counters per key", () => {
    hitRateLimit("a", 1, 1000, 0);
    expect(hitRateLimit("a", 1, 1000, 1).allowed).toBe(false);
    expect(hitRateLimit("b", 1, 1000, 1).allowed).toBe(true);
  });

  it("can be disabled by env (E2E)", () => {
    process.env.ANIME_HUB_RATE_LIMIT_DISABLED = "1";
    for (let i = 0; i < 50; i += 1) expect(hitRateLimit("k", 1, 1000).allowed).toBe(true);
  });
});

describe("peek / reset", () => {
  it("peek does not count; reset clears the counter", () => {
    hitRateLimit("k", 2, 60_000, 0);
    hitRateLimit("k", 2, 60_000, 0);
    expect(peekRateLimit("k", 2, 1).allowed).toBe(false);
    expect(peekRateLimit("k", 2, 1).allowed).toBe(false); // continua igual: peek não conta
    resetRateLimit("k");
    expect(peekRateLimit("k", 2, 2).allowed).toBe(true);
  });
});

describe("clientIp / tooManyRequests", () => {
  it("uses the first X-Forwarded-For hop", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientIp(req)).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
  it("builds a 429 with Retry-After", async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });
});

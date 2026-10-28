import { describe, expect, it } from "vitest";
import { loginHref, sanitizeNext } from "./safeRedirect";

describe("sanitizeNext", () => {
  it("accepts same-site relative paths, with query and hash", () => {
    expect(sanitizeNext("/obra/123")).toBe("/obra/123");
    expect(sanitizeNext("/discover?q=naruto&genre=Drama#x")).toBe("/discover?q=naruto&genre=Drama#x");
  });

  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "obra/123",
    "",
    "/ok\nSet-Cookie: a=b",
    "/a\\b",
  ])("rejects %j", (value) => {
    expect(sanitizeNext(value)).toBe("/");
  });

  it("rejects null/undefined and oversize values, honoring the fallback", () => {
    expect(sanitizeNext(null)).toBe("/");
    expect(sanitizeNext(undefined, "/home")).toBe("/home");
    expect(sanitizeNext("/" + "a".repeat(600))).toBe("/");
  });

  it("never returns an auth page as destination (loop guard)", () => {
    expect(sanitizeNext("/login")).toBe("/");
    expect(sanitizeNext("/login?next=/x")).toBe("/");
    expect(sanitizeNext("/signup")).toBe("/");
    expect(sanitizeNext("/loginfoo")).toBe("/loginfoo");
  });
});

describe("loginHref", () => {
  it("encodes a valid destination", () => {
    expect(loginHref("/obra/9?x=1")).toBe("/login?next=%2Fobra%2F9%3Fx%3D1");
  });
  it("drops an invalid destination instead of forwarding it", () => {
    expect(loginHref("https://evil.example")).toBe("/login");
    expect(loginHref("/login")).toBe("/login");
  });
});

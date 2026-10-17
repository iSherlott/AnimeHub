import { describe, expect, it } from "vitest";
import { sessionCookieSecure } from "./cookieSecure";

describe("sessionCookieSecure", () => {
  it("segue o ambiente quando nada foi configurado", () => {
    expect(sessionCookieSecure({ NODE_ENV: "production" })).toBe(true);
    expect(sessionCookieSecure({ NODE_ENV: "development" })).toBe(false);
    expect(sessionCookieSecure({})).toBe(false);
  });

  it("SESSION_COOKIE_SECURE=false libera o login por HTTP mesmo em produção", () => {
    expect(sessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "false" })).toBe(false);
  });

  it("SESSION_COOKIE_SECURE=true exige HTTPS em qualquer ambiente", () => {
    expect(sessionCookieSecure({ NODE_ENV: "development", SESSION_COOKIE_SECURE: "true" })).toBe(true);
  });

  it("valores desconhecidos não mudam o padrão", () => {
    expect(sessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "talvez" })).toBe(true);
  });
});

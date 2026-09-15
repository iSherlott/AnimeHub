import { describe, expect, it } from "vitest";
import { isValidHttpUrl } from "./url";

describe("isValidHttpUrl", () => {
  it("aceita URLs http/https", () => {
    expect(isValidHttpUrl("https://www.crunchyroll.com/series/x")).toBe(true);
    expect(isValidHttpUrl("http://example.com")).toBe(true);
  });

  it("rejeita texto que não é URL nenhuma", () => {
    expect(isValidHttpUrl("hello this is not a url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });

  // Achado real da 10ª rodada de auditoria (Epic 18): um dos 2 caminhos de
  // escrita de PlatformLink não usava essa função, então um javascript:
  // era aceito e gravado — o React 19 bloqueia no href na hora de
  // renderizar (não é XSS explorável), mas ainda é um link quebrado salvo
  // sem aviso nenhum.
  it("rejeita esquemas não-http (javascript:, data:, etc.)", () => {
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com/file")).toBe(false);
  });
});

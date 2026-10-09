import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "./plainText";

describe("htmlToPlainText", () => {
  it("turns <br> into newlines and drops tags", () => {
    expect(htmlToPlainText("Linha 1<br>Linha 2 <i>itálico</i>")).toBe("Linha 1\nLinha 2 itálico");
  });
  it("never leaves executable markup behind", () => {
    const out = htmlToPlainText('<img src=x onerror="alert(1)">oi<script>alert(1)</script>');
    expect(out).not.toContain("<");
    expect(out).toContain("oi");
  });
  it("decodes common entities and numeric references", () => {
    expect(htmlToPlainText("Tom &amp; Jerry &#39;x&#39; &#x41;")).toBe("Tom & Jerry 'x' A");
  });
  it("returns an empty string for null/undefined", () => {
    expect(htmlToPlainText(null)).toBe("");
    expect(htmlToPlainText(undefined)).toBe("");
  });
  it("leaves unknown entities untouched", () => {
    expect(htmlToPlainText("&foo;")).toBe("&foo;");
  });
});

import { sanitizeFuriganaHtml } from "./plainText";

describe("sanitizeFuriganaHtml", () => {
  it("keeps ruby markup and drops attributes", () => {
    expect(sanitizeFuriganaHtml('<ruby>薬<rp>(</rp><rt onclick="x()">くすり</rt><rp>)</rp></ruby>屋')).toBe(
      "<ruby>薬<rp>(</rp><rt>くすり</rt><rp>)</rp></ruby>屋"
    );
  });
  it("removes any other tag, including scripts and images", () => {
    const out = sanitizeFuriganaHtml('a<script>alert(1)</script><img src=x onerror=alert(1)>b');
    expect(out).not.toMatch(/<(script|img)/i);
    expect(out.startsWith("a")).toBe(true);
  });
  it("escapes stray angle brackets in text", () => {
    expect(sanitizeFuriganaHtml("1 < 2 and 3 > 2")).toBe("1 &lt; 2 and 3 &gt; 2");
  });
  it("returns empty for null", () => {
    expect(sanitizeFuriganaHtml(null)).toBe("");
  });
});

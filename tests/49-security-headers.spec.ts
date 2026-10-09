import { test, expect } from "@playwright/test";

test.describe("Cabeçalhos de segurança (GAP-S-07)", () => {
  test("páginas e APIs respondem com CSP, nosniff, Referrer-Policy e X-Frame-Options", async ({ request }) => {
    for (const url of ["/discover", "/api/calendar?weekOffset=0"]) {
      const res = await request.get(url);
      const h = res.headers();
      expect(h["x-content-type-options"], url).toBe("nosniff");
      expect(h["referrer-policy"], url).toBe("strict-origin-when-cross-origin");
      expect(h["x-frame-options"], url).toBe("DENY");
      expect(h["content-security-policy"], url).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"], url).toContain("object-src 'none'");
    }
  });

  test("a CSP não quebra a página: sem violações no console em Descobrir e na obra pública", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (/content security policy/i.test(msg.text())) violations.push(msg.text());
    });
    for (const url of ["/discover", "/calendar", "/"]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
    }
    expect(violations).toEqual([]);
  });
});

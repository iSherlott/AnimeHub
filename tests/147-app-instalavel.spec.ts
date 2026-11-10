import { test, expect } from "@playwright/test";

// Pedido de 10/11: o site pode ser instalado na tela inicial (abre em tela cheia, com o ícone da marca). Sem push: ele
// pede HTTPS, e o site roda em http na rede de casa.
test("o manifesto e os ícones do app instalável estão no ar, e a página aponta para eles", async ({ page, request }) => {
  await page.goto("/discover");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "Anime Hub", display: "standalone", start_url: "/dashboard", lang: "pt-BR" });
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  expect((manifest.icons as { purpose: string }[]).some((i) => i.purpose === "maskable")).toBe(true);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#08080b");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
});

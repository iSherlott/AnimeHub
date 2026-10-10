import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Voltar do painel, menu sem "Administração", botão de voltar ao topo e leituras (kana/furigana) dos títulos.
const KANA_ID = 965040;
const NATIVE = "薬屋のひとりごと";

const adminState = {
  cookies: [
    { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const },
  ],
  origins: [],
};

test.describe("Painel administrativo e menu", () => {
  test.use({ storageState: adminState });

  test("o painel tem caminho de volta ao Anime Hub", async ({ page }) => {
    await page.goto("/admin");
    const back = page.getByTestId("admin-back-to-site");
    await expect(back).toBeVisible();
    await expect(back).toContainText("Voltar ao Anime Hub");
    await back.click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("o menu principal não tem 'Administração' (o acesso é pelo menu do perfil) e 'Minha lista' virou 'Meus animes'", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Meus animes" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Administração" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Minha lista", exact: true })).toHaveCount(0);
  });
});

test.describe("Voltar ao topo", () => {
  test("aparece depois de rolar a página e leva ao topo", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByTestId("scroll-to-top")).toBeHidden();
    await page.evaluate(() => {
      document.body.style.minHeight = "5000px";
      window.scrollTo(0, 2500);
    });
    const button = page.getByTestId("scroll-to-top");
    await expect(button).toBeVisible();
    await expect(button).toHaveAccessibleName("Voltar ao topo");
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
    await expect(button).toBeHidden();
  });
});

test.describe("Leitura dos títulos japoneses", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: KANA_ID } },
      create: { userId: user.id, anilistId: KANA_ID, titleRomaji: "Kusuriya Round67", titleNative: NATIVE, titleEnglish: "The Apothecary Round67", genres: "" },
      update: {},
    });
  });

  test.afterAll(async () => {
    await prisma.anime.deleteMany({ where: { anilistId: KANA_ID } });
    await prisma.titleReading.deleteMany({ where: { text: NATIVE } });
    await prisma.$disconnect();
  });

  test("/api/readings devolve kana e furigana só para texto japonês", async ({ request }) => {
    const res = await request.post("/api/readings", { data: { texts: [NATIVE, "Only Latin", 42] }, timeout: 60_000 });
    expect(res.status()).toBe(200);
    const { readings } = await res.json();
    expect(Object.keys(readings)).toEqual([NATIVE]);
    expect(readings[NATIVE].kana).toBe("くすりやのひとりごと");
    expect(readings[NATIVE].html).toContain("<ruby>");
    // A leitura fica guardada: pedir de novo não gera outra linha.
    await request.post("/api/readings", { data: { texts: [NATIVE] } });
    expect(await prisma.titleReading.count({ where: { text: NATIVE } })).toBe(1);
  });

  test("Japonês (kanji + kana): o título original em destaque e a leitura em kana abaixo — não o romaji", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("anime-hub:title-preference", JSON.stringify({ language: "ja", japaneseScript: "kanji" })));
    await page.goto("/minha-lista");
    const row = page.getByText(NATIVE, { exact: true }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("くすりやのひとりごと", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("Japonês (kanji + furigana): o título original com a leitura em ruby", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("anime-hub:title-preference", JSON.stringify({ language: "ja", japaneseScript: "furigana" })));
    await page.goto("/minha-lista");
    await expect(page.locator("ruby").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("ruby rt").first()).toBeAttached();
  });
});

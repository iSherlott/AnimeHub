import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";

test.describe("Controle de acesso — dados pessoais exigem login", () => {
  // Roda sem a sessão fixa que o resto da suíte usa (ver playwright.config.ts)
  // — aqui o objetivo é justamente testar o comportamento sem login.
  test.use({ storageState: { cookies: [], origins: [] } });

  let anyAnimeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const anime = await prisma.anime.findFirst({ select: { id: true } });
    if (!anime) throw new Error("Esperava pelo menos um anime seedado para o teste");
    anyAnimeId = anime.id;
    await prisma.$disconnect();
  });

  test("Minha lista leva ao login, que devolve a pessoa à lista", async ({ page }) => {
    await page.goto("/minha-lista");
    await expect(page).toHaveURL(/\/login\?next=%2Fminha-lista$/);
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  // Sistema fechado (28/10): o Feed deixou de ser leitura pública — quem não entrou vai ao login.
  test("Feed (página principal) leva ao login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
    await expect(page.getByRole("tab", { name: "Para você" })).toHaveCount(0);
  });

  test("GET /api/posts exige login em todas as abas", async ({ request }) => {
    for (const tab of ["recommended", "recent", "following"]) {
      expect((await request.get(`/api/posts?tab=${tab}`)).status(), tab).toBe(401);
    }
  });

  test("página de detalhe de um anime não retorna dados sem login", async ({ page }) => {
    const res = await page.goto(`/anime/${anyAnimeId}`);
    expect(res?.status()).toBe(404);
  });

  test("Descobrir continua acessível sem login", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByPlaceholder("Buscar anime...")).toBeVisible();
  });

  test("Calendário continua acessível sem login", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: "Calendário" })).toBeVisible();
  });

  test("GET /api/anime retorna 401 sem sessão", async ({ request }) => {
    const res = await request.get("/api/anime");
    expect(res.status()).toBe(401);
  });

  test("POST /api/anime retorna 401 sem sessão", async ({ request }) => {
    const res = await request.post("/api/anime", { data: { anilistId: 999999 } });
    expect(res.status()).toBe(401);
  });
});

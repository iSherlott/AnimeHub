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

  test("Minha lista mostra prompt de login em vez da lista pessoal", async ({ page }) => {
    await page.goto("/minha-lista");

    await expect(page.getByText("Faça login para ver sua lista")).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();
  });

  // Achado real do redesenho do Feed: ao contrário da lista pessoal, o
  // Feed (agora a página principal) é público — Instagram/Twitter deixam
  // navegar o feed sem conta, só interagir (curtir/seguir/comentar) exige
  // login.
  test("Feed (página principal) carrega sem sessão nenhuma, sem prompt de login", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);

    await expect(page.getByText("Faça login para ver o feed")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Recomendado" })).toBeVisible();
    // "Seguindo" não existe sem conta.
    await expect(page.getByRole("tab", { name: "Seguindo" })).toHaveCount(0);
  });

  test("GET /api/posts?tab=recommended funciona sem sessão, mas tab=following exige login", async ({
    request,
  }) => {
    const recommended = await request.get("/api/posts?tab=recommended");
    expect(recommended.status()).toBe(200);

    const following = await request.get("/api/posts?tab=following");
    expect(following.status()).toBe(401);
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

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";

// Admin → Match name: o nome sugere continuações, o admin confirma/recusa e também junta obras à mão (Naruto → Boruto).
const AURA = 985001;
const AURA_BACK = 985002; // "Aurora Quartzo Round85 Retorno": complementa o nome
const BRISA = 985003;
const BRISA_EXTRA = 985004; // sugestão que o admin recusa
const FERRO = 985005;
const COBRE = 985006; // sem relação de nome com FERRO: só a junção manual liga
const IDS = [AURA, AURA_BACK, BRISA, BRISA_EXTRA, FERRO, COBRE];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const WORKS: Array<[number, string, "WINTER" | "SPRING" | "SUMMER" | "FALL", number]> = [
  [AURA, "Aurora Quartzo Round85", "FALL", 2030],
  [AURA_BACK, "Aurora Quartzo Round85 Retorno", "WINTER", 2033],
  [BRISA, "Brisa Lunar Round85", "SPRING", 2031],
  [BRISA_EXTRA, "Brisa Lunar Round85 Especial", "SUMMER", 2033],
  [FERRO, "Ferro Antigo Round85", "FALL", 2030],
  [COBRE, "Cobre Novo Round85", "FALL", 2034],
];

test.describe.serial("Match name — continuações pelo nome e junção manual", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;

  async function clean() {
    await prisma.workLink.deleteMany({ where: { OR: [{ earlierAnilistId: { in: IDS } }, { laterAnilistId: { in: IDS } }] } });
    await prisma.production.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: IDS } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: IDS } } });
  }

  const productionOf = (anilistId: number) => prisma.production.findUniqueOrThrow({ where: { anilistId } });

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    for (const [anilistId, title, season, seasonYear] of WORKS) {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: anilistId, name: title } });
      await prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji: title, seasonNumber: 1, season, seasonYear, format: "TV", genres: "Comedy", streamingLinksJson: "[]", fetchedAt: new Date() } });
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: title, season, seasonYear, genres: "Comedy", source: "anilist", onPlatform: true } });
    }
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a API exige admin", async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.get("/api/admin/work-links")).status()).toBe(401);
    expect((await guest.post("/api/admin/work-links", { data: { earlierAnilistId: AURA, laterAnilistId: AURA_BACK, decision: "confirm" } })).status()).toBe(401);
    await guest.dispose();
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
    expect((await member.get("/api/admin/work-links/search?q=aurora")).status()).toBe(403);
    expect((await member.delete("/api/admin/work-links?id=x")).status()).toBe(403);
    await member.dispose();
  });

  test("valida o corpo da decisão", async ({ request }) => {
    expect((await request.post("/api/admin/work-links", { data: { earlierAnilistId: AURA, laterAnilistId: AURA, decision: "confirm" } })).status()).toBe(422);
    expect((await request.post("/api/admin/work-links", { data: { earlierAnilistId: AURA, laterAnilistId: AURA_BACK, decision: "talvez" } })).status()).toBe(400);
    expect((await request.post("/api/admin/work-links", { data: { earlierAnilistId: "x", laterAnilistId: AURA_BACK, decision: "confirm" } })).status()).toBe(400);
  });

  test("o menu troca AniList por Match name e a tela sugere as continuações pelo nome", async ({ page }) => {
    await page.goto("/admin/match-name");
    const nav = page.getByRole("navigation", { name: "Administração" });
    await expect(nav.getByRole("link", { name: "Match name" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "AniList" })).toHaveCount(0);

    const retorno = page.getByTestId(`suggestion-${AURA_BACK}`);
    await expect(retorno).toContainText("Aurora Quartzo Round85");
    await expect(retorno).toContainText("complementa o nome");
    await expect(page.getByTestId(`suggestion-${BRISA_EXTRA}`)).toBeVisible();
    // Sem relação de nome: nada sugerido.
    await expect(page.getByTestId(`suggestion-${COBRE}`)).toHaveCount(0);
  });

  test("confirmar junta as duas na mesma franquia, com a nova como a temporada seguinte", async ({ page }) => {
    await page.goto("/admin/match-name");
    await page.getByTestId(`confirm-${AURA_BACK}`).click();
    await expect(page.getByTestId("match-name-done")).toContainText("agora é continuação");
    await expect(page.getByTestId(`suggestion-${AURA_BACK}`)).toHaveCount(0);
    await expect(page.getByTestId(`decided-${AURA_BACK}`)).toHaveAttribute("data-status", "CONFIRMED");

    const [first, second] = [await productionOf(AURA), await productionOf(AURA_BACK)];
    expect(second.franchiseId).toBe(first.franchiseId);
    expect(first.seasonNumber).toBe(1);
    expect(second.seasonNumber).toBe(2);
    expect(await prisma.franchise.count({ where: { rootAnilistId: AURA_BACK } })).toBe(0); // a franquia vazia sumiu
  });

  test("a página da obra mostra as duas temporadas juntas", async ({ page }) => {
    await page.goto(`/anime/${AURA_BACK}`);
    await expect(page.getByText("Aurora Quartzo Round85", { exact: true }).first()).toBeVisible();
  });

  test("recusar tira a sugestão e ela não volta; desfazer a traz de volta", async ({ page }) => {
    await page.goto("/admin/match-name");
    await page.getByTestId(`reject-${BRISA_EXTRA}`).click();
    await expect(page.getByTestId("match-name-done")).toContainText("não é continuação");
    await expect(page.getByTestId(`suggestion-${BRISA_EXTRA}`)).toHaveCount(0);
    await expect(page.getByTestId(`decided-${BRISA_EXTRA}`)).toHaveAttribute("data-status", "REJECTED");
    // Nada foi juntado.
    expect((await productionOf(BRISA)).franchiseId).not.toBe((await productionOf(BRISA_EXTRA)).franchiseId);

    await page.reload();
    await expect(page.getByTestId(`suggestion-${BRISA_EXTRA}`)).toHaveCount(0);
    await page.getByTestId(`undo-${BRISA_EXTRA}`).click();
    await expect(page.getByTestId(`suggestion-${BRISA_EXTRA}`)).toBeVisible();
  });

  test("juntar à mão: busca as duas obras pelo nome e liga mesmo sem relação de nome", async ({ page }) => {
    await page.goto("/admin/match-name");
    await expect(page.getByTestId("join-works")).toBeDisabled();

    await page.getByTestId("pick-earlier").getByRole("textbox").fill("Ferro Antigo Round85");
    await page.getByTestId(`pick-earlier-result-${FERRO}`).click();
    await page.getByTestId("pick-later").getByRole("textbox").fill("Cobre Novo Round85");
    await page.getByTestId(`pick-later-result-${COBRE}`).click();
    await page.getByTestId("join-works").click();

    await expect(page.getByTestId("match-name-done")).toContainText("Cobre Novo Round85 agora é continuação de Ferro Antigo Round85");
    await expect(page.getByTestId(`decided-${COBRE}`)).toContainText("Junção manual");
    const [a, b] = [await productionOf(FERRO), await productionOf(COBRE)];
    expect(b.franchiseId).toBe(a.franchiseId);
    expect(b.seasonNumber).toBe(2);
  });

  test("a ligação sobrevive a uma nova leitura da franquia pela AniList", async () => {
    // A AniList refaz a franquia pelas relações dela; a decisão do admin é reaplicada em seguida.
    const { reapplyLinksFor } = await import("../src/lib/workLinks");
    const cobre = await productionOf(COBRE);
    const own = await prisma.franchise.create({ data: { rootAnilistId: COBRE, name: "Cobre Novo Round85" } });
    await prisma.production.update({ where: { id: cobre.id }, data: { franchiseId: own.id, seasonNumber: 1 } });
    await reapplyLinksFor(COBRE, prisma);
    const [a, b] = [await productionOf(FERRO), await productionOf(COBRE)];
    expect(b.franchiseId).toBe(a.franchiseId);
    expect(b.seasonNumber).toBe(2);
  });

  test("desfazer separa de novo as franquias, com os números de antes", async ({ page }) => {
    await page.goto("/admin/match-name");
    await page.getByTestId(`undo-${AURA_BACK}`).click();
    await expect(page.getByTestId("match-name-done")).toContainText("Ligação desfeita");
    const [a, b] = [await productionOf(AURA), await productionOf(AURA_BACK)];
    expect(b.franchiseId).not.toBe(a.franchiseId);
    expect(b.seasonNumber).toBe(1);
    expect((await prisma.franchise.findUniqueOrThrow({ where: { id: b.franchiseId } })).rootAnilistId).toBe(AURA_BACK);
    // E a sugestão pode voltar a aparecer.
    await expect(page.getByTestId(`suggestion-${AURA_BACK}`)).toBeVisible();
  });
});

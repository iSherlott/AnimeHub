import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { seedGlobalEpisodes, clearGlobalEpisodes } from "./global-episodes";
import { TEST_USER_EMAIL } from "./test-auth";

// Revisão das telas antigas (27/10): a temporada usa a agenda global quando o catálogo não traz o próximo episódio (e o
// selo diz "PRÓXIMO EPISÓDIO"); a página da obra recorre à sinopse do catálogo e não repete o título; Minha Lista usa os
// nomes únicos do andamento e empilha a linha no celular; o calendário usa o título e a capa da obra da lista.
const A = 133001;
const DONE = 133002;

test.describe.serial("Telas antigas", () => {
  let prisma: PrismaClient;
  let userId = "";
  let animeId = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.anime.deleteMany({ where: { anilistId: { in: [A, DONE] } } });
    await clearGlobalEpisodes(prisma, [A, DONE]);
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [A, DONE] } } });
    const base = { source: "anilist", onPlatform: true, kind: "EPISODE", format: "TV", season: "FALL", seasonYear: 2026, timelineOrder: 1 };
    await prisma.catalogEntry.create({ data: { ...base, status: "RELEASING", anilistId: A, franchiseKey: A, titleRomaji: "Telas Round133", titleNative: "画面１３３", descriptionPt: "Sinopse do catálogo 133." } });
    await prisma.catalogEntry.create({ data: { ...base, status: "FINISHED", anilistId: DONE, franchiseKey: DONE, titleRomaji: "Terminada Round133" } });
    // A obra da lista sem sinopse (a página deve usar a do catálogo).
    animeId = (await prisma.anime.create({ data: { userId, anilistId: A, titleRomaji: "Telas Round133", titleNative: "画面１３３", genres: "", status: "RELEASING", season: "FALL", seasonYear: 2026 } })).id;
    await prisma.anime.create({ data: { userId, anilistId: DONE, titleRomaji: "Terminada Round133", genres: "", status: "FINISHED" } });
    // Agenda global sem título japonês (como as linhas da Kitsu/AniDB).
    await seedGlobalEpisodes(prisma, A, { titleRomaji: "Telas Round133" }, [{ number: 4, airingAt: new Date(Date.now() + 26 * 3_600_000) }]);
  });

  test.afterAll(async () => {
    await prisma.anime.deleteMany({ where: { anilistId: { in: [A, DONE] } } });
    await clearGlobalEpisodes(prisma, [A, DONE]);
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [A, DONE] } } });
    await prisma.$disconnect();
  });

  test("temporada: data pela agenda global e selo 'PRÓXIMO EPISÓDIO'", async ({ page }) => {
    await page.goto("/temporada/autumn2026");
    const card = page.getByTestId(`explore-card-anilist-${A}`);
    await expect(card).toContainText("PRÓXIMO EPISÓDIO · EP04");
    await expect(card).not.toContainText("Data não definida");
  });

  test("página da obra: sinopse do catálogo e título sem repetição", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await expect(page.getByText("Sinopse do catálogo 133.")).toBeVisible();
    await expect(page.getByText("Sem sinopse disponível.")).toHaveCount(0);
    // A linha de baixo nunca repete o título principal.
    const main = (await page.getByTestId("anime-title").innerText()).trim();
    const alts = (await page.getByTestId("anime-alt-title").allInnerTexts()).map((t) => t.trim());
    expect(alts).not.toContain(main);
    expect(alts.length).toBeGreaterThan(0);
  });

  test("Minha Lista: 'Terminei' e 'Não terminei'; no celular a linha empilha", async ({ page }) => {
    await page.goto("/minha-lista");
    await page.getByLabel("Buscar na minha lista").fill("Terminada Round133");
    await expect(page.getByTestId(`finished-done-${DONE}`)).toHaveText("Terminei");
    await expect(page.getByTestId(`finished-pending-${DONE}`)).toHaveText("Não terminei");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByLabel("Buscar na minha lista").fill("Telas Round133");
    const row = page.getByTestId(`anime-card-${animeId}`);
    const time = (await row.getByTestId("card-next").boundingBox())!;
    const title = (await row.getByRole("link", { name: /画面１３３|Telas Round133/ }).first().boundingBox())!;
    // O horário fica numa linha, acima do título (não lado a lado), e o título tem largura de verdade.
    expect(title.y).toBeGreaterThan(time.y + time.height - 2);
    expect(title.width).toBeGreaterThan(60);
  });

  test("calendário: título japonês e capa da obra da lista quando a agenda não traz", async ({ request }) => {
    const items = (await (await request.get("/api/calendar?weekOffset=0")).json()).results as Array<{ anilistId: number; titleNative: string | null }>;
    const item = items.find((i) => i.anilistId === A);
    if (item) expect(item.titleNative).toBe("画面１３３");
    else {
      // O episódio de amanhã pode cair na semana seguinte (domingo → segunda).
      const next = (await (await request.get("/api/calendar?weekOffset=1")).json()).results as Array<{ anilistId: number; titleNative: string | null }>;
      expect(next.find((i) => i.anilistId === A)?.titleNative).toBe("画面１３３");
    }
  });
});

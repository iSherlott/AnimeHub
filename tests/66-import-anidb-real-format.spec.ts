import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// A listagem de temporada do próprio AniDB (caixas "g_bubble box", sem <article>) é aceita; o catálogo da
// temporada (obras ainda sem página) entra no matching e a sinopse/links da fonte seguem para o commit.
const CATALOG_ONLY = { anilistId: 965031, anidbId: 29031, title: "Vxq Catalogo Soh Round66" };
const PRODUCED = { anilistId: 965032, anidbId: 29032, title: "Mnb Producao Round66" };
const BRAND_NEW = { anidbId: 29033, title: "Zzk Obra Inedita Round66" };

const adminState = {
  cookies: [
    { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const },
  ],
  origins: [],
};

function currentSeasonNow(): { season: string; seasonYear: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const season = month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL";
  return { season, seasonYear: now.getFullYear() };
}

function box(n: number, anidbId: number, title: string, day: string, general: string, extra = "") {
  return `
  <div class="g_bubble box no${n}" id="a${anidbId}">
    <div class="thumb image"><a href="/anime/${anidbId}"><picture><img loading="lazy" alt="${title}" src="https://cdn.anidb.net/images/150/${anidbId}.jpg-thumb.jpg"></picture></a></div>
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/${anidbId}">${title}</a></div>
      <div class="date">${day}</div>
      <div class="general">${general}</div>
      ${extra}
    </div>
  </div>`;
}

const html = `<div class="g_bubblewrap g_bubble container">
${box(1, CATALOG_ONLY.anidbId, CATALOG_ONLY.title, "4th October", "TV Series, 12 eps", `<div class="icons actions"><a class="i_icon brand i_resource_crunchyroll" href="https://www.crunchyroll.com/series/R66A/"><span>stream</span></a></div><div class="desc">Sinopse vinda do AniDB &amp; seus amigos.</div>`)}
${box(2, PRODUCED.anidbId, PRODUCED.title, "5th October", "TV Series, 24 eps", `<div class="icons actions"><a class="i_icon brand i_resource_netflix" href="https://www.netflix.com/title/66"><span>stream</span></a></div>`)}
${box(3, BRAND_NEW.anidbId, BRAND_NEW.title, "11th December", "Movie, 1 ep", `<div class="desc">Um filme inédito.</div>`)}
</div>`;

test.describe("Importação — listagem de temporada do AniDB", () => {
  test.use({ storageState: adminState });
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let seq = 0;

  async function cleanup() {
    await prisma.adminJob.deleteMany({ where: { records: { some: { sourceKey: { in: [String(CATALOG_ONLY.anidbId), String(PRODUCED.anidbId), String(BRAND_NEW.anidbId)] } } } } });
    await prisma.catalogEntry.deleteMany({ where: { OR: [{ anilistId: CATALOG_ONLY.anilistId }, { anidbId: BRAND_NEW.anidbId }] } });
    await prisma.production.deleteMany({ where: { anilistId: { in: [CATALOG_ONLY.anilistId, PRODUCED.anilistId] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [CATALOG_ONLY.anilistId, PRODUCED.anilistId] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await cleanup();
    const { season, seasonYear } = currentSeasonNow();
    await prisma.catalogEntry.create({ data: { anilistId: CATALOG_ONLY.anilistId, titleRomaji: CATALOG_ONLY.title, season, seasonYear, source: "anilist" } });
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: PRODUCED.anilistId, name: PRODUCED.title } });
    await prisma.production.create({ data: { anilistId: PRODUCED.anilistId, franchiseId: franchise.id, titleRomaji: PRODUCED.title, season, seasonYear, format: "TV", streamingLinksJson: "[]", fetchedAt: new Date() } });
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("a listagem real é lida: 3 encontrados, os 2 do catálogo casam sozinhos e 1 é novo", async ({ page }) => {
    await page.goto("/admin/importacoes");
    await page.getByLabel("HTML da temporada").fill(html);
    await page.getByRole("button", { name: "Analisar" }).click();
    await expect(page).toHaveURL(/\/admin\/importacoes\/\d+$/, { timeout: 30_000 });
    seq = Number(page.url().split("/").pop());

    await expect(page.getByTestId("result-found")).toContainText("3");
    await expect(page.getByTestId("result-matched")).toContainText("2");
    await expect(page.getByTestId("result-new")).toContainText("1");
    await expect(page.getByTestId("result-pending")).toContainText("0");

    // A obra que só estava no catálogo da temporada entrou no matching; sinopse, links e imagem foram guardados.
    const rec = await prisma.importRecord.findFirstOrThrow({ where: { jobSeq: seq, sourceKey: String(CATALOG_ONLY.anidbId) } });
    expect(rec.matchedProductionId).toBe(`ce:${CATALOG_ONLY.anilistId}`);
    expect(rec.matchedAnilistId).toBe(CATALOG_ONLY.anilistId);
    expect(rec.description).toBe("Sinopse vinda do AniDB & seus amigos.");
    expect(rec.episodes).toBe(12);
    expect(rec.imageUrl).toBe(`https://cdn.anidb.net/images/150/${CATALOG_ONLY.anidbId}.jpg-thumb.jpg`);
    expect(JSON.parse(rec.linksJson ?? "[]")).toEqual([{ site: "Crunchyroll", url: "https://www.crunchyroll.com/series/R66A/" }]);
    // A data do dia não inventa horário.
    expect(rec.airsAtHasTime).toBe(false);
    expect(rec.airsAt?.toISOString().slice(5, 10)).toBe("10-04");
  });

  test("a busca de 'Outro candidato' também encontra obras só do catálogo da temporada", async ({ request }) => {
    const data = await (await request.get("/api/admin/productions?q=Vxq Catalogo")).json();
    expect(data.results).toEqual([expect.objectContaining({ id: `ce:${CATALOG_ONLY.anilistId}`, anilistId: CATALOG_ONLY.anilistId, franchise: null })]);
  });

  test("confirmar aplica vínculo, links do AniDB e a obra nova com sinopse e capa — nada antes", async ({ page }) => {
    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: PRODUCED.anilistId } })).anidbId).toBeNull();
    expect(await prisma.catalogEntry.count({ where: { anidbId: BRAND_NEW.anidbId } })).toBe(0);

    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByTestId("confirm-import").click();
    await page.getByTestId("confirm-import-dialog").click();
    await expect(page).toHaveURL(`/admin/jobs/${seq}`, { timeout: 30_000 });
    await expect(page.getByTestId("job-progress")).toContainText("Success");

    const produced = await prisma.production.findUniqueOrThrow({ where: { anilistId: PRODUCED.anilistId } });
    expect(produced.anidbId).toBe(PRODUCED.anidbId);
    expect(JSON.parse(produced.streamingLinksJson ?? "[]")).toEqual([{ site: "Netflix", url: "https://www.netflix.com/title/66" }]);

    const created = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: BRAND_NEW.anidbId } });
    expect(created).toMatchObject({ titleRomaji: BRAND_NEW.title, description: "Um filme inédito.", episodes: 1, source: "anidb" });
    expect(created.coverImage).toContain(String(BRAND_NEW.anidbId));
  });

  test("o Catálogo do admin pagina TODAS as obras do catálogo (nenhuma some por limite)", async ({ page }) => {
    await prisma.catalogEntry.createMany({
      data: Array.from({ length: 70 }, (_, i) => ({ anilistId: 966000 + i, titleRomaji: `Zz Pagina Round66 ${String(i).padStart(2, "0")}`, season: "FALL", seasonYear: 2026, source: "anilist" })),
    });
    try {
      const seen = new Set<string>();
      for (const pageIndex of [0, 1, 2]) {
        await page.goto(`/admin/catalogo?q=${encodeURIComponent("Zz Pagina Round66")}${pageIndex ? `&page=${pageIndex}` : ""}`);
        const rows = page.getByTestId("admin-catalog-table").locator("tbody tr");
        for (const text of await rows.allInnerTexts()) seen.add(text.match(/Zz Pagina Round66 \d\d/)?.[0] ?? text);
      }
      expect(seen.size).toBe(70);
      await expect(page.getByTestId("admin-catalog-count")).toContainText("70 obras só no catálogo");
    } finally {
      await prisma.catalogEntry.deleteMany({ where: { anilistId: { gte: 966000, lt: 966070 } } });
    }
  });

  test("o Catálogo do admin lista também as obras do catálogo da temporada sem página", async ({ page }) => {
    await page.goto(`/admin/catalogo?q=${encodeURIComponent("Round66")}`);
    const table = page.getByTestId("admin-catalog-table");
    await expect(table).toContainText(BRAND_NEW.title);
    await expect(table).toContainText(PRODUCED.title);
  });
});

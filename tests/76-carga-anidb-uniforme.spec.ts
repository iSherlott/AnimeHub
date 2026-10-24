import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Carga uniforme: toda obra do HTML do AniDB chega à plataforma com capa inteira, gêneros e status coerente;
// conteúdo adulto entra na categoria Hentai; "Reaplicar vínculos" refaz o lote sem duplicar nada.
const FUTURE = { anidbId: 29761, title: "Qwe Comedia Futura Round76" };
const RUNNING = { anidbId: 29762, title: "Asd Serie Em Exibicao Round76" };
const ADULT = { anidbId: 29763, title: "Zxc Obra Adulta Round76" };
const IDS = [FUTURE.anidbId, RUNNING.anidbId, ADULT.anidbId];

const adminState = {
  cookies: [
    { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const },
  ],
  origins: [],
};

function tag(name: string) {
  return `<span class="g_tag"><a href="/tag/1"><span class="tagname">${name}</span></a></span>`;
}

function box(n: number, anidbId: number, title: string, day: string, general: string, tags: string[]) {
  return `
  <div class="g_bubble box no${n}" id="a${anidbId}">
    <div class="thumb image"><a href="/anime/${anidbId}"><picture><img loading="lazy" alt="${title}" src="https://cdn.anidb.net/images/150/${anidbId}.jpg-thumb.jpg"></picture></a></div>
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/${anidbId}">${title}</a></div>
      <div class="date">${day}</div>
      <div class="general">${general}</div>
      <div class="tags">${tags.map(tag).join(", ")}</div>
    </div>
  </div>`;
}

// Julho/2026 já passou (hoje é outubro): 24 episódios semanais ainda cabem no ar; dezembro ainda não estreou.
const html = `<div class="g_bubblewrap g_bubble container">
${box(1, FUTURE.anidbId, FUTURE.title, "11th December", "TV Series, 12 eps", ["comedy", "romance", "school life"])}
${box(2, RUNNING.anidbId, RUNNING.title, "5th July", "TV Series, 24 eps", ["adventure"])}
${box(3, ADULT.anidbId, ADULT.title, "6th July", "TV Series, 12 eps", ["nudity", "sex"])}
</div>`;

test.describe("Carga do AniDB — uniforme", () => {
  test.use({ storageState: adminState });
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let seq = 0;

  async function cleanup() {
    await prisma.adminJob.deleteMany({ where: { records: { some: { sourceKey: { in: IDS.map(String) } } } } });
    await prisma.catalogEntry.deleteMany({ where: { anidbId: { in: IDS } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await cleanup();
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("conteúdo adulto segue como novo, já na categoria Hentai; os demais também", async ({ page }) => {
    await page.goto("/admin/importacoes");
    await page.getByLabel("HTML da temporada").fill(html);
    await page.getByRole("button", { name: "Analisar" }).click();
    await expect(page).toHaveURL(/\/admin\/importacoes\/\d+$/, { timeout: 30_000 });
    seq = Number(page.url().split("/").pop());

    await expect(page.getByTestId("result-found")).toContainText("3");
    await expect(page.getByTestId("result-new")).toContainText("3");
    await expect(page.getByTestId("result-pending")).toContainText("0");

    const adult = await prisma.importRecord.findFirstOrThrow({ where: { jobSeq: seq, sourceKey: String(ADULT.anidbId) } });
    expect(adult.state).not.toBe("IGNORED");
    expect(adult.genres?.split(",")).toContain("Hentai"); // a tag "sex" do AniDB põe a obra na categoria
    const comedy = await prisma.importRecord.findFirstOrThrow({ where: { jobSeq: seq, sourceKey: String(FUTURE.anidbId) } });
    expect(comedy.genres).toBe("Comedy,Romance");
  });

  test("confirmar entrega capa inteira, gêneros e status; o adulto entra como Hentai e o resumo é mostrado", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByTestId("confirm-import").click();
    await page.getByTestId("confirm-import-dialog").click();
    await expect(page).toHaveURL(`/admin/jobs/${seq}`, { timeout: 30_000 });
    await expect(page.getByTestId("job-progress")).toContainText("Success");

    const future = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: FUTURE.anidbId } });
    expect(future.onPlatform).toBe(true);
    expect(future.coverImage).toBe(`https://cdn.anidb.net/images/main/${FUTURE.anidbId}.jpg`);
    expect(future.genres).toContain("Comedy");
    expect(future.status).toBe("NOT_YET_RELEASED");

    const running = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: RUNNING.anidbId } });
    expect(running.status).toBe("RELEASING");
    expect(running.genres).toContain("Adventure");

    const adult = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: ADULT.anidbId } });
    expect(adult.onPlatform).toBe(true);
    expect(adult.genres?.split(",")).toContain("Hentai");

    await page.goto(`/admin/importacoes/${seq}`);
    await expect(page.getByTestId("result-done")).toContainText("3 novas");
  });

  test("Reaplicar vínculos refaz o lote sem duplicar obras", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByTestId("reapply-import").click();
    await expect(page.getByTestId("reapply-result")).toContainText("Lote reaplicado");
    expect(await prisma.catalogEntry.count({ where: { anidbId: { in: IDS } } })).toBe(3);
  });

  test("a capa do AniDB é aceita pelo otimizador de imagens (host liberado)", async ({ request }) => {
    const cover = encodeURIComponent(`https://cdn.anidb.net/images/main/${FUTURE.anidbId}.jpg`);
    const res = await request.get(`/_next/image?url=${cover}&w=640&q=75`);
    expect(res.status()).not.toBe(400); // 400 = host fora de images.remotePatterns (capa em branco)
  });
});

import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Explorar: o filtro "Tipo" (série, filme, OVA…) só lista tipos que existem no catálogo, e a importação grava o tipo da obra nova.
const GENRE = "Round92Tipo";
const SERIES = 992001;
const MOVIE = 992002;
const UNKNOWN = 992003; // tipo ainda não conhecido: some ao filtrar por tipo
const IDS = [SERIES, MOVIE, UNKNOWN];
const ANIDB_NEW = 29921;

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Explorar — filtro Tipo", () => {
  let prisma: PrismaClient;

  async function clean() {
    await prisma.adminJob.deleteMany({ where: { records: { some: { sourceKey: String(ANIDB_NEW) } } } });
    await deleteCatalogEntries(prisma, { where: { OR: [{ anilistId: { in: IDS } }, { anidbId: ANIDB_NEW }] } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const base = { genres: GENRE, source: "anilist", onPlatform: true, season: "WINTER", seasonYear: 2024 } as const;
    await prisma.catalogEntry.create({ data: { ...base, anilistId: SERIES, titleRomaji: "Serie Round92", format: "TV", kind: "EPISODE" } });
    await prisma.catalogEntry.create({ data: { ...base, anilistId: MOVIE, titleRomaji: "Filme Round92", format: "MOVIE", kind: "MOVIE" } });
    await prisma.catalogEntry.create({ data: { ...base, anilistId: UNKNOWN, titleRomaji: "Sem Tipo Round92", format: null, kind: null } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("o catálogo traz o tipo de cada obra", async ({ request }) => {
    const { results } = (await (await request.get("/api/catalog")).json()) as { results: Array<{ anilistId: number | null; format: string | null; kind: string | null }> };
    const formatOf = (id: number) => results.find((r) => r.anilistId === id)?.format;
    expect(formatOf(SERIES)).toBe("TV");
    expect(formatOf(MOVIE)).toBe("MOVIE");
    expect(formatOf(UNKNOWN)).toBeNull();
    const kindOf = (id: number) => results.find((r) => r.anilistId === id)?.kind;
    expect(kindOf(SERIES)).toBe("EPISODE");
    expect(kindOf(MOVIE)).toBe("MOVIE");
    expect(kindOf(UNKNOWN)).toBeNull();
  });

  test("Tipo filtra as obras e só oferece os tipos que existem", async ({ page }) => {
    await page.goto("/discover");
    const tipo = page.getByLabel("Tipo");
    await expect(tipo.locator("option", { hasText: "Filme" })).toHaveCount(1); // o catálogo chega depois da página
    const labels = await tipo.locator("option").allTextContents();
    expect(labels[0]).toBe("Todos os tipos");
    expect(labels).toContain("Episódios");
    expect(labels).toContain("Filme");

    await page.getByLabel("Gênero").selectOption(GENRE);
    await expect(page.getByRole("link", { name: "Serie Round92" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Filme Round92" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sem Tipo Round92" }).first()).toBeVisible();

    await tipo.selectOption("MOVIE"); // valor = tipo na linha da história (kind)
    await expect(page.getByRole("link", { name: "Filme Round92" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Serie Round92" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sem Tipo Round92" })).toHaveCount(0);

    await tipo.selectOption("");
    await expect(page.getByRole("link", { name: "Serie Round92" }).first()).toBeVisible();
  });

  test("a importação grava o tipo da obra nova", async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: adminState });
    const html = `<div class="g_bubblewrap g_bubble container">
      <div class="g_bubble box no1" id="a${ANIDB_NEW}"><div class="data">
        <div class="wrap name"><a class="name-colored" href="/anime/${ANIDB_NEW}">Obra Nova Tipo Round92</a></div>
        <div class="date">12th January</div><div class="general">Movie, 1 eps</div>
      </div></div></div>`;
    const analyzed = await admin.post("/api/admin/imports", { data: { html, source: "AniDB", season: "Winter2024" } });
    expect(analyzed.status()).toBe(201);
    const { seq } = await analyzed.json();
    // Se algum título do catálogo parecer com esta obra, ela volta como pendência: é uma obra nova mesmo.
    const pending = await prisma.importRecord.findMany({ where: { jobSeq: seq, state: "PENDING" }, select: { id: true } });
    if (pending.length) await admin.patch(`/api/admin/imports/${seq}/records`, { data: { decisions: pending.map((p) => ({ id: p.id, action: "new" })) } });
    const committed = await admin.post(`/api/admin/imports/${seq}/commit`);
    expect(committed.status()).toBe(200);
    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: ANIDB_NEW } });
    expect(entry.format).toBe("MOVIE");
    expect(entry.kind).toBe("MOVIE");
    await admin.dispose();
  });
});

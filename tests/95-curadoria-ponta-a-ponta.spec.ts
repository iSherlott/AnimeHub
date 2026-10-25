import { createServer, type Server } from "node:http";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Curadoria de ponta a ponta: o admin pede a curadoria de algumas obras, o servidor busca na AniList (falsa, mesma porta que
// o servidor de teste usa), completa títulos, sinopse, gêneros, tipo, site oficial e relações, e deixa o resto em pendências.
const WORK = 995001; // série a curar
const OVA = 995002; // OVA dela, sem nada além do básico
const ADULT = 995003; // a AniList a marca como adulta
const GONE = 995005; // a AniList não devolve (removida)
const IDS = [WORK, OVA, ADULT, GONE];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const base = { idMal: null, coverImage: { extraLarge: null }, bannerImage: null, episodes: 12, status: "FINISHED", season: "FALL", seasonYear: 2020, averageScore: null, startDate: { year: 2020, month: 10, day: 1 }, endDate: null, nextAiringEpisode: null };
const FAKE = [
  {
    ...base,
    id: WORK,
    title: { romaji: "Curar Round95", english: "Curating Round95", native: "キュレーション" },
    description: "A work to curate.",
    format: "TV",
    genres: ["Drama", "Action", "Comedy"],
    tags: [
      { name: "Shounen", rank: 80, isAdult: false },
      { name: "Isekai", rank: 30, isAdult: false }, // pouco relevante: não vira gênero
    ],
    externalLinks: [{ site: "Official Site", url: "https://curar95.example/", type: "INFO", isDisabled: false }],
    isAdult: false,
    relations: {
      edges: [
        { relationType: "SIDE_STORY", node: { id: OVA, type: "ANIME", format: "OVA", title: { romaji: "Curar Round95 OVA" } } },
        { relationType: "ADAPTATION", node: { id: 1, type: "MANGA", format: "MANGA", title: { romaji: "Manga" } } }, // não é anime: fica de fora
      ],
    },
  },
  {
    ...base,
    id: OVA,
    title: { romaji: "Curar Round95 OVA", english: null, native: null },
    description: null,
    format: "OVA",
    genres: ["Comedy"],
    tags: [],
    externalLinks: [],
    isAdult: false,
    relations: { edges: [{ relationType: "PARENT", node: { id: WORK, type: "ANIME", format: "TV", title: { romaji: "Curar Round95" } } }] },
  },
  { ...base, id: ADULT, title: { romaji: "Adulta Round95", english: null, native: null }, description: "x", format: "OVA", genres: ["Hentai"], tags: [], externalLinks: [], isAdult: true, relations: { edges: [] } },
];

test.describe.serial("Curadoria de ponta a ponta", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let anilist: Server;
  let userId: string;

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { anilistId: { in: IDS } }, select: { id: true } });
    await prisma.curationIssue.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
    await prisma.synopsisTranslation.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: IDS } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: IDS } } });
    await prisma.adminJob.deleteMany({ where: { kind: "CURATION", adminName: { not: null } } });
    await prisma.adminJob.deleteMany({ where: { kind: "IMPORT", html: { contains: "a995010" } } });
  }

  async function runAndWait(request: import("@playwright/test").APIRequestContext) {
    const before = (await (await request.get("/api/admin/curation")).json()).job?.seq ?? 0;
    const started = await request.post("/api/admin/curation", { data: { anilistIds: IDS } });
    expect(started.status()).toBe(202);
    await expect
      .poll(async () => {
        const status = await (await request.get("/api/admin/curation")).json();
        return status.job && status.job.seq > before ? status.job.state : "WAITING";
      }, { timeout: 60_000 })
      .toBe("SUCCESS");
    return (await (await request.get("/api/admin/curation")).json()).progress;
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { query, variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { query: string; variables: Record<string, unknown> };
        res.setHeader("Content-Type", "application/json");
        if (query.includes("id_in")) {
          const wanted = new Set((variables.ids as number[]) ?? []);
          res.end(JSON.stringify({ data: { Page: { media: FAKE.filter((m) => wanted.has(m.id)) } } }));
        } else {
          res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media: [], airingSchedules: [] } } }));
        }
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();

    const old = { source: "anilist", onPlatform: true } as const;
    // Dados "de antes": gêneros do vocabulário antigo, sem títulos, sem sinopse, sem tipo.
    const workEntry = await prisma.catalogEntry.create({ data: { ...old, anilistId: WORK, anidbId: 995010, titleRomaji: "Curar Round95", genres: "Supernatural,Comedy" } });
    // A carga do AniDB que trouxe a obra: o HTML guardado tem a tag "josei", que a lista antiga de gêneros descartava.
    await prisma.adminJob.create({
      data: {
        kind: "IMPORT",
        source: "AniDB",
        season: "Autumn2020",
        state: "SUCCESS",
        stage: "NOTIFICATION",
        html: '<div class="g_bubblewrap g_bubble container"><div class="g_bubble box no1" id="a995010"><div class="data"><div class="wrap name"><a class="name-colored" href="/anime/995010">Curar Round95</a></div><div class="date">1st October</div><div class="general">TV Series, 12 eps</div><div class="tags"><span class="tagname">josei</span><span class="tagname">fantasy</span></div></div></div></div>',
      },
    });
    await prisma.catalogEntry.create({ data: { ...old, anilistId: OVA, titleRomaji: "Curar Round95 OVA", genres: "Comedy" } });
    await prisma.catalogEntry.create({ data: { ...old, anilistId: ADULT, titleRomaji: "Adulta Round95", genres: "Comedy" } });
    await prisma.catalogEntry.create({ data: { ...old, anilistId: GONE, titleRomaji: "Sumida Round95", format: "ONA", genres: "Drama", description: "Já tinha.", titleEnglish: "Gone", titleNative: "消えた", officialSite: "https://gone.example" } });
    // As cópias da obra (produção e lista de quem acompanha) também recebem os gêneros novos.
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: WORK, name: "Curar Round95" } });
    await prisma.production.create({ data: { anilistId: WORK, franchiseId: franchise.id, titleRomaji: "Curar Round95", seasonNumber: 1, genres: "Supernatural,Comedy", streamingLinksJson: "[]", fetchedAt: new Date() } });
    await prisma.anime.create({ data: { userId, anilistId: WORK, titleRomaji: "Curar Round95", genres: "Supernatural,Comedy", watchState: "FINISHED", userScore: 10 } });
    await prisma.synopsisTranslation.create({ data: { anilistId: WORK, lang: "pt", text: "Uma obra para curar.", source: "mymemory" } });
    void workEntry;
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("valida a lista de obras a curar", async ({ request }) => {
    for (const bad of [[], "x", [0], [1.5], Array.from({ length: 201 }, (_, i) => i + 1)]) {
      expect((await request.post("/api/admin/curation", { data: { anilistIds: bad } })).status()).toBe(400);
    }
  });

  test("completa títulos, sinopse, gêneros, tipo, site oficial, relações e a nota do site", async ({ request }) => {
    const progress = await runAndWait(request);
    expect(progress).toMatchObject({ total: 4, done: 4, finished: true, failedBatches: 0 });

    const work = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: WORK } });
    expect(work).toMatchObject({
      titleEnglish: "Curating Round95",
      titleNative: "キュレーション",
      description: "A work to curate.",
      format: "TV",
      kind: "EPISODE",
      officialSite: "https://curar95.example/",
      genres: "Comedy,Drama,Shounen,Josei", // o que já tinha (sem Supernatural) + os da AniList (gêneros e a etiqueta Shounen) + a tag josei do AniDB
      descriptionPt: "Uma obra para curar.",
      curationVersion: 1,
    });
    expect(work.curatedAt).not.toBeNull();
    expect(JSON.parse(work.relationsJson as string)).toEqual([{ id: OVA, titleRomaji: "Curar Round95 OVA", format: "OVA", relationType: "SIDE_STORY" }]);
    // Um voto (nota 10 de quem terminou): a nota do site sai de 5 para 6,3.
    expect(work).toMatchObject({ siteScore: 6.3, siteScoreVotes: 1 });

    // As cópias da obra acompanham.
    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: WORK } })).genres).toBe("Comedy,Drama,Shounen,Josei");
    expect((await prisma.anime.findFirstOrThrow({ where: { anilistId: WORK } })).genres).toBe("Comedy,Drama,Shounen,Josei");
  });

  test("o OVA vira OVA e fica com as pendências do que a fonte não tem", async ({ request }) => {
    const ova = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: OVA } });
    expect(ova).toMatchObject({ kind: "OVA", format: "OVA", siteScore: 5, siteScoreVotes: 0 });
    const issues = await prisma.curationIssue.findMany({ where: { entryId: ova.id, status: "OPEN" }, select: { code: true } });
    expect(issues.map((i) => i.code).sort()).toEqual(["OFFICIAL_SITE_MISSING", "SYNOPSIS_EN_MISSING", "TITLE_EN_MISSING", "TITLE_JA_MISSING"]);

    // A lista do painel mostra a obra com o tipo e as pendências.
    const list = await (await request.get("/api/admin/curation/entries?filter=issues&q=Curar%20Round95%20OVA")).json();
    expect(list.items[0]).toMatchObject({ title: "Curar Round95 OVA", kind: "OVA", curated: true });
    expect(list.items[0].issues).toEqual(expect.arrayContaining(["TITLE_EN_MISSING", "OFFICIAL_SITE_MISSING"]));
  });

  test("obra adulta fica na plataforma na categoria Hentai e a que sumiu da AniList fica registrada, sem perder o que tinha", async () => {
    const adult = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: ADULT } });
    expect(adult.onPlatform).toBe(true);
    expect(adult.genres?.split(",")).toEqual(["Comedy", "Hentai"]);
    expect(await prisma.curationIssue.count({ where: { entryId: adult.id, code: "ADULT_REMOVED" } })).toBe(0);

    const gone = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: GONE } });
    expect(gone).toMatchObject({ onPlatform: true, kind: "EPISODE", description: "Já tinha.", titleEnglish: "Gone", titleNative: "消えた", officialSite: "https://gone.example" });
    const codes = (await prisma.curationIssue.findMany({ where: { entryId: gone.id, status: "OPEN" } })).map((i) => i.code);
    expect(codes).toContain("ANILIST_NOT_FOUND");
  });

  test("rodar de novo não muda nada (idempotente) e o painel mostra as obras como curadas", async ({ request, page }) => {
    const second = await runAndWait(request);
    expect(second.changed).toEqual({});
    expect(second.adultRemoved).toBe(0); // conteúdo adulto não sai mais da plataforma

    await page.goto("/admin/curadoria");
    const list = page.getByTestId("curation-entries");
    await list.getByTestId("curation-entries-search").fill("Curar Round95");
    await list.getByRole("button", { name: "Buscar" }).click();
    const row = list.locator("tr", { hasText: "Curar Round95 OVA" });
    await expect(row).toContainText("OVA");
    await expect(row).toContainText("Curada");
    await expect(row).toContainText("sem título EN");
  });
});

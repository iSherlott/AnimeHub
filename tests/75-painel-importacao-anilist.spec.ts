import { createServer, type Server } from "node:http";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";
import { recentSeasons } from "../src/lib/exploreGroups";

// API do admin para a AniList: buscar a temporada, ESCOLHER o que trazer e COMPLEMENTAR o que a plataforma já tem, contra uma AniList falsa.
const OPTIONS = recentSeasons(new Date(), 8);
const TARGET = OPTIONS[2];
const NEW_A = 976001;
const NEW_B = 976002;
const ADULT = 976003;
const ON_PLATFORM = 976004; // já na plataforma e também na temporada
const LACKING = 976010; // na plataforma, sem capa nem sinopse
const ids = [NEW_A, NEW_B, ADULT, ON_PLATFORM, LACKING];
const COVER = "https://s4.anilist.co/file/anilistcdn/media/anime/cover-76.jpg";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const media = (id: number, romaji: string, genres: string[], extra: Record<string, unknown> = {}) => ({
  id,
  idMal: null,
  title: { romaji, english: `${romaji} (EN)`, native: null },
  coverImage: { extraLarge: COVER },
  bannerImage: null,
  description: `Sinopse da AniList para ${romaji}.`,
  episodes: 12,
  status: "FINISHED",
  season: TARGET.season,
  seasonYear: TARGET.year,
  genres,
  averageScore: 70,
  startDate: { year: TARGET.year, month: 1, day: 5 },
  endDate: { year: TARGET.year, month: 3, day: 28 },
  nextAiringEpisode: null,
  externalLinks: [],
  ...extra,
});
const SEASON_LIST = [media(NEW_A, "Importar Round76 Alfa", ["Comedy"]), media(NEW_B, "Importar Round76 Beta", ["Drama"]), media(ADULT, "Importar Round76 Adulto", ["Comedy", "Hentai"]), media(ON_PLATFORM, "Importar Round76 Ja Na Plataforma", ["Comedy"])];
const airing = (m: ReturnType<typeof media>, episode: number, day: number) => ({
  episode,
  airingAt: Math.floor(Date.UTC(TARGET.year, 0, day, 15, 0) / 1000),
  media: { id: m.id, title: m.title, coverImage: m.coverImage, bannerImage: null, genres: m.genres, format: "TV", description: m.description },
});

test.describe.serial("Painel de importação da AniList", () => {
  let prisma: PrismaClient;
  let anilist: Server;

  async function clean() {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: ids } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: ids } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { query, variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { query: string; variables: Record<string, unknown> };
        res.setHeader("Content-Type", "application/json");
        if (query.includes("airingSchedules")) {
          const wanted = new Set((variables.ids as number[]) ?? []);
          const shows = [...SEASON_LIST.filter((m) => m.id !== ADULT), media(LACKING, "Complemento Round76", ["Romance"])];
          const list = [1, 2, 3].flatMap((ep) => shows.map((m) => airing(m, ep, 4 + ep * 7))).filter((a) => wanted.has(a.media.id));
          res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: list } } }));
          return;
        }
        if (query.includes("id_in")) {
          const wanted = new Set((variables.ids as number[]) ?? []);
          const all = [...SEASON_LIST, media(LACKING, "Complemento Round76", ["Romance"])];
          res.end(JSON.stringify({ data: { Page: { media: all.filter((m) => wanted.has(m.id)) } } }));
          return;
        }
        const list = variables.season === TARGET.season && variables.seasonYear === TARGET.year ? SEASON_LIST : [];
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media: list } } }));
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    await prisma.catalogEntry.createMany({
      data: [
        { anilistId: ON_PLATFORM, titleRomaji: "Importar Round76 Ja Na Plataforma", titleEnglish: "Titulo Local", genres: "Comedy", season: TARGET.season, seasonYear: TARGET.year, source: "anilist", onPlatform: true },
        { anilistId: LACKING, titleRomaji: "Complemento Round76", titleEnglish: "Titulo Local Que Fica", genres: "Romance", season: TARGET.season, seasonYear: TARGET.year, source: "anilist", onPlatform: true },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("a API exige admin e valida temporada e escolha", async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.get(`/api/admin/anilist/season?season=${TARGET.season}&seasonYear=${TARGET.year}`)).status()).toBe(401);
    expect((await guest.post("/api/admin/anilist/import", { data: { ids: [NEW_A] } })).status()).toBe(401);
    await guest.dispose();
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
    expect((await member.get(`/api/admin/anilist/season?season=${TARGET.season}&seasonYear=${TARGET.year}`)).status()).toBe(403);
    expect((await member.post("/api/admin/anilist/complement", { data: { ids: [LACKING] } })).status()).toBe(403);
    await member.dispose();

    const admin = await playwright.request.newContext({ baseURL, storageState: adminState });
    expect((await admin.get("/api/admin/anilist/season?season=AUTUMN&seasonYear=2026")).status()).toBe(400);
    for (const bad of [[], "x", [0], [1.5], Array.from({ length: 151 }, (_, i) => i + 1)]) {
      expect((await admin.post("/api/admin/anilist/import", { data: { ids: bad } })).status()).toBe(400);
    }
    expect((await admin.post("/api/admin/anilist/complement", { data: { ids: [LACKING], overwrite: "sim" } })).status()).toBe(400);
    await admin.dispose();
  });

  test.describe("pela API do admin", () => {
    test.use({ storageState: adminState });

    test("buscar a temporada lista o que a AniList tem, inclusive o hentai (categoria da plataforma), e guarda só como cache", async ({ request, page }) => {
      const res = await request.get(`/api/admin/anilist/season?season=${TARGET.season}&seasonYear=${TARGET.year}`);
      expect(res.status()).toBe(200);
      const { items, blocked } = (await res.json()) as { items: Array<{ anilistId: number; state: string }>; blocked: number };
      expect(items).toHaveLength(4);
      expect(blocked).toBe(0);
      const state = (id: number) => items.find((i) => i.anilistId === id)?.state;
      expect(state(NEW_A)).toBe("new");
      expect(state(NEW_B)).toBe("new");
      expect(state(ON_PLATFORM)).toBe("platform");
      expect(state(ADULT)).toBe("new");

      // Consultar não traz nada: vira cache invisível (o hentai também); o que já era da plataforma não é tocado.
      const cached = await prisma.catalogEntry.findMany({ where: { anilistId: { in: ids } }, orderBy: { anilistId: "asc" } });
      expect(cached.filter((c) => c.anilistId !== ADULT).map((c) => [c.anilistId, c.onPlatform])).toEqual([[NEW_A, false], [NEW_B, false], [ON_PLATFORM, true], [LACKING, true]]);
      expect(cached.find((c) => c.anilistId === ADULT)?.onPlatform).toBe(false);
      expect(cached.find((c) => c.anilistId === ON_PLATFORM)?.titleEnglish).toBe("Titulo Local");
      const catalog = await (await page.request.get("/api/catalog")).json();
      expect(catalog.results.map((r: { anilistId: number }) => r.anilistId)).not.toContain(NEW_A);
    });

    test("trazer: só as escolhidas entram na plataforma, com os episódios no calendário", async ({ request, page }) => {
      const res = await request.post("/api/admin/anilist/import", { data: { ids: [NEW_A] } });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ brought: 1, episodes: 3 });

      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: NEW_A } })).onPlatform).toBe(true);
      // A Beta já tinha sido consultada na busca anterior: segue só como cache, fora da plataforma.
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: NEW_B } })).onPlatform).toBe(false);
      expect(await prisma.airingScheduleEntry.count({ where: { anilistId: NEW_A } })).toBe(3);
      expect(await prisma.airingScheduleEntry.count({ where: { anilistId: NEW_B } })).toBe(0);
      // E agora aparece para as pessoas (Descobrir/catálogo); a Beta continua invisível.
      const catalog = await (await page.request.get("/api/catalog")).json();
      const shown = catalog.results.map((r: { anilistId: number }) => r.anilistId);
      expect(shown).toContain(NEW_A);
      expect(shown).not.toContain(NEW_B);
    });

    test("trazer de novo é seguro, e o que não foi consultado é recusado", async ({ request }) => {
      const res = await request.post("/api/admin/anilist/import", { data: { ids: [NEW_A, 999999] } });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ brought: 0, alreadyIn: 1, missing: 1, blocked: 0, episodes: 0 });
    });

    test("complementar: preenche só o que falta e nunca sobrescreve sem pedir", async ({ request }) => {
      const res = await request.post("/api/admin/anilist/complement", { data: { ids: [LACKING] } });
      expect(res.status()).toBe(200);
      expect((await res.json()).updated).toBe(1);
      const done = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: LACKING } });
      expect(done.coverImage).toBe(COVER);
      expect(done.description).toBe("Sinopse da AniList para Complemento Round76.");
      expect(done.titleEnglish).toBe("Titulo Local Que Fica"); // já existia: preservado
      expect(await prisma.airingScheduleEntry.count({ where: { anilistId: LACKING } })).toBe(3);
      // Conferida na AniList: o que continua vazio é porque ela não tem, e isso não é mais pendência.
      expect(done.complementedAt).not.toBeNull();
    });

    test("com 'sobrescrever' a AniList passa a valer em tudo", async ({ request }) => {
      const res = await request.post("/api/admin/anilist/complement", { data: { ids: [LACKING], overwrite: true } });
      expect(res.status()).toBe(200);
      expect((await res.json()).updated).toBe(1);
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: LACKING } })).titleEnglish).toBe("Complemento Round76 (EN)");
    });

    test("complementar obra fora da plataforma é ignorado", async ({ request }) => {
      const res = await request.post("/api/admin/anilist/complement", { data: { ids: [NEW_B] } });
      expect(await res.json()).toMatchObject({ works: 0, updated: 0, skipped: 1 });
    });

    test("cada operação ficou registrada como job da AniList, concluída e sem passo pendurado", async () => {
      const jobs = await prisma.adminJob.findMany({ where: { kind: "ANILIST" }, orderBy: { seq: "asc" } });
      const labels = jobs.map((j) => j.season ?? "");
      expect(labels.some((l) => l.startsWith("Buscar "))).toBe(true);
      expect(labels.some((l) => l.startsWith("Trazer "))).toBe(true);
      expect(labels.some((l) => l.startsWith("Complementar "))).toBe(true);
      for (const job of jobs) expect(job).toMatchObject({ source: "AniList", state: "SUCCESS", progressNote: null });
      const search = jobs.find((j) => (j.season ?? "").startsWith("Buscar "));
      expect(JSON.parse(search?.resultJson ?? "{}")).toEqual({ obras: 4, bloqueadas: 0 });
      await prisma.adminJob.deleteMany({ where: { kind: "ANILIST" } });
    });
  });
});

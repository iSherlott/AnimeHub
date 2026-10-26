import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Comunidade das obras sem AniList ID (só do AniDB): publicações e discussões, comentários de quem acompanha e quiz vão
// pela obra do catálogo. Denunciar comentário só vale para quem acompanha AQUELA obra. Ao ligar a obra à AniList, a
// comunidade vai junto; se a obra da AniList já tem quiz, o do AniDB é arquivado (sem perder nada).
const AID = 116901;
const AID_OTHER = 116902; // outra obra só do AniDB que o admin acompanha (para a denúncia não "vazar")
const AID_TWIN = 116903; // obra só do AniDB com quiz, ligada a uma obra da AniList que já tem quiz
const TARGET = 116001;
const TARGET_TWIN = 116002;
const TAG = "Round116";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const questions = Array.from({ length: 10 }, (_, i) => ({ category: "personagens", text: `${TAG} pergunta ${i + 1}?`, options: ["Alfa", "Beta", "Gama", "Delta"], correct: "A" }));

test.describe.serial("Comunidade das obras só do AniDB", () => {
  let prisma: PrismaClient;
  let anilist: Server;
  const id: Record<string, string> = {};

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { OR: [{ anidbId: { in: [AID, AID_OTHER, AID_TWIN] } }, { anilistId: { in: [TARGET, TARGET_TWIN] } }] }, select: { id: true } });
    const ids = entries.map((e) => e.id);
    const quizzes = await prisma.quiz.findMany({ where: { OR: [{ catalogEntryId: { in: ids } }, { anilistId: { in: [TARGET, TARGET_TWIN] } }, { titleReward: { contains: TAG } }] }, select: { id: true } });
    const titles = await prisma.userTitle.findMany({ where: { quizId: { in: quizzes.map((q) => q.id) } }, select: { id: true } });
    await prisma.user.updateMany({ where: { equippedTitleId: { in: titles.map((t) => t.id) } }, data: { equippedTitleId: null } });
    await prisma.quiz.deleteMany({ where: { id: { in: quizzes.map((q) => q.id) } } });
    await prisma.comment.deleteMany({ where: { OR: [{ catalogEntryId: { in: ids } }, { anilistId: { in: [TARGET, TARGET_TWIN] } }, { body: { contains: TAG } }] } });
    await prisma.post.deleteMany({ where: { OR: [{ catalogEntryId: { in: ids } }, { anilistId: { in: [TARGET, TARGET_TWIN] } }, { body: { contains: TAG } }] } });
    await prisma.anime.deleteMany({ where: { OR: [{ catalogEntryId: { in: ids } }, { anilistId: { in: [TARGET, TARGET_TWIN] } }] } });
    await deleteCatalogEntries(prisma, { where: { id: { in: ids } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { variables: Record<string, unknown> };
        const wanted = new Set((variables.ids as number[]) ?? []);
        const media = [TARGET, TARGET_TWIN].filter((t) => wanted.has(t)).map((t) => ({ id: t, idMal: null, title: { romaji: `Alvo ${t} ${TAG}`, english: null, native: null }, coverImage: { extraLarge: null }, bannerImage: null, description: null, episodes: 1, status: "FINISHED", format: "TV", season: "SPRING", seasonYear: 2025, genres: [], averageScore: null, startDate: null, endDate: null, nextAiringEpisode: null, externalLinks: [] }));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media, airingSchedules: [] } } }));
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    const base = { source: "anidb", kind: "EPISODE", status: "FINISHED", seasonYear: 2025, onPlatform: true };
    id.A = (await prisma.catalogEntry.create({ data: { ...base, anidbId: AID, titleRomaji: `So AniDB ${TAG}` } })).id;
    id.OTHER = (await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_OTHER, titleRomaji: `Outra ${TAG}` } })).id;
    id.TWIN = (await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_TWIN, titleRomaji: `Gemea ${TAG}` } })).id;
    // A pessoa acompanha a obra; o admin acompanha OUTRA obra só do AniDB (não esta).
    id.item = (await prisma.anime.create({ data: { userId, anilistId: null, catalogEntryId: id.A, anidbId: AID, titleRomaji: `So AniDB ${TAG}` } })).id;
    await prisma.anime.create({ data: { userId: adminId, anilistId: null, catalogEntryId: id.OTHER, anidbId: AID_OTHER, titleRomaji: `Outra ${TAG}` } });
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test.describe("pelo admin", () => {
    test.use({ storageState: adminState });

    test("o quiz entra pela obra do catálogo (anidbId) e a página pública mostra discussões e quiz", async ({ page, request }) => {
      const res = await request.post("/api/admin/quizzes/import", { data: { text: JSON.stringify({ anidbId: AID, scope: "Season 1", titleReward: `Titulo ${TAG}`, questions }), approve: true } });
      expect(res.status()).toBe(201);
      expect((await res.json()).outcomes[0]).toMatchObject({ anilistId: null, work: `anidb-${AID}`, action: "created" });
      expect(await prisma.quiz.count({ where: { catalogEntryId: id.A, anilistId: null } })).toBe(1);
      // Obra desconhecida: recusada.
      expect((await request.post("/api/admin/quizzes/import", { data: { text: JSON.stringify({ anidbId: 999999998, scope: "S", titleReward: "T", questions }) } })).status()).toBe(409);

      await page.goto(`/anime/anidb-${AID}`);
      await expect(page.getByTestId("discussions")).toBeVisible();
      await expect(page.getByTestId("publish-about")).toHaveAttribute("href", `/publicar?obra=anidb-${AID}`);
      await expect(page.getByTestId("quiz-link")).toHaveAttribute("href", `/obra/anidb-${AID}/quiz`);
    });
  });

  test("publicar sobre a obra: o post vai para as discussões dela e o link leva à página da obra", async ({ page, request }) => {
    await page.goto(`/publicar?obra=anidb-${AID}`);
    await expect(page.getByText(`So AniDB ${TAG}`).first()).toBeVisible();
    const res = await request.post("/api/posts", { data: { body: `Gostei muito ${TAG}`, work: `anidb-${AID}` } });
    expect(res.status()).toBe(201);
    const post = (await res.json()).post;
    expect(post).toMatchObject({ anilistId: null, workKey: `anidb-${AID}` });
    expect(await prisma.post.count({ where: { catalogEntryId: id.A, anilistId: null } })).toBe(1);

    const feed = await (await request.get(`/api/posts?tab=recent&work=anidb-${AID}`)).json();
    expect(feed.posts.map((p: { body: string }) => p.body)).toEqual([`Gostei muito ${TAG}`]);
    expect((await (await request.get("/api/posts?tab=recent&work=anidb-999999997")).json()).posts).toEqual([]);

    // Quem acompanha vê a própria página da obra, com discussões e comentários.
    await page.goto(`/anime/${id.item}`);
    const discussions = page.getByTestId("discussions");
    await expect(discussions).toContainText(`Gostei muito ${TAG}`);
    await expect(discussions.getByRole("link", { name: /So AniDB/ }).first()).toHaveAttribute("href", `/anime/anidb-${AID}`);
  });

  test("comentários de quem acompanha; denúncia só por quem acompanha esta mesma obra", async ({ page, request, playwright, baseURL }) => {
    const created = await request.post(`/api/anime/${id.item}/comments`, { data: { body: `Comentario ${TAG}` } });
    expect(created.status()).toBe(201);
    const list = await (await request.get(`/api/anime/${id.item}/comments`)).json();
    expect(list.comments.map((c: { body: string }) => c.body)).toEqual([`Comentario ${TAG}`]);
    const comment = await prisma.comment.findFirstOrThrow({ where: { body: `Comentario ${TAG}` } });
    expect(comment).toMatchObject({ anilistId: null, catalogEntryId: id.A });

    await page.goto(`/anime/${id.item}`);
    await expect(page.getByText(`Comentario ${TAG}`)).toBeVisible();

    // O admin acompanha OUTRA obra só do AniDB: não pode denunciar (antes, "anilistId nulo" casaria com qualquer uma).
    const admin = await playwright.request.newContext({ baseURL, storageState: adminState });
    expect((await admin.post(`/api/comments/${comment.id}/report`, { data: {} })).status()).toBe(404);
    await admin.dispose();
  });

  test("quiz pela chave da obra: quem acompanha faz, e 10/10 dá o título", async ({ page, request }) => {
    const state = await (await request.get(`/api/quiz/anidb-${AID}`)).json();
    expect(state).toMatchObject({ following: true, quiz: { available: true } });
    expect((await request.post(`/api/quiz/anidb-${AID}/attempt`)).status()).toBe(201);
    let last: { finished: boolean; perfect?: boolean } = { finished: false };
    for (let position = 1; position <= 10; position++) last = await (await request.post(`/api/quiz/anidb-${AID}/answer`, { data: { position, choice: 0 } })).json();
    expect(last).toMatchObject({ finished: true, perfect: true });

    await page.goto(`/obra/anidb-${AID}/quiz`);
    await expect(page.getByText(`Titulo ${TAG}`).first()).toBeVisible();
    // O cabeçalho e o resultado levam à página da obra pela chave do catálogo.
    for (const link of await page.getByRole("link", { name: /Voltar ao anime/ }).all()) await expect(link).toHaveAttribute("href", `/anime/anidb-${AID}`);
  });

  test.describe("ligar à AniList", () => {
    test.use({ storageState: adminState });

    test("publicações, comentários, quiz e o item da lista vão para a obra da AniList", async ({ request }) => {
      await prisma.catalogEntry.create({ data: { anilistId: TARGET, titleRomaji: `Alvo ${TARGET} ${TAG}`, source: "anilist", onPlatform: false, format: "TV" } });
      expect((await request.post("/api/admin/anidb-candidates", { data: { anidbId: AID, action: "confirm", anilistId: TARGET } })).status()).toBe(200);
      const target = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: TARGET } });
      expect(await prisma.post.count({ where: { body: `Gostei muito ${TAG}`, anilistId: TARGET } })).toBe(1);
      expect(await prisma.comment.count({ where: { body: `Comentario ${TAG}`, anilistId: TARGET } })).toBe(1);
      expect(await prisma.quiz.findFirstOrThrow({ where: { titleReward: `Titulo ${TAG}` } })).toMatchObject({ anilistId: TARGET, catalogEntryId: target.id, archivedAt: null });
      expect(await prisma.anime.findUniqueOrThrow({ where: { id: id.item } })).toMatchObject({ anilistId: TARGET });
      // O quiz continua respondido: o estado pela AniList mostra o título já ganho.
      const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
      expect(await prisma.userTitle.count({ where: { userId: user.id, quiz: { anilistId: TARGET } } })).toBe(1);
    });

    test("se a obra da AniList já tem quiz, o do AniDB é arquivado (sem perder perguntas)", async ({ request }) => {
      const imported = await request.post("/api/admin/quizzes/import", { data: { text: JSON.stringify({ work: `anidb-${AID_TWIN}`, scope: "Gemea", titleReward: `Gemea ${TAG}`, questions }), approve: true } });
      expect(imported.status()).toBe(201);
      await prisma.catalogEntry.create({ data: { anilistId: TARGET_TWIN, titleRomaji: `Alvo ${TARGET_TWIN} ${TAG}`, source: "anilist", onPlatform: false, format: "TV" } });
      const existing = await prisma.quiz.create({ data: { anilistId: TARGET_TWIN, scope: "Da AniList", titleReward: `Alvo ${TAG}` } });
      expect((await request.post("/api/admin/anidb-candidates", { data: { anidbId: AID_TWIN, action: "confirm", anilistId: TARGET_TWIN } })).status()).toBe(200);
      const archived = await prisma.quiz.findFirstOrThrow({ where: { titleReward: `Gemea ${TAG}` }, include: { _count: { select: { questions: true } } } });
      expect(archived.catalogEntryId).toBeNull();
      expect(archived.anilistId).toBeNull();
      expect(archived.archivedAt).not.toBeNull();
      expect(archived._count.questions).toBe(10);
      expect(await prisma.quiz.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ anilistId: TARGET_TWIN, archivedAt: null });
    });
  });
});

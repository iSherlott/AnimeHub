import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Comunidades (estilo Orkut): o fórum de cada anime. Uma por franquia (temporadas juntas), endereço pela franquia, leitura
// pública, participação por "Participar"; tópicos com "Sobre" (a temporada), enquete com um voto por pessoa, respostas,
// edição só do autor e remoção pelo autor ou pela moderação; "Minhas comunidades" com o que teve atividade depois da
// última visita; comunidades duplicadas da mesma franquia viram uma só; obra só do AniDB tem a dela e a leva à AniList.
const S1 = 117001;
const S2 = 117002;
const AID = 117901;
const TARGET = 117003;
const TAG = "Round117";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const anonState = { cookies: [], origins: [] };

test.describe.serial("Comunidades dos animes (fórum)", () => {
  let prisma: PrismaClient;
  let anilist: Server;
  const id: Record<string, string> = {};

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { OR: [{ anilistId: { in: [S1, S2, TARGET] } }, { anidbId: AID }] }, select: { id: true } });
    const ids = entries.map((e) => e.id);
    await prisma.community.deleteMany({ where: { OR: [{ franchiseKey: { in: [S1, S2, TARGET] } }, { catalogEntryId: { in: ids } }] } });
    await prisma.production.deleteMany({ where: { anilistId: { in: [S1, S2, TARGET] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: S1 } });
    await deleteCatalogEntries(prisma, { where: { id: { in: ids } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { variables: Record<string, unknown> };
        const media = ((variables.ids as number[]) ?? []).includes(TARGET) ? [{ id: TARGET, idMal: null, title: { romaji: `Alvo ${TAG}`, english: null, native: null }, coverImage: { extraLarge: null }, bannerImage: null, description: null, episodes: 1, status: "FINISHED", format: "TV", season: "SPRING", seasonYear: 2025, genres: [], averageScore: null, startDate: null, endDate: null, nextAiringEpisode: null, externalLinks: [] }] : [];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media, airingSchedules: [] } } }));
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: S1, name: `Forum ${TAG}` } });
    const base = { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", franchiseKey: S1 };
    id.S1 = (await prisma.catalogEntry.create({ data: { ...base, anilistId: S1, titleRomaji: `Forum ${TAG}`, titleNative: `フォーラム${TAG}`, seasonYear: 2020, timelineOrder: 1 } })).id;
    id.S2 = (await prisma.catalogEntry.create({ data: { ...base, anilistId: S2, titleRomaji: `Forum ${TAG} 2nd Season`, seasonYear: 2022, timelineOrder: 2 } })).id;
    for (const [anilistId, title, n] of [[S1, `Forum ${TAG}`, 1], [S2, `Forum ${TAG} 2nd Season`, 2]] as const) {
      await prisma.production.create({ data: { anilistId, catalogEntryId: id[`S${n}`], franchiseId: franchise.id, titleRomaji: title, seasonNumber: n, status: "FINISHED", format: "TV", episodes: 12, genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    }
    id.A = (await prisma.catalogEntry.create({ data: { source: "anidb", onPlatform: true, kind: "EPISODE", anidbId: AID, titleRomaji: `So AniDB ${TAG}` } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test.describe("sem conta", () => {
    test.use({ storageState: anonState });
    test("lê a comunidade pelo endereço da franquia (qualquer temporada leva a ele) e é convidado a entrar", async ({ page, request }) => {
      await page.goto(`/comunidades/${S2}`);
      await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}$`));
      await expect(page.getByTestId("community-stats")).toContainText("0 membros · 0 tópicos · 2 obras da franquia");
      await expect(page.getByTestId("community-login")).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/comunidades/${S1}`)}`);
      await expect(page.getByTestId("community-empty")).toBeVisible();
      expect((await request.post(`/api/communities/${S1}/topics`, { data: { title: "x", body: "y" } })).status()).toBe(401);
      expect((await request.get("/comunidades/999999999")).status()).toBe(404);
    });
  });

  test("da página do anime à comunidade: participar, criar tópico com enquete e responder", async ({ page }) => {
    await page.goto(`/anime/${S2}`);
    await expect(page.getByTestId("work-community")).toContainText("ainda não tem tópicos");
    await page.getByTestId("work-community-link").click();
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}$`));
    // O fórum (menu da esquerda): sem participar, não há como criar tópico.
    await page.getByTestId("community-menu-fórum").click();
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}/forum$`));
    await expect(page.getByTestId("community-join-hint")).toBeVisible();
    await expect(async () => {
      await page.getByTestId("community-join").click();
      await expect(page.getByTestId("community-leave")).toBeVisible({ timeout: 3000 });
    }).toPass();
    await expect(page.getByTestId("community-stats")).toContainText("1 membro");

    await page.getByTestId("new-topic-open").click();
    await page.getByTestId("new-topic-title").fill(`Melhor temporada? ${TAG}`);
    await page.getByTestId("new-topic-body").fill("Qual temporada vocês preferem?");
    await page.getByRole("combobox", { name: "Sobre" }).click();
    await page.getByRole("option", { name: /2nd Season/ }).click();
    await page.getByTestId("new-topic-poll").click();
    await page.getByTestId("new-topic-option-0").fill("Primeira");
    await page.getByTestId("new-topic-option-1").fill("Segunda");
    await page.getByTestId("new-topic-submit").click();
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}/topicos/c[a-z0-9]+$`));
    id.topic = page.url().split("/").pop() as string;

    await expect(page.getByTestId("topic-title")).toHaveText(`Melhor temporada? ${TAG}`);
    await expect(page.getByTestId("topic-about")).toContainText("2nd Season");
    const options = await prisma.communityPollOption.findMany({ where: { poll: { topicId: id.topic } }, orderBy: { position: "asc" } });
    await page.getByTestId(`poll-vote-${options[1].id}`).click();
    await expect(page.getByTestId(`poll-option-${options[1].id}`)).toContainText("seu voto");
    await expect(page.getByTestId("poll")).toContainText("1 voto");

    await page.getByTestId("reply-body").fill(`A segunda, sem dúvida ${TAG}`);
    await page.getByTestId("reply-submit").click();
    await expect(page.getByTestId("replies")).toContainText(`A segunda, sem dúvida ${TAG}`);
    await expect(page.getByTestId("replies-count")).toHaveText("1 resposta");
    await page.screenshot({ path: test.info().outputPath("topico-comunidade.png"), fullPage: true });
  });

  test("voto é um só; edição só do autor", async ({ request }) => {
    const options = await prisma.communityPollOption.findMany({ where: { poll: { topicId: id.topic } } });
    expect((await request.post(`/api/communities/topics/${id.topic}/vote`, { data: { optionId: options[0].id } })).status()).toBe(409);
    expect((await request.patch(`/api/communities/topics/${id.topic}`, { data: { title: `Melhor temporada (editado) ${TAG}` } })).status()).toBe(200);
    expect((await prisma.communityTopic.findUniqueOrThrow({ where: { id: id.topic } })).editedAt).not.toBeNull();
  });

  test.describe("pela equipe (admin, não membro)", () => {
    test.use({ storageState: adminState });
    test("lê, mas não responde nem vota sem participar; modera e não edita o que não escreveu", async ({ request }) => {
      expect((await request.post(`/api/communities/topics/${id.topic}/replies`, { data: { body: "oi" } })).status()).toBe(403);
      const options = await prisma.communityPollOption.findMany({ where: { poll: { topicId: id.topic } } });
      expect((await request.post(`/api/communities/topics/${id.topic}/vote`, { data: { optionId: options[0].id } })).status()).toBe(403);
      expect((await request.patch(`/api/communities/topics/${id.topic}`, { data: { title: "Invasão" } })).status()).toBe(403);
      const reply = await prisma.communityReply.findFirstOrThrow({ where: { topicId: id.topic } });
      expect((await request.delete(`/api/communities/replies/${reply.id}`)).status()).toBe(200);
      expect((await prisma.communityTopic.findUniqueOrThrow({ where: { id: id.topic } })).replyCount).toBe(0);

      // Entra e cria um tópico: para a outra pessoa, a comunidade passa a ter novidade.
      expect((await request.post(`/api/communities/${S2}/membership`)).status()).toBe(200);
      expect((await request.post(`/api/communities/${S1}/topics`, { data: { title: `Novidade ${TAG}`, body: "Saiu trailer." } })).status()).toBe(201);
    });
  });

  test("Minhas comunidades mostra o que teve atividade depois da última visita", async ({ page }) => {
    await page.goto("/comunidades");
    const card = page.getByTestId(`my-community-${S1}`);
    await expect(card).toContainText("2 membros · 2 tópicos");
    await expect(page.getByTestId(`my-community-new-${S1}`)).toContainText("com novidade");
    // Visitar a comunidade zera as novidades.
    await page.goto(`/comunidades/${S1}`);
    await page.goto("/comunidades");
    await expect(page.getByTestId(`my-community-new-${S1}`)).toHaveCount(0);
  });

  test("duas comunidades na mesma franquia (a chave mudou) viram uma só, com tópicos e membros somados", async ({ page }) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } });
    const old = await prisma.community.create({ data: { franchiseKey: S2, members: { create: { userId: user.id } } } });
    await prisma.communityTopic.create({ data: { communityId: old.id, authorId: user.id, title: `Antigo ${TAG}`, body: "Do tempo em que a franquia tinha outra chave." } });
    await page.goto(`/comunidades/${S1}`);
    await expect(page.getByTestId("community-stats")).toContainText("2 membros · 3 tópicos");
    expect(await prisma.community.count({ where: { franchiseKey: { in: [S1, S2] } } })).toBe(1);
  });

  test("obra só do AniDB tem a comunidade dela, que vai junto quando a obra é ligada à AniList", async ({ request, page }) => {
    expect((await request.post(`/api/communities/anidb-${AID}/membership`)).status()).toBe(200);
    expect((await request.post(`/api/communities/anidb-${AID}/topics`, { data: { title: `Sem AniList ${TAG}`, body: "Alguém viu?" } })).status()).toBe(201);
    await page.goto(`/comunidades/anidb-${AID}`);
    await expect(page.getByTestId("community-stats")).toContainText("1 membro · 1 tópico · 1 obra");
    // A página da obra leva à comunidade dela.
    await page.goto(`/anime/anidb-${AID}`);
    await expect(page.getByTestId("work-community-link")).toHaveAttribute("href", `/comunidades/anidb-${AID}`);
    await expect(page.getByTestId("work-community")).toContainText(`Sem AniList ${TAG}`);
  });

  test.describe("ligar à AniList", () => {
    test.use({ storageState: adminState });
    test("a comunidade da obra do AniDB passa para a obra da AniList", async ({ request }) => {
      await prisma.catalogEntry.create({ data: { anilistId: TARGET, titleRomaji: `Alvo ${TAG}`, source: "anilist", onPlatform: false, format: "TV" } });
      expect((await request.post("/api/admin/anidb-candidates", { data: { anidbId: AID, action: "confirm", anilistId: TARGET } })).status()).toBe(200);
      const target = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: TARGET } });
      const community = await prisma.community.findUniqueOrThrow({ where: { catalogEntryId: target.id }, include: { _count: { select: { topics: true, members: true } } } });
      expect(community._count).toEqual({ topics: 1, members: 1 });
    });
  });
});

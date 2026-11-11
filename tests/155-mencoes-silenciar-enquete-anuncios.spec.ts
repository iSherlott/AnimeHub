import { test, expect, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Pedido de 12/11: menções com @, silenciar obra/# no Feed, enquete nas publicações, aviso de continuação anunciada,
// comparar listas, personagem da temporada, tier lists no perfil e o painel de uso do admin.
const base = { passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" };
const BIA_EMAIL = "bia-155@test.local";
const BIA_TOKEN = "e2e-session-bia-155-00000000000000000000000000000";
const WORK = 155001; // obra das publicações (silenciar) e das listas (comparar)
const OTHER = 155002;
const ANNOUNCED = 155011; // continuação anunciada de WORK
const CHAR_WORK = 155021; // obra da temporada do personagem
const CHARS = [9155001, 9155002];
const TAG = "round155";
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Menções, silenciar, enquete, anúncios, comparar, personagem, tier lists e uso", () => {
  let prisma: PrismaClient;
  let userId = "";
  let biaId = "";
  const biaHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${BIA_TOKEN}` };

  async function biaContext(browser: Browser) {
    return browser.newContext({
      storageState: { cookies: [{ name: SESSION_COOKIE_NAME, value: BIA_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] },
      baseURL: test.info().project.use.baseURL,
    });
  }

  async function clean() {
    await prisma.post.deleteMany({ where: { OR: [{ body: { contains: "Round155" } }, { user: { email: BIA_EMAIL } }] } });
    await prisma.mutedTopic.deleteMany({ where: { OR: [{ key: String(WORK) }, { key: TAG }] } });
    await prisma.socialNotification.deleteMany({ where: { OR: [{ workKey: String(ANNOUNCED) }, { user: { email: BIA_EMAIL } }] } });
    await prisma.tierList.deleteMany({ where: { userId, season: "FALL", seasonYear: 2097 } });
    await prisma.seasonCharacterAward.deleteMany({ where: { season: "WINTER", seasonYear: 2097 } });
    await prisma.favoriteCharacter.deleteMany({ where: { characterId: { in: CHARS } } });
    await prisma.workCharacter.deleteMany({ where: { anilistId: CHAR_WORK } });
    await prisma.character.deleteMany({ where: { id: { in: CHARS } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [WORK, OTHER, ANNOUNCED] } } });
    await prisma.user.deleteMany({ where: { email: BIA_EMAIL } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [WORK, OTHER, ANNOUNCED, CHAR_WORK] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    biaId = (await prisma.user.create({ data: { ...base, email: BIA_EMAIL, displayName: "Bia Round155", handle: "bia_r155" } })).id;
    await prisma.session.create({ data: { token: BIA_TOKEN, userId: biaId, expiresAt: new Date(Date.now() + 3600_000) } });
    for (const [anilistId, title] of [[WORK, "Silencio Round155"], [OTHER, "Outra Round155"]] as const) {
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: title, source: "anilist", onPlatform: true, status: "FINISHED" } });
    }
    // Listas: as duas acompanham WORK (notas bem diferentes); só a Bia acompanha OTHER.
    await prisma.anime.createMany({
      data: [
        { userId, anilistId: WORK, titleRomaji: "Silencio Round155", userScore: 9, watchState: "FINISHED" },
        { userId: biaId, anilistId: WORK, titleRomaji: "Silencio Round155", userScore: 4 },
        { userId: biaId, anilistId: OTHER, titleRomaji: "Outra Round155", userScore: 7 },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("menção com @: avisa a pessoa, vira link para o perfil e não avisa a si mesmo", async ({ page, request }) => {
    const created = await request.post("/api/posts", { data: { body: `Bora assistir, @bia_r155 e @eu_mesmo? Round155 #${TAG}`, anilistId: WORK } });
    expect(created.status()).toBe(201);
    const postId = (await created.json()).post.id as string;
    const bell = await (await request.get("/api/notifications", { headers: biaHeaders })).json();
    const mention = (bell.social as { type: string; href: string; inComment?: boolean }[]).find((n) => n.type === "MENTION");
    expect(mention).toMatchObject({ href: `/publicacao/${postId}`, inComment: false });

    // Comentário com @ também avisa (a Bia não é a dona da publicação).
    expect((await request.post(`/api/posts/${postId}/comments`, { data: { body: "Lembrete pra @bia_r155 Round155" } })).status()).toBe(201);
    const bell2 = await (await request.get("/api/notifications", { headers: biaHeaders })).json();
    expect((bell2.social as { type: string; inComment?: boolean }[]).filter((n) => n.type === "MENTION").map((n) => n.inComment).sort()).toEqual([false, true]);

    await page.goto(`/publicacao/${postId}`);
    const link = page.getByTestId("mention-link").filter({ hasText: "@bia_r155" }).first();
    await expect(link).toHaveAttribute("href", "/u/bia_r155");
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/users/${biaId}$`));
  });

  test("silenciar: a obra e a # somem do Feed (a página da obra continua mostrando) e voltam em Configurações", async ({ page, request }) => {
    const bia = await request.post("/api/posts", { headers: biaHeaders, data: { body: `Episódio novo! Round155 #${TAG}`, anilistId: WORK } });
    const biaPost = (await bia.json()).post.id as string;
    const recentHas = async () => ((await (await request.get("/api/posts?tab=recent&limit=50")).json()).posts as { id: string }[]).some((p) => p.id === biaPost);
    expect(await recentHas()).toBe(true);

    await page.goto(`/publicacao/${biaPost}`);
    await page.getByRole("button", { name: "Mais opções" }).first().click();
    await page.getByTestId("mute-work").click();
    await expect(page.getByTestId("post-muted")).toContainText("Silencio Round155 silenciado");
    expect(await recentHas()).toBe(false);
    // Na página da obra (pedido pela obra), tudo continua aparecendo.
    expect(((await (await request.get(`/api/posts?tab=recent&work=${WORK}`)).json()).posts as { id: string }[]).some((p) => p.id === biaPost)).toBe(true);

    await page.goto("/configuracoes");
    const item = page.getByTestId("muted-item").filter({ hasText: "Silencio Round155" });
    await expect(item).toContainText("Obra");
    await item.getByTestId("unmute").click();
    await expect(item).toHaveCount(0);
    expect(await recentHas()).toBe(true);

    // A # também silencia.
    expect((await request.post("/api/mutes", { data: { kind: "TAG", key: `#${TAG}` } })).status()).toBe(201);
    expect(await recentHas()).toBe(false);
    await request.delete(`/api/mutes?kind=TAG&key=${TAG}`);
  });

  test("enquete: monta no editor, vota, troca o voto e soma o voto de outra pessoa", async ({ page, request }) => {
    await page.goto("/publicar");
    await page.getByPlaceholder("Que conversa você quer começar?").fill("Qual a melhor abertura da temporada? Round155");
    await page.getByTestId("editor-poll-add").click();
    await page.getByTestId("editor-poll-option-0").fill("A primeira");
    await page.getByTestId("editor-poll-option-1").fill("A segunda");
    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(page).toHaveURL(/\/publicacao\//);
    const poll = page.getByTestId("post-poll").first();
    // O autor já vê as barras (0%); vota na primeira, depois troca para a segunda.
    await poll.getByTestId("post-poll-option").filter({ hasText: "A primeira" }).click();
    await expect(poll.getByTestId("post-poll-option").filter({ hasText: "A primeira" })).toHaveAttribute("aria-pressed", "true");
    await expect(poll.getByTestId("post-poll-option").filter({ hasText: "A primeira" }).getByTestId("post-poll-pct")).toHaveText("100%");
    await poll.getByTestId("post-poll-option").filter({ hasText: "A segunda" }).click();
    await expect(poll.getByTestId("post-poll-option").filter({ hasText: "A segunda" }).getByTestId("post-poll-pct")).toHaveText("100%");
    await expect(poll.getByTestId("post-poll-meta")).toContainText("1 voto");

    const postId = page.url().split("/publicacao/")[1];
    const options = await prisma.postPollOption.findMany({ where: { poll: { postId } }, orderBy: { position: "asc" } });
    const biaVote = await request.post(`/api/posts/${postId}/poll`, { headers: biaHeaders, data: { optionId: options[0].id } });
    expect((await biaVote.json()).poll).toMatchObject({ total: 2 });
    // Regras do servidor: pergunta vazia e opção repetida não passam.
    expect((await request.post("/api/posts", { data: { body: "", poll: { options: ["a", "b"] } } })).status()).toBe(400);
    expect((await request.post("/api/posts", { data: { body: "x Round155", poll: { options: ["a", "A"] } } })).status()).toBe(400);
  });

  test("anúncio: continuação de uma obra da lista entra no catálogo e chega um aviso no sino, uma vez só", async ({ request }) => {
    await prisma.catalogEntry.create({
      data: { anilistId: ANNOUNCED, titleRomaji: "Silencio Round155 2nd Season", source: "anilist", onPlatform: true, status: "NOT_YET_RELEASED", relationsJson: JSON.stringify([{ id: WORK, relationType: "PREQUEL" }]) },
    });
    const find = async () => ((await (await request.get("/api/notifications")).json()).social as { type: string; subject: string; related: string; href: string }[]).filter((n) => n.type === "WORK_ANNOUNCED" && n.href === `/em-breve#obra-${ANNOUNCED}`);
    const first = await find();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ subject: "Silencio Round155 2nd Season", related: "Silencio Round155" });
    expect(await find()).toHaveLength(1);
  });

  test("comparar listas: em comum com as notas lado a lado, e o que só a outra pessoa acompanha", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`/comparar/${biaId}`);
    const common = page.getByTestId("compare-common-item").filter({ hasText: "Silencio Round155" });
    await expect(common).toContainText("9");
    await expect(common).toContainText("4");
    await expect(common.getByTestId("compare-gap")).toContainText("5 pontos de diferença");
    await expect(page.getByTestId("compare-theirs-item").filter({ hasText: "Outra Round155" })).toBeVisible();
    // Lista escondida: não dá para comparar.
    await prisma.user.update({ where: { id: biaId }, data: { animeListPublic: false } });
    await page.goto(`/comparar/${biaId}`);
    await expect(page.getByTestId("compare-hidden")).toBeVisible();
    await prisma.user.update({ where: { id: biaId }, data: { animeListPublic: true } });
  });

  test("personagem da temporada: ranking pelos favoritos, o admin publica e o NewsHub posta", async ({ page, browser }) => {
    await prisma.catalogEntry.create({ data: { anilistId: CHAR_WORK, titleRomaji: "Personagens Round155", source: "anilist", onPlatform: true, season: "WINTER", seasonYear: 2097 } });
    await prisma.character.createMany({ data: [{ id: CHARS[0], name: "Heroina Round155" }, { id: CHARS[1], name: "Rival Round155" }] });
    await prisma.workCharacter.createMany({ data: [{ anilistId: CHAR_WORK, characterId: CHARS[0], role: "MAIN" }, { anilistId: CHAR_WORK, characterId: CHARS[1], role: "SUPPORTING" }] });
    await prisma.favoriteCharacter.createMany({ data: [{ userId, characterId: CHARS[0] }, { userId: biaId, characterId: CHARS[0] }, { userId: biaId, characterId: CHARS[1] }] });

    await page.goto("/personagens?temporada=winter2097");
    const first = page.getByTestId("season-character").first();
    await expect(first).toContainText("Heroina Round155");
    await expect(first.getByTestId("season-character-favorites")).toHaveText("♥ 2");

    const admin = await browser.newContext({ storageState: adminState, baseURL: test.info().project.use.baseURL });
    const res = await admin.request.post("/api/admin/season-character", { data: { season: "WINTER", seasonYear: 2097 } });
    expect(res.status()).toBe(201);
    const { postId } = await res.json();
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post.body).toContain("Personagem da temporada · Inverno 2097: Heroina Round155, de Personagens Round155!");
    // Publicar de novo troca a publicação anterior.
    const again = await (await admin.request.post("/api/admin/season-character", { data: { season: "WINTER", seasonYear: 2097 } })).json();
    expect((await prisma.post.findUniqueOrThrow({ where: { id: postId } })).deletedAt).not.toBeNull();
    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/rede");
    await expect(adminPage.getByTestId("admin-season-character")).toBeVisible();
    await adminPage.goto("/admin/uso");
    await expect(adminPage.getByTestId("usage-active-7")).toBeVisible();
    await expect(adminPage.getByTestId("usage-feature").filter({ hasText: "Votos em enquetes do Feed" })).toBeVisible();
    await admin.close();
    await prisma.post.deleteMany({ where: { id: { in: [postId, again.postId] } } });

    await page.goto("/personagens?temporada=winter2097");
    await expect(page.getByTestId("season-character").first()).toContainText("personagem da temporada");
  });

  test("tier lists no perfil: um cartão por temporada publicada, que abre o quadro", async ({ page, browser }) => {
    const snapshot = { season: "FALL", seasonYear: 2097, tiers: { S: [{ key: String(WORK), title: "Silencio Round155", cover: null }], A: [], B: [], C: [], D: [] } };
    const post = await prisma.post.create({ data: { userId, body: "Minha tier list de Outono 2097 Round155\n\nS: Silencio Round155\n\n#tierlist", tierListJson: JSON.stringify(snapshot) } });
    await prisma.tierList.create({ data: { userId, season: "FALL", seasonYear: 2097, tiersJson: JSON.stringify({ S: [String(WORK)] }), postId: post.id } });

    // Quem visita (a Bia) vê o cartão e abre o quadro.
    const bia = await biaContext(browser);
    const bp = await bia.newPage();
    await bp.goto(`/users/${userId}`);
    const card = bp.getByTestId("profile-tier-list-autumn2097");
    await expect(card).toContainText("Tier list · Outono 2097");
    await expect(card).toContainText("1 obra");
    await card.getByRole("link").click();
    await expect(bp).toHaveURL(new RegExp(`/users/${userId}/tier-lists/autumn2097$`));
    await expect(bp.getByTestId("profile-tier-list-board").getByTestId("tier-row-S")).toContainText("Silencio Round155");
    await expect(bp.getByTestId("profile-tier-list-new")).toHaveCount(0);
    await bia.close();

    // A dona vê também o atalho para montar.
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-tier-list-new")).toBeVisible();
  });
});

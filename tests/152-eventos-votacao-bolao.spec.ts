import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Pedido de 10/11: agenda de eventos, anime da semana e bolão da temporada — os disparos ficam no painel do admin.
const adminHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const WORKS = [152001, 152002, 152003];
const DAY = 24 * 3600 * 1000;

test.describe.serial("Eventos, anime da semana e bolão", () => {
  let prisma: PrismaClient;
  let userId = "";

  async function clean() {
    await prisma.animeEvent.deleteMany({ where: { title: { contains: "Round152" } } });
    await prisma.weeklyVote.deleteMany({});
    await prisma.seasonPool.deleteMany({ where: { season: "WINTER", seasonYear: 2099 } });
    await prisma.post.deleteMany({ where: { body: { contains: "Round152" } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: WORKS } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: WORKS } } });
    await prisma.socialNotification.deleteMany({ where: { type: "EVENT_REMINDER", userId } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: WORKS } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    const now = Date.now();
    for (const [i, anilistId] of WORKS.entries()) {
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: `Obra ${anilistId} Round152`, source: "anilist", onPlatform: true, season: "WINTER", seasonYear: 2099, popularityRank: i + 1, siteScore: 8, siteScoreVotes: i === 0 ? 2 : 0 } });
      await prisma.airingScheduleEntry.create({ data: { anilistId, episode: 3, airingAt: new Date(now - (i + 1) * DAY), titleRomaji: `Obra ${anilistId} Round152` } });
    }
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("agenda: só o admin cadastra; a pessoa marca 'vou' e recebe o lembrete no dia", async ({ request, page }) => {
    const startsAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    expect((await request.post("/api/admin/events", { data: { title: "Encontro Round152", startsAt } })).status()).toBe(403);
    const created = await request.post("/api/admin/events", { headers: adminHeaders, data: { title: "Encontro Round152", kind: "CONVENCAO", startsAt, place: "São Paulo", partner: "Loja Parceira" } });
    expect(created.status()).toBe(201);

    await page.goto("/eventos");
    const card = page.getByTestId("anime-event").filter({ hasText: "Encontro Round152" });
    await expect(card).toContainText("Parceria: Loja Parceira");
    await card.getByTestId("event-rsvp").click();
    await expect(card.getByTestId("event-going")).toContainText("1 pessoa vai");
    const bell = await (await request.get("/api/notifications")).json();
    const reminder = (bell.social as { type: string; subject: string; href: string }[]).find((n) => n.type === "EVENT_REMINDER");
    expect(reminder).toMatchObject({ subject: "Encontro Round152" });
    expect(reminder?.href).toMatch(/^\/eventos#evento-/);
    // Uma vez só.
    await request.get("/api/notifications");
    expect(await prisma.socialNotification.count({ where: { userId, type: "EVENT_REMINDER" } })).toBe(1);
  });

  test("anime da semana: o admin abre, a pessoa vota (e troca), o admin encerra e o NewsHub publica", async ({ request, page }) => {
    expect((await request.post("/api/admin/weekly-vote", { data: { days: 3 } })).status()).toBe(403);
    const opened = await request.post("/api/admin/weekly-vote", { headers: adminHeaders, data: { days: 3, title: "Anime da semana Round152" } });
    expect(opened.status()).toBe(201);
    const { id } = await opened.json();
    const vote = await prisma.weeklyVote.findUniqueOrThrow({ where: { id }, include: { options: { orderBy: { position: "asc" } } } });
    const ours = vote.options.filter((o) => WORKS.map(String).includes(o.workKey));
    expect(ours.length).toBe(3);

    await page.goto("/");
    const card = page.getByTestId("weekly-vote");
    await expect(card).toContainText("Anime da semana Round152");
    await card.getByTestId("weekly-vote-option").filter({ hasText: `Obra ${WORKS[1]} Round152` }).click();
    await expect(card.getByTestId("weekly-vote-option").filter({ hasText: `Obra ${WORKS[1]} Round152` })).toHaveAttribute("aria-pressed", "true");
    expect(await prisma.weeklyVoteBallot.count({ where: { voteId: id, userId } })).toBe(1);

    const closed = await (await request.post(`/api/admin/weekly-vote/${id}/close`, { headers: adminHeaders })).json();
    expect(closed.winnerKey).toBe(String(WORKS[1]));
    const post = await prisma.post.findUniqueOrThrow({ where: { id: closed.postId } });
    expect(post.body).toContain(`🏆 Anime da semana Round152: Obra ${WORKS[1]} Round152!`);
    expect((await request.post(`/api/weekly-vote/${id}/ballot`, { data: { optionId: ours[0].id } })).status()).toBe(409);
  });

  test("bolão: o admin abre, a pessoa escolhe até o limite, o placar soma e o encerramento grava os pontos", async ({ request, page }) => {
    const closesAt = new Date(Date.now() + 3 * DAY).toISOString();
    const opened = await request.post("/api/admin/pool", { headers: adminHeaders, data: { season: "WINTER", seasonYear: 2099, closesAt, picksPerUser: 2 } });
    expect(opened.status()).toBe(201);
    const { id } = await opened.json();
    // Outra pessoa acompanha a obra 152002 (2 pontos por pessoa).
    await prisma.anime.create({ data: { userId, anilistId: WORKS[1], titleRomaji: "x Round152" } });

    await page.goto("/bolao");
    const pool = page.getByTestId("season-pool");
    await pool.getByTestId(`pool-work-${WORKS[0]}`).getByRole("button", { name: "Escolher" }).click();
    await expect(pool.getByTestId("pool-picked-count")).toHaveText("1");
    await pool.getByTestId(`pool-work-${WORKS[1]}`).getByRole("button", { name: "Escolher" }).click();
    await expect(pool.getByTestId("pool-picked-count")).toHaveText("2");
    const third = await request.post(`/api/pool/${id}/picks`, { data: { workKey: String(WORKS[2]), picked: true } });
    expect(third.status()).toBe(409);
    // 152001: nota 8 × 10 = 80; 152002: 1 pessoa × 2 = 2.
    await expect(pool.getByTestId("pool-my-points")).toHaveText("Seus pontos: 82");

    expect((await request.post(`/api/admin/pool/${id}/finish`, { headers: adminHeaders })).status()).toBe(200);
    const picks = await prisma.seasonPoolPick.findMany({ where: { poolId: id }, orderBy: { workKey: "asc" } });
    expect(picks.map((p) => p.points)).toEqual([80, 2]);
  });

  test("o painel do admin mostra os três disparos", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto("/admin/rede");
    await expect(page.getByTestId("admin-events")).toBeVisible();
    await expect(page.getByTestId("admin-weekly-vote")).toBeVisible();
    await expect(page.getByTestId("admin-pool")).toBeVisible();
    await expect(page.getByTestId("admin-event-row").filter({ hasText: "Encontro Round152" })).toBeVisible();
    await context.close();
  });
});

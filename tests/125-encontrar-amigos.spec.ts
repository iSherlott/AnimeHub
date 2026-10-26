import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Encontrar pessoas na página Amigos: busca por nome ou @identificador (sem a própria pessoa e sem bloqueios), com o
// botão de amizade no estado certo; sugestões por comunidades (peso 2) e animes em comum (peso 1, só de quem deixa a
// aba Animes pública), sem amigos e pedidos pendentes.
const S1 = 125001;
const WORK = 125100;
const base = { passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" };
const EMAILS = ["ana-125@test.local", "bia-125@test.local", "caio-125@test.local"];

test.describe.serial("Encontrar amigos", () => {
  let prisma: PrismaClient;
  let userId = "";
  const id: Record<string, string> = {};

  async function clean() {
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.anime.deleteMany({ where: { anilistId: WORK } });
    await prisma.community.deleteMany({ where: { franchiseKey: S1 } });
    await deleteCatalogEntries(prisma, { where: { anilistId: S1 } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    await prisma.catalogEntry.create({ data: { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", anilistId: S1, franchiseKey: S1, titleRomaji: "Amigos 125", seasonYear: 2020, timelineOrder: 1 } });
    id.ana = (await prisma.user.create({ data: { ...base, email: EMAILS[0], displayName: "Ana Round125", handle: "ana_r125" } })).id;
    id.bia = (await prisma.user.create({ data: { ...base, email: EMAILS[1], displayName: "Bia Round125", animeListPublic: false } })).id;
    id.caio = (await prisma.user.create({ data: { ...base, email: EMAILS[2], displayName: "Caio Round125" } })).id;
    const community = await prisma.community.create({ data: { franchiseKey: S1 } });
    await prisma.communityMember.createMany({ data: [userId, id.ana, id.caio].map((u) => ({ communityId: community.id, userId: u })) });
    // Ana e Bia acompanham a mesma obra que a pessoa; a lista da Bia é oculta, então não conta.
    for (const u of [userId, id.ana, id.bia]) await prisma.anime.create({ data: { userId: u, anilistId: WORK, titleRomaji: "Obra Round125", genres: "" } });
  });

  test.afterAll(async () => {
    await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: { in: Object.values(id) } } });
    await clean();
    await prisma.$disconnect();
  });

  test("as mesmas sugestões na lateral do Feed, no perfil sem amigos e em quem seguir", async ({ page, request }) => {
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } });
    const api = (await (await request.get("/api/friends/suggestions?take=3")).json()).people as Array<{ id: string; detail: string }>;
    expect(api[0]).toMatchObject({ id: id.ana, detail: "1 comunidade em comum · 1 anime em comum" });
    expect(api.map((p) => p.id)).not.toContain(id.bia);

    // "Seguindo" vazio: quem tem algo em comum vem antes das contas mais novas.
    const follow = (await (await request.get("/api/users/suggestions")).json()).users as Array<{ id: string }>;
    const followedAna = await prisma.follow.count({ where: { followerId: userId, followingId: id.ana } });
    if (!followedAna) expect(follow[0].id).toBe(id.ana);

    await page.goto("/");
    const side = page.getByTestId("sidebar-people");
    await expect(side.getByTestId(`sidebar-person-${id.ana}`)).toContainText("1 comunidade em comum · 1 anime em comum");
    await expect(side.getByRole("link", { name: "Ver mais sugestões" })).toHaveAttribute("href", "/amigos#sugestoes");

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-friend-suggestions")).toContainText("Ana Round125");

    // Pedir pela lateral do Feed (e desfazer, para os próximos testes).
    await page.goto("/");
    await page.getByTestId(`sidebar-person-${id.ana}`).getByTestId("friend-add").click();
    await expect(page.getByTestId(`sidebar-person-${id.ana}`).getByTestId("friend-cancel")).toBeVisible();
    expect(await prisma.friendRequest.count({ where: { fromId: userId, toId: id.ana } })).toBe(1);
    await prisma.friendRequest.deleteMany({ where: { fromId: userId, toId: id.ana } });
  });

  test("sugestões: comunidade e anime em comum, na ordem do peso; lista oculta não conta", async ({ page }) => {
    await page.goto("/amigos");
    const box = page.getByTestId("friend-suggestions");
    await expect(box.getByTestId(`suggestion-${id.ana}`)).toContainText("1 comunidade em comum · 1 anime em comum");
    await expect(box.getByTestId(`suggestion-${id.caio}`)).toContainText("1 comunidade em comum");
    await expect(box.getByTestId(`suggestion-${id.bia}`)).toHaveCount(0);
    const order = await box.locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order.indexOf(`suggestion-${id.ana}`)).toBeLessThan(order.indexOf(`suggestion-${id.caio}`));

    // Pedir pela sugestão: a pessoa sai das sugestões e vai para "pedidos enviados".
    await box.getByTestId(`suggestion-${id.caio}`).getByTestId("friend-add").click();
    await expect(page.getByTestId(`friend-sent-${id.caio}`)).toBeVisible();
    await expect(box.getByTestId(`suggestion-${id.caio}`)).toHaveCount(0);
  });

  test("busca por nome e @identificador, com o estado da amizade; sem a própria pessoa", async ({ page }) => {
    await page.goto("/amigos");
    await page.getByTestId("people-search-input").fill("round125");
    await page.getByTestId("people-search-submit").click();
    await expect(page).toHaveURL(/\/amigos\?q=round125$/);
    const results = page.getByTestId("people-results");
    await expect(results).toContainText("resultados para “round125”");
    await expect(results.getByTestId(`person-${id.ana}`).getByTestId("friend-add")).toBeVisible();
    await expect(results.getByTestId(`person-${id.caio}`).getByTestId("friend-cancel")).toBeVisible();
    await expect(results.getByTestId(`person-${id.bia}`)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("amigos-busca.png"), fullPage: true });

    await page.goto(`/amigos?q=${encodeURIComponent("@ana_r125")}`);
    await expect(page.getByTestId("people-results").locator("li")).toHaveCount(1);
    await expect(page.getByTestId(`person-${id.ana}`)).toContainText("@ana_r125");

    await page.goto(`/amigos?q=${encodeURIComponent("E2E Test User")}`);
    await expect(page.getByTestId(`person-${userId}`)).toHaveCount(0);
    await page.goto("/amigos?q=a");
    await expect(page.getByTestId("people-results")).toContainText("Digite pelo menos 2 letras.");
  });

  test("bloqueio tira a pessoa da busca e das sugestões", async ({ page, request }) => {
    expect((await request.put(`/api/users/${id.ana}/block`)).ok()).toBe(true);
    await page.goto("/amigos?q=round125");
    await expect(page.getByTestId(`person-${id.ana}`)).toHaveCount(0);
    await expect(page.getByTestId(`suggestion-${id.ana}`)).toHaveCount(0);
    expect((await request.delete(`/api/users/${id.ana}/block`)).ok()).toBe(true);
  });
});

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";
import { waitEpisodesStreamed } from "./streaming";

// Epic 48: histórias refeitas do zero (reboot). As duas versões se apontam, cada uma tem a sua linha do tempo (uma não mostra o
// conteúdo da outra), o reboot que vai além da versão antiga marca o episódio em que isso começa, e os episódios saem por arcos.
const OLD = 101001; // versão antiga, 1999, 6 episódios
const NEW = 101002; // reboot, 2011, 10 episódios: do 7 em diante é história que a antiga nunca teve
const OLD_MOVIE = 101003;
const NEW_MOVIE = 101004;
const X = 101005; // par para o lote de pesquisa
const Y = 101006;
const ALL = [OLD, NEW, OLD_MOVIE, NEW_MOVIE, X, Y];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

/** Aplicar um lote refaz as linhas do tempo em segundo plano: espera essa auditoria acabar para não atrapalhar quem vem depois. */
async function waitAuditIdle(request: import("@playwright/test").APIRequestContext) {
  await expect
    .poll(async () => ((await (await request.get("/api/admin/timeline")).json()).job?.state === "RUNNING" ? "RUNNING" : "IDLE"), { timeout: 90_000 })
    .toBe("IDLE");
}

const rel = (...pairs: Array<[number, string]>) => JSON.stringify(pairs.map(([id, relationType]) => ({ id, titleRomaji: `x${id}`, format: "TV", relationType })));

test.describe.serial("Reboot: versões, linhas do tempo separadas e arcos", () => {
  let prisma: PrismaClient;
  let animeNew: string;

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { anilistId: { in: ALL } }, select: { id: true } });
    await prisma.curationIssue.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: ALL } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.storyLink.deleteMany({ where: { OR: [{ oldAnilistId: { in: ALL } }, { newAnilistId: { in: ALL } }] } });
    await prisma.storyArc.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.storyReview.deleteMany({ where: { OR: [{ anilistIdA: { in: ALL } }, { anilistIdB: { in: ALL } }] } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();

    const entry = (anilistId: number, titleRomaji: string, kind: string, format: string, startDate: string, episodes: number, relationsJson: string, popularityRank: number | null = null) =>
      prisma.catalogEntry.create({
        data: { anilistId, titleRomaji, kind, format, season: "FALL", seasonYear: Number(startDate.slice(0, 4)), startDate: new Date(startDate), episodes, description: `Sinopse ${titleRomaji}.`, genres: "Drama", source: "anilist", onPlatform: true, relationsJson, popularityRank },
      });
    await entry(OLD, "Reboot Velho Round101", "EPISODE", "TV", "1999-10-01T00:00:00Z", 6, rel([NEW, "ALTERNATIVE"], [OLD_MOVIE, "SIDE_STORY"]));
    await entry(NEW, "Reboot Novo Round101", "EPISODE", "TV", "2011-10-01T00:00:00Z", 10, rel([OLD, "ALTERNATIVE"], [NEW_MOVIE, "SIDE_STORY"]));
    await entry(OLD_MOVIE, "Filme Velho Round101", "MOVIE", "MOVIE", "2001-03-01T00:00:00Z", 1, rel([OLD, "PARENT"]));
    await entry(NEW_MOVIE, "Filme Novo Round101", "MOVIE", "MOVIE", "2014-03-01T00:00:00Z", 1, rel([NEW, "PARENT"]));
    // Dois cadastros ligados como versão alternativa que ainda ninguém pesquisou (ficam na fila).
    await entry(X, "Par Pendente X Round101", "EPISODE", "TV", "2005-04-01T00:00:00Z", 12, rel([Y, "ALTERNATIVE"]), 1);
    await entry(Y, "Par Pendente Y Round101", "EPISODE", "TV", "2015-04-01T00:00:00Z", 12, rel([X, "ALTERNATIVE"]), 1);

    for (const [anilistId, title, year, relationsJson] of [[OLD, "Reboot Velho Round101", 1999, rel([NEW, "ALTERNATIVE"])], [NEW, "Reboot Novo Round101", 2011, rel([OLD, "ALTERNATIVE"])]] as const) {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: anilistId, name: title } });
      await prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji: title, seasonNumber: 1, status: "FINISHED", season: "FALL", seasonYear: year, format: "TV", episodes: 10, description: `Sinopse ${title}.`, genres: "Drama", streamingLinksJson: "[]", relationsJson, fetchedAt: new Date() } });
    }

    await prisma.storyLink.create({ data: { oldAnilistId: OLD, newAnilistId: NEW, kind: "REBOOT", coverage: "PARTIAL", beyondFromEpisode: 7, note: "O reboot refaz os arcos 1 e 2 e segue além.", source: "https://example.org/fonte" } });
    await prisma.storyArc.createMany({
      data: [
        { anilistId: NEW, position: 1, nameEn: "First Arc", namePt: "Primeiro Arco", startEpisode: 1, endEpisode: 3 },
        { anilistId: NEW, position: 2, nameEn: "Second Arc", startEpisode: 4, endEpisode: 6 },
        { anilistId: NEW, position: 3, nameEn: "New Arc", namePt: "Arco Novo", startEpisode: 7, endEpisode: 10 },
        { anilistId: OLD, position: 1, nameEn: "First Arc", startEpisode: 1, endEpisode: 3 },
        { anilistId: OLD, position: 2, nameEn: "Second Arc", startEpisode: 4, endEpisode: 6 },
      ],
    });

    // O reboot está na lista da pessoa (episódios do Kitsu); a versão antiga é vista pela página pública (calendário).
    animeNew = (await prisma.anime.create({ data: { userId, anilistId: NEW, titleRomaji: "Reboot Novo Round101", genres: "" } })).id;
    await prisma.episode.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ animeId: animeNew, number: i + 1, seasonNumber: 1, titleRomaji: `Episódio ${i + 1} do reboot`, airDate: new Date(Date.UTC(2011, 9 + i, 5)) })) });
    for (let episode = 1; episode <= 6; episode += 1) {
      await prisma.airingScheduleEntry.create({ data: { anilistId: OLD, episode, airingAt: new Date(Date.UTC(1999, 9 + episode, 5)), titleRomaji: "Reboot Velho Round101" } });
    }
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("o reboot aponta a versão antiga, mostra só a própria linha do tempo e marca onde vai além, por arcos", async ({ page }) => {
    await page.goto(`/anime/${animeNew}`);
    await waitEpisodesStreamed(page);

    // Histórias relacionadas: a outra versão, o que o reboot cobre e a partir de que episódio vai além.
    const version = page.getByTestId(`story-version-${OLD}`);
    await expect(version).toHaveAttribute("data-role", "REBOOT");
    await expect(version).toContainText("Refaz Reboot Velho Round101 (1999)");
    await expect(version).toContainText("a partir do episódio 7 (Arco Novo)");
    await expect(version).toContainText("O reboot refaz os arcos 1 e 2 e segue além.");
    await expect(version.getByRole("link", { name: /Fonte da pesquisa/ })).toHaveAttribute("href", "https://example.org/fonte");
    await expect(page.getByText("Versão antiga (refeita nesta)")).toBeVisible();

    // A navegação da franquia mostra só o conteúdo desta versão (o reboot e o filme dele), nada da antiga.
    const nav = page.getByTestId("franchise-nav");
    await expect(nav.locator("li")).toHaveCount(2);
    await expect(nav.getByTestId(`franchise-nav-item-${NEW}`)).toBeVisible();
    await expect(nav.getByTestId(`franchise-nav-item-${NEW_MOVIE}`)).toBeVisible();
    await expect(nav.getByTestId(`franchise-nav-item-${OLD}`)).toHaveCount(0);
    await expect(nav.getByTestId(`franchise-nav-item-${OLD_MOVIE}`)).toHaveCount(0);

    // Episódios por arcos, com o ponto em que o reboot passa da versão antiga logo antes do arco novo.
    await page.getByTestId("episode-toggle").click();
    const line = page.getByTestId("episode-timeline");
    await expect(line.getByTestId("arc-1")).toContainText("Arco 1 · EP 1–3");
    await expect(line.getByTestId("arc-1")).toContainText("First Arc");
    await expect(line.getByTestId("arc-3")).toContainText("Arco 3 · EP 7–10");
    const nodes = line.locator("li");
    await expect(nodes).toHaveCount(15); // 10 episódios + 3 arcos + o ponto de virada + o filme ramificado
    const texts = await nodes.allInnerTexts();
    const beyond = texts.findIndex((t) => t.includes("o reboot vai além da versão antiga"));
    const arc3 = texts.findIndex((t) => t.toLowerCase().includes("arco 3 · ep 7–10")); // o cabeçalho do arco é exibido em maiúsculas
    const episode7 = texts.findIndex((t) => t.includes("EP 7 ·"));
    expect(beyond).toBeGreaterThan(-1);
    expect(arc3).toBe(beyond + 1);
    expect(episode7).toBe(arc3 + 1);
    await expect(line.getByTestId("story-beyond")).toContainText("A partir do episódio 7");
    await expect(line.getByTestId("story-beyond").getByRole("link", { name: "Reboot Velho Round101" })).toHaveAttribute("href", `/anime/${OLD}`);
    // Os arcos e episódios da outra versão não aparecem aqui.
    await expect(line).not.toContainText("Aqui termina esta versão");
  });

  test("a versão antiga aponta o reboot, mostra só o conteúdo dela e avisa que a história continua no reboot", async ({ page }) => {
    await page.goto(`/anime/${OLD}`);
    const version = page.getByTestId(`story-version-${NEW}`);
    await expect(version).toHaveAttribute("data-role", "ORIGINAL");
    await expect(version).toContainText("Refeita em Reboot Novo Round101 (2011)");
    await expect(version).toContainText("o reboot continua além desta versão");

    const nav = page.getByTestId("franchise-nav");
    await expect(nav.locator("li")).toHaveCount(2);
    await expect(nav.getByTestId(`franchise-nav-item-${OLD_MOVIE}`)).toBeVisible();
    await expect(nav.getByTestId(`franchise-nav-item-${NEW}`)).toHaveCount(0);

    await page.getByTestId("episode-toggle").click();
    const line = page.getByTestId("schedule-episodes");
    await expect(line.getByTestId("arc-1")).toContainText("EP 1–3");
    await expect(line.getByTestId("arc-2")).toContainText("EP 4–6");
    const continues = line.getByTestId("story-continues");
    await expect(continues).toContainText("Aqui termina esta versão");
    await expect(continues).toContainText("a partir do episódio 7");
    await expect(continues.getByRole("link", { name: "Reboot Novo Round101" })).toHaveAttribute("href", `/anime/${NEW}`);
    await expect(line.getByTestId("story-beyond")).toHaveCount(0);
  });

  test("sem episódios com data, a linha dos arcos e o aviso de que continua no reboot ainda aparecem", async ({ page }) => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: OLD } });
    await page.goto(`/anime/${OLD}`);
    const only = page.getByTestId("branch-only-timeline");
    await expect(only.getByTestId("arc-1")).toContainText("EP 1–3");
    await expect(only.getByTestId("arc-2")).toContainText("EP 4–6");
    await expect(only.getByTestId("story-continues")).toContainText("a partir do episódio 7");
    await expect(only.getByTestId(`branch-${OLD_MOVIE}`)).toBeVisible();
    await expect(page.getByTestId("episode-toggle")).toHaveCount(0);
  });

  test("a franquia que a auditoria grava também separa as versões", async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: adminState });
    const before = (await (await admin.get("/api/admin/timeline")).json()).job?.seq ?? 0;
    expect((await admin.post("/api/admin/timeline")).status()).toBe(202);
    await expect
      .poll(async () => {
        const status = await (await admin.get("/api/admin/timeline")).json();
        return status.job && status.job.seq > before ? status.job.state : "WAITING";
      }, { timeout: 90_000 })
      .toBe("SUCCESS");
    await admin.dispose();
    const rows = await prisma.catalogEntry.findMany({ where: { anilistId: { in: [OLD, NEW, OLD_MOVIE, NEW_MOVIE] } }, select: { anilistId: true, franchiseKey: true } });
    const key = Object.fromEntries(rows.map((r) => [r.anilistId, r.franchiseKey]));
    expect(key[OLD]).toBe(OLD);
    expect(key[OLD_MOVIE]).toBe(OLD);
    expect(key[NEW]).toBe(NEW);
    expect(key[NEW_MOVIE]).toBe(NEW);
  });

  test.describe("a pesquisa em lotes (Admin)", () => {
    test("só o administrador consulta e aplica", async ({ playwright, baseURL }) => {
      const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
      expect((await guest.get("/api/admin/story")).status()).toBe(401);
      expect((await guest.post("/api/admin/story", { data: {} })).status()).toBe(401);
      await guest.dispose();
      const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
      expect((await member.get("/api/admin/story")).status()).toBe(403);
      expect((await member.post("/api/admin/story", { data: {} })).status()).toBe(403);
      await member.dispose();
    });

    test.describe("como administrador", () => {
      test.use({ storageState: adminState });

      test("a fila mostra o par pendente; o lote errado é recusado inteiro e o certo grava", async ({ request }) => {
        const before = await (await request.get("/api/admin/story")).json();
        expect(before.next.map((c: { a: { anilistId: number }; b: { anilistId: number } }) => [c.a.anilistId, c.b.anilistId])).toContainEqual([X, Y]);
        expect(before.candidates).toBeGreaterThan(0);

        const bad = await request.post("/api/admin/story", { data: { loot: "round101-ruim", items: [{ a: X, b: Y, verdict: "REBOOT" }, { a: X, b: 999999, verdict: "NOT_REBOOT" }] } });
        expect(bad.status()).toBe(400);
        const errors = (await bad.json()).errors as string[];
        expect(errors.join(" ")).toMatch(/precisa de reboot/);
        expect(errors.join(" ")).toMatch(/999999 não está no catálogo/);
        // O reboot é sempre a versão mais atual: X (2005) não pode ser reboot de Y (2015).
        const reversed = await request.post("/api/admin/story", { data: { loot: "round101-invertido", items: [{ a: X, b: Y, verdict: "REBOOT", reboot: { old: Y, new: X, coverage: "FULL" } }] } });
        expect(reversed.status()).toBe(400);
        expect(((await reversed.json()).errors as string[]).join(" ")).toMatch(/sempre a versão mais atual/);
        expect(await prisma.storyReview.count({ where: { loot: "round101-ruim" } })).toBe(0); // nada foi gravado

        const loot = { loot: "round101-ok", items: [{ a: X, b: Y, verdict: "NOT_REBOOT", note: "universos parecidos, não é reboot", source: "https://example.org/x", arcs: [{ anilistId: Y, list: [{ nameEn: "Opening", start: 1, end: 6 }, { nameEn: "Finale", namePt: "Final", start: 7, end: 12 }] }] }] };
        const ok = await request.post("/api/admin/story", { data: loot });
        expect(ok.status()).toBe(200);
        expect(await ok.json()).toMatchObject({ loot: "round101-ok", reviewed: 1, reboots: 0, notReboots: 1, arcs: 2 });
        await waitAuditIdle(request);
        expect(await prisma.storyReview.findFirstOrThrow({ where: { anilistIdA: X, anilistIdB: Y } })).toMatchObject({ verdict: "NOT_REBOOT", loot: "round101-ok" });
        expect((await prisma.storyArc.findMany({ where: { anilistId: Y }, orderBy: { position: "asc" } })).map((a) => [a.nameEn, a.startEpisode, a.endEpisode])).toEqual([["Opening", 1, 6], ["Finale", 7, 12]]);

        // Reaplicar atualiza em vez de duplicar, e o par sai da fila.
        expect((await request.post("/api/admin/story", { data: loot })).status()).toBe(200);
        await waitAuditIdle(request);
        expect(await prisma.storyReview.count({ where: { anilistIdA: X, anilistIdB: Y } })).toBe(1);
        expect(await prisma.storyArc.count({ where: { anilistId: Y } })).toBe(2);
        const after = await (await request.get("/api/admin/story")).json();
        expect(after.next.map((c: { a: { anilistId: number } }) => c.a.anilistId)).not.toContain(X);
        expect(after.recent.some((r: { titleA: string; verdict: string }) => r.titleA === "Par Pendente X Round101" && r.verdict === "NOT_REBOOT")).toBe(true);
        expect(after.loots).toContainEqual({ loot: "round101-ok", items: 1 });

        // Lote só de arcos (obra avulsa, sem par): grava os arcos e troca os anteriores; lote sem par nem arcos é recusado.
        const empty = await request.post("/api/admin/story", { data: { loot: "round101-vazio" } });
        expect(empty.status()).toBe(400);
        expect(((await empty.json()).errors as string[]).join(" ")).toMatch(/ao menos um par/);
        const solo = await request.post("/api/admin/story", { data: { loot: "round101-arcos", arcs: [{ anilistId: Y, source: "https://example.org/arcos", list: [{ nameEn: "Whole story", start: 1, end: 12 }] }] } });
        expect(solo.status()).toBe(200);
        expect(await solo.json()).toMatchObject({ loot: "round101-arcos", reviewed: 0, reboots: 0, notReboots: 0, arcs: 1 });
        await waitAuditIdle(request);
        expect((await prisma.storyArc.findMany({ where: { anilistId: Y } })).map((a) => [a.nameEn, a.startEpisode, a.endEpisode, a.loot])).toEqual([["Whole story", 1, 12, "round101-arcos"]]);
      });

      test("o painel mostra o andamento e aplica um lote colado", async ({ page }) => {
        await page.goto("/admin/curadoria");
        const panel = page.getByTestId("story-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByTestId("story-count")).toContainText("pares pesquisados");
        await expect(panel.getByTestId("story-recent")).toContainText("Par Pendente X Round101");
        await expect(panel.getByTestId("story-long-without-arcs")).toContainText("Séries longas sem arcos:");

        await panel.getByTestId("story-loot-text").fill("isto não é json");
        await panel.getByTestId("story-loot-apply").click();
        await expect(panel.getByTestId("story-loot-errors")).toContainText("não é um JSON válido");

        await panel.getByTestId("story-loot-text").fill(JSON.stringify({ loot: "round101-painel", items: [{ a: OLD_MOVIE, b: NEW_MOVIE, verdict: "NOT_REBOOT", note: "filmes de versões diferentes" }] }));
        await panel.getByTestId("story-loot-apply").click();
        await expect(panel.getByTestId("story-loot-done")).toContainText("Lote round101-painel aplicado: 1 par(es) conferido(s), 0 reboot(s)");
        await expect(panel.getByTestId("story-summary")).toContainText("round101-painel: 1");
        await waitAuditIdle(page.request);
      });
    });
  });
});

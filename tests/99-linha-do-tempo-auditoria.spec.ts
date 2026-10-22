import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";

// Epic 45: a auditoria passa por todas as obras, franquia por franquia: põe séries, OVA, ODA e filmes em ordem cronológica
// (com o papel e a temporada de cada uma), corrige o formato dos nomes, aponta nomes e obras repetidas e o que não tem data
// ou contradiz as relações. Roda sobre o banco de teste, sem serviço externo.
const SEASON1 = 999001;
const SEASON2 = 999002;
const OVA = 999003;
const MOVIE = 999004;
const ODA = 999005; // sem data nenhuma
const LATE_PREQUEL = 999007; // 2015
const EARLY_SEQUEL = 999006; // 2008, "sequência" do de 2015
const BAD_NAME = 999008;
const TWIN = 999009;
const ANIDB_TWIN = 999100;
const IDS = [SEASON1, SEASON2, OVA, MOVIE, ODA, EARLY_SEQUEL, LATE_PREQUEL, BAD_NAME, TWIN];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const rel = (...pairs: Array<[number, string]>) => JSON.stringify(pairs.map(([id, relationType]) => ({ id, titleRomaji: `x${id}`, format: "TV", relationType })));

test.describe.serial("Auditoria das linhas do tempo", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { OR: [{ anilistId: { in: IDS } }, { anidbId: ANIDB_TWIN }] }, select: { id: true } });
    await prisma.curationIssue.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
    await prisma.catalogEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
  }

  async function runAndWait(request: import("@playwright/test").APIRequestContext) {
    const before = (await (await request.get("/api/admin/timeline")).json()).job?.seq ?? 0;
    expect((await request.post("/api/admin/timeline")).status()).toBe(202);
    await expect
      .poll(async () => {
        const status = await (await request.get("/api/admin/timeline")).json();
        return status.job && status.job.seq > before ? status.job.state : "WAITING";
      }, { timeout: 90_000 })
      .toBe("SUCCESS");
    return (await (await request.get("/api/admin/timeline")).json()).progress;
  }

  const entry = (anilistId: number, titleRomaji: string, extra: Record<string, unknown> = {}) =>
    prisma.catalogEntry.create({ data: { source: "anilist", onPlatform: true, anilistId, titleRomaji, format: "TV", kind: "EPISODE", ...extra } as never });

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const at = (iso: string) => ({ startDate: new Date(iso), seasonYear: Number(iso.slice(0, 4)) });
    await entry(SEASON1, "Linha Round99 ", { ...at("2010-04-01T00:00:00Z"), titleEnglish: "Round99 &amp; Co", relationsJson: rel([SEASON2, "SEQUEL"], [OVA, "SIDE_STORY"], [MOVIE, "SIDE_STORY"], [ODA, "SIDE_STORY"]) });
    await entry(SEASON2, "Linha Round99 2", { ...at("2012-04-01T00:00:00Z"), relationsJson: rel([SEASON1, "PREQUEL"]) });
    await entry(OVA, "Linha Round99 OVA", { ...at("2011-01-01T00:00:00Z"), format: "OVA", kind: "OVA", relationsJson: rel([SEASON1, "PARENT"]) });
    await entry(MOVIE, "Linha Round99 Movie", { ...at("2013-06-01T00:00:00Z"), format: "MOVIE", kind: "MOVIE", relationsJson: rel([SEASON1, "PARENT"]) });
    await entry(ODA, "Linha Round99 Disc", { format: "SPECIAL", kind: "ODA", relationsJson: rel([SEASON1, "PARENT"]) });
    await entry(LATE_PREQUEL, "Contradiz Round99 A", { ...at("2015-01-01T00:00:00Z"), relationsJson: rel([EARLY_SEQUEL, "SEQUEL"]) });
    await entry(EARLY_SEQUEL, "Contradiz Round99 B", { ...at("2008-01-01T00:00:00Z"), relationsJson: rel([LATE_PREQUEL, "PREQUEL"]) });
    await entry(BAD_NAME, "999008", at("2001-01-01T00:00:00Z"));
    await entry(TWIN, "Gemea Unica Round99", at("2011-07-01T00:00:00Z"));
    await prisma.catalogEntry.create({ data: { source: "anidb", onPlatform: true, anidbId: ANIDB_TWIN, titleRomaji: "Gemea Unica Round99!", format: "TV", kind: "EPISODE", ...at("2011-07-10T00:00:00Z") } });
  });

  test.afterAll(async () => {
    await clean();
    // Pendências e posições que a auditoria gravou nas obras dos outros testes.
    await prisma.curationIssue.deleteMany({ where: { code: { in: ["NAME_INVALID", "DUPLICATE_SUSPECT", "TIMELINE_UNDATED", "TIMELINE_CONFLICT"] } } });
    await prisma.adminJob.deleteMany({ where: { kind: "TIMELINE" } });
    await prisma.$disconnect();
  });

  test("só o administrador consulta e inicia a auditoria", async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.get("/api/admin/timeline")).status()).toBe(401);
    expect((await guest.post("/api/admin/timeline")).status()).toBe(401);
    await guest.dispose();
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
    expect((await member.get("/api/admin/timeline")).status()).toBe(403);
    expect((await member.post("/api/admin/timeline")).status()).toBe(403);
    await member.dispose();
  });

  test("põe a franquia em ordem cronológica, com o papel e a temporada de cada obra", async ({ request }) => {
    const progress = await runAndWait(request);
    expect(progress.finished).toBe(true);
    expect(progress.franchises).toBeGreaterThan(0);

    const rows = await prisma.catalogEntry.findMany({ where: { anilistId: { in: [SEASON1, SEASON2, OVA, MOVIE, ODA] } }, orderBy: { timelineOrder: "asc" } });
    expect(rows.map((r) => [r.anilistId, r.timelineOrder, r.timelineRole, r.timelineSeason, r.franchiseKey])).toEqual([
      [SEASON1, 1, "MAIN", 1, SEASON1],
      [OVA, 2, "SPECIAL", null, SEASON1],
      [SEASON2, 3, "MAIN", 2, SEASON1],
      [MOVIE, 4, "SPECIAL", null, SEASON1],
      [ODA, 5, "SPECIAL", null, SEASON1], // sem data: no fim
    ]);
  });

  test("corrige o formato dos nomes e deixa o resto para conferir", async ({ request }) => {
    const season1 = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: SEASON1 } });
    expect(season1.titleRomaji).toBe("Linha Round99");
    expect(season1.titleEnglish).toBe("Round99 & Co");

    const issues = await prisma.curationIssue.findMany({ where: { status: "OPEN", anilistId: { in: IDS } }, orderBy: { code: "asc" } });
    const by = (code: string) => issues.filter((i) => i.code === code).map((i) => i.anilistId);
    expect(by("NAME_INVALID")).toEqual([BAD_NAME]);
    expect(by("TIMELINE_UNDATED")).toEqual([ODA]);
    expect(by("TIMELINE_CONFLICT")).toEqual([EARLY_SEQUEL]);
    expect(by("DUPLICATE_SUSPECT")).toEqual([TWIN]);
    const twin = await prisma.curationIssue.findFirstOrThrow({ where: { anidbId: ANIDB_TWIN, code: "DUPLICATE_SUSPECT" } });
    expect(twin.detail).toContain("AniList 999009");

    // Corrigido o nome, a pendência fecha na próxima rodada; as demais seguem abertas (e sem duplicar).
    await prisma.catalogEntry.update({ where: { anilistId: BAD_NAME }, data: { titleRomaji: "Nome Certo Round99" } });
    await runAndWait(request);
    const after = await prisma.curationIssue.findMany({ where: { anilistId: { in: IDS } } });
    expect(after.find((i) => i.code === "NAME_INVALID")?.status).toBe("RESOLVED");
    expect(after.filter((i) => i.code === "TIMELINE_UNDATED" && i.status === "OPEN")).toHaveLength(1);
    expect(after.filter((i) => i.code === "DUPLICATE_SUSPECT")).toHaveLength(1);
  });

  test("o painel mostra o andamento, o resumo e as novas pendências", async ({ page }) => {
    await page.goto("/admin/curadoria");
    const panel = page.getByTestId("timeline-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("timeline-state")).toHaveText("Auditada");
    await expect(panel.getByTestId("timeline-summary")).toContainText("Linha principal");
    await expect(panel.getByTestId("timeline-summary")).toContainText("Grupos de obras repetidas");
    await expect(panel.getByTestId("timeline-start")).toHaveText("Auditar de novo");

    const card = page.getByTestId("curation-issue-DUPLICATE_SUSPECT");
    await expect(card).toContainText("Possível obra duplicada");
    await card.getByRole("button", { name: "Ver" }).click();
    await expect(page.getByTestId("curation-issue-list-DUPLICATE_SUSPECT")).toContainText("Gemea Unica Round99");
  });

  test("a revisão mostra o par lado a lado, só oferece juntar a cópia do AniDB e valida o pedido", async ({ request }) => {
    const { pairs } = (await (await request.get("/api/admin/duplicates")).json()) as { pairs: Array<{ left: { anilistId: number | null; anidbId: number | null }; right: { anilistId: number | null; anidbId: number | null }; merge: { anidbId: number; anilistId: number } | null }> };
    const pair = pairs.find((p) => [p.left, p.right].some((s) => s.anidbId === ANIDB_TWIN));
    expect(pair?.merge).toEqual({ anidbId: ANIDB_TWIN, anilistId: TWIN });
    expect((await request.post("/api/admin/duplicates", { data: { action: "merge", anidbId: "x", anilistId: TWIN } })).status()).toBe(400);
    expect((await request.post("/api/admin/duplicates", { data: { action: "dismiss", entryIds: [] } })).status()).toBe(400);
    expect((await request.post("/api/admin/duplicates", { data: { action: "outra" } })).status()).toBe(400);
    // A AniList não responde neste teste: o pedido falha sem juntar nada e o par continua para revisar.
    expect((await request.post("/api/admin/duplicates", { data: { action: "merge", anidbId: ANIDB_TWIN, anilistId: TWIN } })).status()).toBe(502);
    expect(await prisma.catalogEntry.count({ where: { anidbId: ANIDB_TWIN, anilistId: null } })).toBe(1);
  });

  test('"não é a mesma obra" tira o par da lista e a auditoria não o reabre', async ({ page, request }) => {
    await page.goto("/admin/curadoria");
    const pair = page.getByTestId("duplicates-pair").filter({ hasText: "Gemea Unica Round99" });
    await expect(pair).toHaveCount(1);
    await expect(pair.getByTestId("duplicates-merge")).toBeVisible();
    await pair.getByTestId("duplicates-dismiss").click();
    await expect(page.getByTestId("duplicates-message")).toContainText("obras diferentes");
    await expect(page.getByTestId("duplicates-pair").filter({ hasText: "Gemea Unica Round99" })).toHaveCount(0);

    await runAndWait(request);
    const open = await prisma.curationIssue.count({ where: { code: "DUPLICATE_SUSPECT", status: "OPEN", OR: [{ anilistId: TWIN }, { anidbId: ANIDB_TWIN }] } });
    expect(open).toBe(0);
    expect(await prisma.curationIssue.count({ where: { code: "DUPLICATE_SUSPECT", status: "DISMISSED", OR: [{ anilistId: TWIN }, { anidbId: ANIDB_TWIN }] } })).toBe(2);
  });
});

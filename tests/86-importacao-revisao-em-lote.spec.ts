import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";

// Importação: todas as pendências numa tela só, cada uma com "Obra nova / Mesma obra / Ignorar", aplicadas de uma vez.
const CANDIDATE = 986001;
const OTHER = 986002;

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Revisão em lote das pendências da importação", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let seq: number;
  let ids: { strong: string; weak: string; none: string };

  async function clean() {
    await prisma.adminJob.deleteMany({ where: { season: "Summer2031", source: "AniDB", kind: "IMPORT" } });
    await prisma.production.deleteMany({ where: { anilistId: { in: [CANDIDATE, OTHER] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [CANDIDATE, OTHER] } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: [CANDIDATE, OTHER] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const productions = [];
    for (const [anilistId, title] of [[CANDIDATE, "Candidato Round86"], [OTHER, "Outro Candidato Round86"]] as const) {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: anilistId, name: title } });
      productions.push(await prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji: title, seasonNumber: 1, season: "SUMMER", seasonYear: 2031, format: "TV", genres: "Comedy", streamingLinksJson: "[]", fetchedAt: new Date() } }));
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: title, season: "SUMMER", seasonYear: 2031, genres: "Comedy", source: "anilist", onPlatform: true } });
    }
    const job = await prisma.adminJob.create({ data: { kind: "IMPORT", source: "AniDB", season: "Summer2031", state: "RUNNING", stage: "MATCHING", total: 3 } });
    seq = job.seq;
    const base = { jobSeq: seq, seasonLabel: "Summer2031", year: 2031, state: "PENDING" } as const;
    const strong = await prisma.importRecord.create({ data: { ...base, sourceKey: "986101", titleRomaji: "Pendente Forte Round86", matchedProductionId: productions[0].id, matchedAnilistId: CANDIDATE, score: 0.88 } });
    const weak = await prisma.importRecord.create({ data: { ...base, sourceKey: "986102", titleRomaji: "Pendente Fraco Round86", matchedProductionId: productions[1].id, matchedAnilistId: OTHER, score: 0.6 } });
    const none = await prisma.importRecord.create({ data: { ...base, sourceKey: "986103", titleRomaji: "Pendente Sem Candidato Round86" } });
    ids = { strong: strong.id, weak: weak.id, none: none.id };
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a API exige admin e valida as decisões", async ({ playwright, baseURL, request }) => {
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.patch(`/api/admin/imports/${seq}/records`, { data: { decisions: [{ id: ids.weak, action: "new" }] } })).status()).toBe(401);
    await guest.dispose();
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
    expect((await member.patch(`/api/admin/imports/${seq}/records`, { data: { decisions: [{ id: ids.weak, action: "new" }] } })).status()).toBe(403);
    await member.dispose();

    for (const bad of [{}, { decisions: [] }, { decisions: [{ id: ids.weak, action: "apagar" }] }, { decisions: [{ action: "new" }] }]) {
      expect((await request.patch(`/api/admin/imports/${seq}/records`, { data: bad })).status()).toBe(400);
    }
    expect((await request.patch(`/api/admin/imports/999999/records`, { data: { decisions: [{ id: ids.weak, action: "new" }] } })).status()).toBe(404);
    // Confirmar sem candidato não aplica nada, e o registro continua pendente.
    const res = await request.patch(`/api/admin/imports/${seq}/records`, { data: { decisions: [{ id: ids.none, action: "confirm" }] } });
    expect(await res.json()).toMatchObject({ applied: 0, skipped: 1 });
    expect((await prisma.importRecord.findUniqueOrThrow({ where: { id: ids.none } })).state).toBe("PENDING");
  });

  test("a tela lista todas as pendências de uma vez, com 'Obra nova' como padrão para as pouco prováveis", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    const box = page.getByTestId("bulk-review");
    await expect(box).toContainText("Revisar as 3 pendências de uma vez");
    await expect(page.getByTestId(`bulk-row-${ids.strong}`)).toContainText("Candidato Round86");
    await expect(page.getByTestId(`bulk-row-${ids.strong}`)).toContainText("88% de semelhança");
    await expect(page.getByTestId(`bulk-row-${ids.none}`)).toContainText("Sem candidato");
    await expect(page.getByTestId(`bulk-choice-${ids.strong}-confirm`)).toBeChecked(); // candidato bem provável
    await expect(page.getByTestId(`bulk-choice-${ids.weak}-new`)).toBeChecked();
    await expect(page.getByTestId(`bulk-choice-${ids.none}-new`)).toBeChecked();
    await expect(page.getByTestId(`bulk-choice-${ids.none}-confirm`)).toBeDisabled(); // sem candidato não há "mesma obra"
    await expect(page.getByTestId("bulk-tally")).toHaveText("2 novas · 1 mesma obra · 0 ignoradas");
    // Nada foi salvo só por abrir a tela.
    expect(await prisma.importRecord.count({ where: { jobSeq: seq, state: "PENDING" } })).toBe(3);
  });

  test("'Todas como obra nova' marca tudo de uma vez e o ajuste individual vale", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByTestId("bulk-all-new").click();
    await expect(page.getByTestId("bulk-tally")).toHaveText("3 novas · 0 mesma obra · 0 ignoradas");
    await page.getByTestId(`bulk-choice-${ids.none}-ignore`).check();
    await expect(page.getByTestId("bulk-tally")).toHaveText("2 novas · 0 mesma obra · 1 ignoradas");
    await page.getByTestId("bulk-suggested").click();
    await expect(page.getByTestId("bulk-tally")).toHaveText("2 novas · 1 mesma obra · 0 ignoradas");
  });

  test("aplicar resolve todas as pendências de uma vez e libera a confirmação da importação", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    await expect(page.getByTestId("confirm-import")).toBeDisabled();
    await page.getByTestId(`bulk-choice-${ids.none}-ignore`).check();
    await page.getByTestId("bulk-apply").click();
    await expect(page.getByTestId("bulk-done")).toContainText("3 decisões aplicadas");

    const states = Object.fromEntries((await prisma.importRecord.findMany({ where: { jobSeq: seq } })).map((r) => [r.id, r.state]));
    expect(states[ids.strong]).toBe("CONFIRMED");
    expect(states[ids.weak]).toBe("NEW");
    expect(states[ids.none]).toBe("IGNORED");
    const weak = await prisma.importRecord.findUniqueOrThrow({ where: { id: ids.weak } });
    expect(weak.matchedProductionId).toBeNull(); // obra nova não fica amarrada ao candidato errado
    expect(await prisma.adminLog.count({ where: { jobSeq: seq, event: "Bulk review" } })).toBe(1);

    await expect(page.getByTestId("confirm-import")).toBeEnabled();
    await expect(page.getByTestId("result-ready")).toBeVisible();
    await expect(page.getByTestId("bulk-review")).toHaveCount(0);
  });

  test("depois de decididas, repetir a chamada não muda nada", async ({ request }) => {
    const res = await request.patch(`/api/admin/imports/${seq}/records`, { data: { decisions: [{ id: ids.weak, action: "ignore" }] } });
    expect(await res.json()).toMatchObject({ applied: 0, skipped: 1 });
    expect((await prisma.importRecord.findUniqueOrThrow({ where: { id: ids.weak } })).state).toBe("NEW");
  });
});

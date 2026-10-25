import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Fase 5: Admin → Calendário. O horário efetivo (override) vale no calendário público e na lista do admin, inclusive
// quando o override traz o episódio para dentro da semana; "por que não apareceu?" explica com as regras reais;
// a releitura da agenda é controlada; "a fonte mudou depois do override" vira conflito e escolher a fonte tira o override.
const WORK = 106001;
const HIDDEN = 106002;
const DAY = 86_400_000;

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Admin — calendário", () => {
  let prisma: PrismaClient;
  let workId: string;
  let userId: string;
  let handle: string;
  // Fora da semana na fonte (daqui a 20 dias); o override traz para amanhã.
  const sourceAt = new Date(Date.now() + 20 * DAY);
  const overrideAt = new Date(Date.now() + DAY);

  async function clean() {
    await prisma.catalogConflict.deleteMany({ where: { anilistId: { in: [WORK, HIDDEN] } } });
    await prisma.catalogOverride.deleteMany({ where: { anilistId: { in: [WORK, HIDDEN] } } });
    await prisma.adminLog.deleteMany({ where: { context: { in: [`AniList ${WORK}`, `AniList ${HIDDEN}`] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WORK, HIDDEN] } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [WORK, HIDDEN] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [WORK, HIDDEN] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    workId = (await prisma.catalogEntry.create({ data: { anilistId: WORK, titleRomaji: "Calendario Admin Round106", source: "anilist", onPlatform: true, kind: "EPISODE", format: "TV", status: "RELEASING" } })).id;
    await prisma.catalogEntry.create({ data: { anilistId: HIDDEN, titleRomaji: "Fora Da Plataforma Round106", source: "anilist", onPlatform: false, kind: "EPISODE", format: "TV" } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    userId = user.id;
    handle = user.handle ?? "";
    await prisma.anime.create({ data: { userId, anilistId: WORK, catalogEntryId: workId, titleRomaji: "Calendario Admin Round106", status: "RELEASING", waiting: true } });
    await prisma.airingScheduleEntry.create({ data: { anilistId: WORK, catalogEntryId: workId, episode: 5, airingAt: sourceAt, titleRomaji: "Calendario Admin Round106" } });
    await prisma.catalogOverride.create({ data: { anilistId: WORK, episode: 5, field: "airingAt", titleSnapshot: "Calendario Admin Round106", originalValue: sourceAt, originalSource: "AniList", value: overrideAt, reason: "Antecipado", adminName: "Admin" } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("o calendário público usa o horário do override, mesmo vindo de fora da semana", async ({ request }) => {
    const res = await request.get(`/api/calendar?weekStart=${Math.floor((Date.now() - DAY) / 1000)}`);
    const { results } = await res.json();
    const item = results.find((r: { anilistId: number; episode: number }) => r.anilistId === WORK && r.episode === 5);
    expect(item, "o override traz o EP5 para esta semana").toBeTruthy();
    expect(new Date(item.airingAt).getTime()).toBe(overrideAt.getTime());
  });

  test("só o administrador investiga e relê a agenda", async ({ request }) => {
    expect((await request.post("/api/admin/calendar/diagnose", { data: { q: "Round106" } })).status()).toBe(403);
    expect((await request.post("/api/admin/calendar/reload", { data: { workId } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("a página lista o período no horário efetivo e marca o horário manual", async ({ page }) => {
      await page.goto("/admin/calendario");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Calendário");
      const table = page.getByTestId("calendar-admin-table");
      await expect(table).toContainText("Calendario Admin Round106");
      await expect(table).toContainText("horário manual");
      await expect(page.getByRole("navigation", { name: "Administração" }).getByRole("link", { name: "Calendário" })).toBeVisible();
    });

    test("por que não apareceu: obra fora da plataforma e pessoa em Espera", async ({ request, page }) => {
      const hidden = await (await request.post("/api/admin/calendar/diagnose", { data: { q: String(HIDDEN) } })).json();
      expect(hidden.checks.find((c: { key: string }) => c.key === "platform").ok).toBe(false);
      expect(hidden.conclusion).toContain("Na plataforma");

      const person = await (await request.post("/api/admin/calendar/diagnose", { data: { q: String(WORK), user: TEST_USER_EMAIL } })).json();
      const by = (key: string) => person.checks.find((c: { key: string }) => c.key === key);
      expect(by("follows").ok).toBe(true);
      expect(by("waiting").ok).toBe(false);
      expect(by("future").detail).toContain("(override)");
      expect(person.conclusion).toContain("Espera");

      // Pela tela (a pessoa vai no corpo do pedido, não no endereço).
      await page.goto("/admin/calendario");
      await page.getByTestId("investigate-work").fill(String(WORK));
      if (handle) await page.getByTestId("investigate-user").fill(`@${handle}`);
      await page.getByTestId("investigate-run").click();
      await expect(page.getByTestId("investigate-conclusion")).toBeVisible();
      await expect(page.getByTestId("check-future")).toContainText("EP5");
      expect(page.url()).not.toContain("@");
    });

    test("a releitura é controlada: obra inválida, fora da plataforma e uma vez a cada 2 minutos", async ({ request }) => {
      expect((await request.post("/api/admin/calendar/reload", { data: { workId: "nao-existe-123" } })).status()).toBe(404);
      const hiddenId = (await prisma.catalogEntry.findFirstOrThrow({ where: { anilistId: HIDDEN } })).id;
      expect((await request.post("/api/admin/calendar/reload", { data: { workId: hiddenId } })).status()).toBe(400);
      // No teste a AniList não responde (502); a tentativa fica no log e a segunda é recusada pelo intervalo.
      const first = await request.post("/api/admin/calendar/reload", { data: { workId } });
      expect([200, 502]).toContain(first.status());
      expect((await request.post("/api/admin/calendar/reload", { data: { workId } })).status()).toBe(429);
      expect(await prisma.adminLog.count({ where: { event: "Calendar reload", context: `AniList ${WORK}` } })).toBe(1);
    });

    test("conflito 'a fonte mudou depois do override': ficar com a fonte tira o override", async ({ request, page }) => {
      const conflict = await prisma.catalogConflict.create({
        data: { anilistId: WORK, episode: 5, field: "airingAt", titleSnapshot: "Calendario Admin Round106", aValue: new Date(sourceAt.getTime() + 3600_000), aSource: "AniList", bValue: overrideAt, bSource: "Override (admin)", bMeta: JSON.stringify({ overrideReason: "Antecipado", overrideBy: "Admin", previousSourceValue: sourceAt.toISOString() }) },
      });
      await page.goto(`/admin/conflitos?id=${conflict.id}`);
      await expect(page.getByTestId("conflict-override-note")).toContainText("A fonte mudou depois do override");

      expect((await request.patch(`/api/admin/conflicts/${conflict.id}`, { data: { resolution: "A" } })).status()).toBe(200);
      expect(await prisma.catalogOverride.count({ where: { anilistId: WORK, episode: 5, removedAt: null } })).toBe(0);
      expect((await prisma.catalogConflict.findUniqueOrThrow({ where: { id: conflict.id } })).status).toBe("RESOLVED");
    });
  });
});

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";
import { todayAtNoonSaoPaulo } from "./test-time";

// Epic 50: o horário da fonte é o da TV japonesa; o admin diz quanto depois a obra sai no streaming e o calendário passa a
// mostrar esse horário, com o da TV ao lado. A agenda e o próximo episódio já gravados andam junto; tirar o atraso volta tudo.
const WORK = 102001;
const OTHER = 102002;
const HOUR = 3_600_000;

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Atraso do streaming", () => {
  let prisma: PrismaClient;
  const tv = todayAtNoonSaoPaulo(); // 12:00 em São Paulo = horário da TV japonesa, para o teste

  async function clean() {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const base = { source: "anilist", onPlatform: true, status: "RELEASING", format: "TV", kind: "EPISODE", genres: "Comedy" };
    await prisma.catalogEntry.createMany({
      data: [
        { ...base, anilistId: WORK, titleRomaji: "Goblin Streaming Round102", nextEpisodeNumber: 2, nextEpisodeAt: new Date(tv.getTime() + 7 * 24 * HOUR) },
        { ...base, anilistId: OTHER, titleRomaji: "Sem Atraso Round102" },
      ],
    });
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: WORK, episode: 1, airingAt: tv, titleRomaji: "Goblin Streaming Round102", genres: "Comedy" },
        { anilistId: WORK, episode: 2, airingAt: new Date(tv.getTime() + 7 * 24 * HOUR), titleRomaji: "Goblin Streaming Round102", genres: "Comedy" },
        { anilistId: OTHER, episode: 1, airingAt: tv, titleRomaji: "Sem Atraso Round102", genres: "Comedy" },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  const schedule = async () => (await prisma.airingScheduleEntry.findMany({ where: { anilistId: WORK }, orderBy: { episode: "asc" } })).map((s) => s.airingAt.getTime());

  test("só o administrador grava o atraso", async ({ request }) => {
    const res = await request.post("/api/admin/streaming-delay", { data: { anilistId: WORK, minutes: 120 } });
    expect([401, 403]).toContain(res.status());
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("pedido inválido e obra que não existe são recusados", async ({ request }) => {
      expect((await request.post("/api/admin/streaming-delay", { data: { anilistId: WORK, minutes: 1.5 } })).status()).toBe(400);
      expect((await request.post("/api/admin/streaming-delay", { data: { anilistId: WORK, minutes: 5000 } })).status()).toBe(400);
      expect((await request.post("/api/admin/streaming-delay", { data: { anilistId: 999_999_999, minutes: 60 } })).status()).toBe(404);
    });

    test("com 2 h de atraso, a agenda, o próximo episódio e o calendário passam ao horário do streaming", async ({ request }) => {
      const res = await request.post("/api/admin/streaming-delay", { data: { anilistId: WORK, minutes: 120, site: "Crunchyroll" } });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ anilistId: WORK, minutes: 120, site: "Crunchyroll", episodes: 2 });

      expect(await schedule()).toEqual([tv.getTime() + 2 * HOUR, tv.getTime() + 7 * 24 * HOUR + 2 * HOUR]);
      const catalog = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: WORK } });
      expect(catalog).toMatchObject({ streamingDelayMinutes: 120, streamingSite: "Crunchyroll" });
      expect(catalog.nextEpisodeAt?.getTime()).toBe(tv.getTime() + 7 * 24 * HOUR + 2 * HOUR);

      const { results } = await (await request.get("/api/calendar")).json();
      const mine = results.find((r: { anilistId: number; episode: number }) => r.anilistId === WORK && r.episode === 1);
      expect(mine).toMatchObject({ airingAt: new Date(tv.getTime() + 2 * HOUR).toISOString(), streamingSite: "Crunchyroll", tvAiringAt: tv.toISOString() });
      // A outra obra não muda.
      const other = results.find((r: { anilistId: number }) => r.anilistId === OTHER);
      expect(other.airingAt).toBe(tv.toISOString());
      expect(other.tvAiringAt).toBeUndefined();

      const list = await (await request.get("/api/admin/streaming-delay")).json();
      expect(list.items).toContainEqual(expect.objectContaining({ anilistId: WORK, streamingDelayMinutes: 120, streamingSite: "Crunchyroll" }));
    });

    test("trocar o atraso desloca só a diferença, e tirar volta ao horário da TV", async ({ request }) => {
      expect((await request.post("/api/admin/streaming-delay", { data: { anilistId: WORK, minutes: 90, site: "Crunchyroll" } })).status()).toBe(200);
      expect(await schedule()).toEqual([tv.getTime() + 1.5 * HOUR, tv.getTime() + 7 * 24 * HOUR + 1.5 * HOUR]);

      expect((await request.post("/api/admin/streaming-delay", { data: { anilistId: WORK, minutes: 0 } })).status()).toBe(200);
      expect(await schedule()).toEqual([tv.getTime(), tv.getTime() + 7 * 24 * HOUR]);
      expect(await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: WORK } })).toMatchObject({ streamingDelayMinutes: null, streamingSite: null });
    });

    test("o painel do Admin → Overrides grava e tira o atraso", async ({ page }) => {
      await page.goto("/admin/overrides");
      const panel = page.getByTestId("streaming-delay-panel");
      await panel.getByTestId("streaming-delay-id").fill(String(WORK));
      await panel.getByTestId("streaming-delay-site").fill("Crunchyroll");
      await panel.getByTestId("streaming-delay-hours").fill("2");
      await panel.getByTestId("streaming-delay-minutes").fill("0");
      await panel.getByTestId("streaming-delay-save").click();
      await expect(panel.getByTestId("streaming-delay-message")).toContainText("Crunchyroll 2 h depois da TV japonesa");
      await expect(panel.getByTestId("streaming-delay-list")).toContainText("Goblin Streaming Round102");
      expect(await schedule()).toEqual([tv.getTime() + 2 * HOUR, tv.getTime() + 7 * 24 * HOUR + 2 * HOUR]);
    });
  });

  test("o card do calendário mostra o horário do streaming e o da TV japonesa", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    const note = page.locator('[data-testid^="calendar-entry-streaming-"]', { hasText: "Crunchyroll" }).first();
    await expect(note).toContainText("Crunchyroll · no Japão 12:00");
  });

  test.describe("como administrador, no fim", () => {
    test.use({ storageState: adminState });
    test("tirar pelo painel volta ao horário da TV", async ({ page }) => {
      await page.goto("/admin/overrides");
      await page.getByTestId(`streaming-delay-remove-${WORK}`).click();
      await expect(page.getByTestId("streaming-delay-message")).toContainText(`Atraso retirado da obra #${WORK}`);
      expect(await schedule()).toEqual([tv.getTime(), tv.getTime() + 7 * 24 * HOUR]);
    });
  });
});

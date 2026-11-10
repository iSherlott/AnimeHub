import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { todayAtNoonSaoPaulo } from "./test-time";

// Pedido de 09/11: abrir a descrição de um anime no calendário (com aviso de episódio novo no sino) apaga o aviso dessa
// obra — antes era preciso abrir a prévia e depois ir ao sino só para desligar aquele aviso.
const WORK = 143001;
const OTHER = 143002;
const DAY = 24 * 3600 * 1000;

test.describe.serial("Abrir a prévia no calendário apaga o aviso da obra no sino", () => {
  let prisma: PrismaClient;
  let userId = "";

  async function clean() {
    await prisma.airingAlert.deleteMany({ where: { userId, anilistId: { in: [WORK, OTHER] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await prisma.anime.deleteMany({ where: { userId, anilistId: { in: [WORK, OTHER] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    const now = Date.now();
    await prisma.airingScheduleEntry.create({ data: { anilistId: WORK, episode: 3, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Aviso Round143" } });
    await prisma.anime.createMany({
      data: [
        { userId, anilistId: WORK, titleRomaji: "Aviso Round143", genres: "" },
        { userId, anilistId: OTHER, titleRomaji: "Outra Round143", genres: "" },
      ],
    });
    await prisma.airingAlert.createMany({
      data: [
        { userId, anilistId: WORK, episode: 3, airingAt: new Date(now - 5 * 60_000) }, // o de hoje: some ao abrir a prévia
        { userId, anilistId: WORK, episode: 4, airingAt: new Date(todayAtNoonSaoPaulo().getTime() + 2 * DAY) }, // o de depois: fica para o dia dele
        { userId, anilistId: OTHER, episode: 7, airingAt: new Date(now - 10 * 60_000) }, // outra obra: continua
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  const unseen = async (anilistId: number, episode: number) => (await prisma.airingAlert.findFirstOrThrow({ where: { userId, anilistId, episode } })).seenAt === null;

  test("passar o mouse não conta; clicar abre a prévia e apaga só o aviso de hoje dessa obra, sem recarregar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/calendar");
    const entry = page.getByTestId(`calendar-entry-${WORK}-3`);
    const counts = page.getByTestId("bell-counts");
    await expect(counts).toBeVisible();
    const before = Number((await counts.getAttribute("aria-label"))?.match(/^\d+/)?.[0]);
    expect(before).toBeGreaterThanOrEqual(2);

    await entry.hover();
    await expect(page.getByRole("dialog", { name: /Prévia de/ })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await unseen(WORK, 3)).toBe(true);

    await page.mouse.move(0, 0);
    await entry.click();
    await expect(page.getByRole("dialog", { name: /Prévia de/ })).toBeVisible();
    await expect.poll(() => unseen(WORK, 3)).toBe(false);
    await expect(counts).toHaveAttribute("aria-label", new RegExp(`^${before - 1} `));
    expect(await unseen(WORK, 4)).toBe(true);
    expect(await unseen(OTHER, 7)).toBe(true);
  });

  test("a rota só mexe nos avisos da própria pessoa e recusa obra inválida", async ({ request }) => {
    expect((await request.post("/api/notifications/seen-by-work", { data: { anilistId: "x" } })).status()).toBe(400);
    const res = await request.post("/api/notifications/seen-by-work", { data: { anilistId: OTHER } });
    expect(await res.json()).toEqual({ ok: true, seen: 1 });
    expect(await unseen(OTHER, 7)).toBe(false);
    expect(await unseen(WORK, 4)).toBe(true);
  });
});

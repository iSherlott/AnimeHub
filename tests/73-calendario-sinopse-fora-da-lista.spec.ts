import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { todayAtNoonSaoPaulo } from "./test-time";

// Epic 29 — a sinopse do preview do calendário vem do cache de lançamentos (AiringScheduleEntry.description), pedida
// pela prévia ao abrir (/api/catalog/preview) — a semana não carrega a sinopse de cada episódio
// para obras fora da lista; para as da lista, a sinopse própria da pessoa tem prioridade.
const WITH = 973001;
const WITHOUT = 973002;
const OWNED = 973003;

test.describe.serial("Calendário — sinopse de obra fora da lista", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WITH, WITHOUT, OWNED] } } });
    await prisma.anime.deleteMany({ where: { anilistId: OWNED } });
    const at = todayAtNoonSaoPaulo();
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: WITH, episode: 1, airingAt: at, titleRomaji: "Sinopse Cache Round73", description: "Sinopse vinda do cache de lançamentos." },
        { anilistId: WITHOUT, episode: 1, airingAt: at, titleRomaji: "Sem Sinopse Round73", description: null },
        { anilistId: OWNED, episode: 1, airingAt: at, titleRomaji: "Da Lista Round73", description: "Sinopse do cache (não deve aparecer)." },
      ],
    });
    await prisma.anime.create({ data: { userId: user.id, anilistId: OWNED, titleRomaji: "Da Lista Round73", genres: "", description: "Sinopse própria da lista." } });
  });

  test.afterAll(async () => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WITH, WITHOUT, OWNED] } } });
    await prisma.anime.deleteMany({ where: { anilistId: OWNED } });
    await prisma.$disconnect();
  });

  test("a semana não leva as sinopses; a prévia pede a da obra: do cache fora da lista, a da lista para quem acompanha", async ({ request }) => {
    const { results } = await (await request.get("/api/calendar")).json();
    const by = (id: number) => results.find((r: { anilistId: number }) => r.anilistId === id);
    expect(by(WITH)).toMatchObject({ inMyList: false });
    expect(by(OWNED)).toMatchObject({ inMyList: true });
    for (const r of [by(WITH), by(WITHOUT), by(OWNED)]) expect(r).not.toHaveProperty("description");

    const preview = async (id: number) => (await request.get(`/api/catalog/preview?work=${id}`)).json();
    expect(await preview(WITH)).toMatchObject({ description: "Sinopse vinda do cache de lançamentos." });
    expect(await preview(WITHOUT)).toMatchObject({ description: null });
    expect(await preview(OWNED)).toMatchObject({ description: "Sinopse própria da lista." });

    // `mine=1` (Dashboard, lateral do Feed): só os episódios da lista, sem o resto da semana nem o "fora da grade".
    const mine = await (await request.get("/api/calendar?mine=1")).json();
    expect(mine.results.every((r: { inMyList: boolean }) => r.inMyList)).toBe(true);
    expect(mine.results.map((r: { anilistId: number }) => r.anilistId)).toContain(OWNED);
    expect(mine.offGrid).toEqual([]);
  });

  test("o preview mostra a sinopse do cache fora da lista e o aviso quando não há nenhuma", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    await page.getByTestId(`calendar-entry-${WITH}-1`).hover();
    await expect(page.getByTestId("calendar-preview")).toContainText("Sinopse vinda do cache de lançamentos.");

    await page.mouse.move(0, 0);
    await expect(page.getByTestId("calendar-preview")).toBeHidden();
    await page.getByTestId(`calendar-entry-${WITHOUT}-1`).hover();
    await expect(page.getByTestId("calendar-preview")).toContainText("Sem sinopse — abra pra ver mais.");
  });
});

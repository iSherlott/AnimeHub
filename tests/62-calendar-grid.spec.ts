import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { todayAtNoonSaoPaulo } from "./test-time";

// Agenda semanal em grade de horas (Figma 8:2106): blocos posicionados pelo
// horário local, sobreposição lado a lado e escala para monitores largos.
const IDS = [962001, 962002, 962003];

function at(hourBRT: number, minute = 0): Date {
  const noon = todayAtNoonSaoPaulo(); // 12:00 BRT de hoje
  return new Date(noon.getTime() + ((hourBRT - 12) * 60 + minute) * 60_000);
}

test.describe("Calendário em grade de horas", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: IDS[0], episode: 1, airingAt: at(10), titleRomaji: "Grade Manha Sozinha" },
        { anilistId: IDS[1], episode: 2, airingAt: at(20), titleRomaji: "Grade Noite Um" },
        { anilistId: IDS[2], episode: 3, airingAt: at(21), titleRomaji: "Grade Noite Dois" },
      ],
    });
  });

  test.afterAll(async () => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.$disconnect();
  });

  async function openAll(page: import("@playwright/test").Page) {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(page.getByTestId("calendar-grid")).toBeVisible();
  }

  test("cada bloco fica na altura do seu horário (eixo de 40 px por hora na base de 1440 px)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAll(page);
    const strip = page.getByTestId("calendar-entry-962001-1").locator("..");
    const stripBox = (await strip.boundingBox())!;
    const block = (await page.getByTestId("calendar-entry-962001-1").boundingBox())!;
    // 10:00 = 10 h * 40 px (a faixa tem borda de 1 px).
    expect(Math.abs(block.y - stripBox.y - 400)).toBeLessThanOrEqual(3);
    await expect(page.getByTestId("calendar-entry-962001-1")).toContainText("10:00 · EP01");
  });

  test("dois lançamentos próximos dividem a coluna lado a lado, sem se cobrir", async ({ page }) => {
    await openAll(page);
    const a = (await page.getByTestId("calendar-entry-962002-2").boundingBox())!;
    const b = (await page.getByTestId("calendar-entry-962003-3").boundingBox())!;
    const horizontallyDisjoint = a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1;
    expect(horizontallyDisjoint).toBe(true);
    // O bloco sozinho usa a coluna inteira (mais largo que cada um dos dois).
    const alone = (await page.getByTestId("calendar-entry-962001-1").boundingBox())!;
    expect(alone.width).toBeGreaterThan(a.width * 1.6);
  });

  test("monitor ultrawide: a grade usa a tela toda e os blocos crescem junto", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAll(page);
    const narrow = (await page.getByTestId("calendar-entry-962001-1").boundingBox())!;
    const narrowFont = await page.getByTestId("calendar-grid").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    await page.setViewportSize({ width: 3440, height: 1440 });
    const wide = (await page.getByTestId("calendar-entry-962001-1").boundingBox())!;
    const wideFont = await page.getByTestId("calendar-grid").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const gridBox = (await page.getByTestId("calendar-grid").boundingBox())!;

    expect(narrowFont).toBeCloseTo(14, 0);
    expect(wideFont).toBeGreaterThanOrEqual(21); // base cresce até 22 px
    expect(gridBox.width).toBeGreaterThan(3000); // sem teto de 1440 px
    expect(wide.width).toBeGreaterThan(narrow.width * 2); // colunas bem mais largas
    expect(wide.height).toBeGreaterThan(narrow.height * 1.4); // e blocos mais altos
  });

  test("filtro Minha Lista/Todos e navegação de semana do Figma", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("button", { name: "Semana anterior" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Próxima semana" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hoje" })).toBeDisabled(); // já está na semana atual
    await page.getByRole("button", { name: "Próxima semana" }).click();
    await expect(page.getByRole("button", { name: "Hoje" })).toBeEnabled();
    await page.getByRole("button", { name: "Hoje" }).click();
    await expect(page.getByRole("button", { name: "Hoje" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Minha Lista" })).toHaveAttribute("aria-pressed", "true");
  });
});

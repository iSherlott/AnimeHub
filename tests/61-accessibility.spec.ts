import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// F14 (VIS-001…005, VT-A-01…10): auditoria automatizada com axe nas telas
// principais + verificações de teclado/landmarks. Só falhas "serious" e
// "critical" quebram o teste; as demais ficam registradas na saída.
const PROD_ID = 961000;

type AxeViolation = { id: string; impact?: string | null; help: string; nodes: Array<{ target: unknown[]; html: string }> };

async function audit(page: import("@playwright/test").Page): Promise<AxeViolation[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return blocking as AxeViolation[];
}

function describeViolations(violations: AxeViolation[]): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 3).map((n) => `   ${n.target.join(" ")}  ${n.html.slice(0, 140)}`).join("\n")}`)
    .join("\n");
}

test.describe("Acessibilidade", () => {
  let prisma: PrismaClient;
  let userId = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    const franchise = await prisma.franchise.upsert({
      where: { rootAnilistId: PROD_ID },
      create: { rootAnilistId: PROD_ID, name: "Franquia A11y" },
      update: {},
    });
    await prisma.production.upsert({
      where: { anilistId: PROD_ID },
      create: { anilistId: PROD_ID, franchiseId: franchise.id, titleRomaji: "Obra A11y", titleNative: "アクセシビリティ", format: "TV", fetchedAt: new Date() },
      update: { fetchedAt: new Date() },
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  const PAGES: Array<{ name: string; path: () => string }> = [
    { name: "Comunidade", path: () => "/" },
    { name: "Explorar", path: () => "/discover" },
    { name: "Calendário", path: () => "/calendar" },
    { name: "Minha lista", path: () => "/minha-lista" },
    { name: "Dashboard", path: () => "/dashboard" },
    { name: "Detalhe da obra", path: () => `/obra/${PROD_ID}` },
    { name: "Busca", path: () => "/buscar?q=anime&scope=posts" },
    { name: "Configurações", path: () => "/configuracoes" },
    { name: "Perfil", path: () => `/users/${userId}` },
  ];

  for (const p of PAGES) {
    test(`axe: ${p.name} sem violações sérias ou críticas`, async ({ page }) => {
      await page.goto(p.path());
      await page.waitForLoadState("networkidle");
      const violations = await audit(page);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  }

  test("axe: login e cadastro (visitante)", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    for (const path of ["/login", "/signup", `/obra/${PROD_ID}`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const violations = await audit(page);
      expect(violations, `${path}\n${describeViolations(violations)}`).toEqual([]);
    }
    await ctx.close();
  });

  test("teclado: primeiro Tab leva ao skip-link, que move o foco para o conteúdo", async ({ page }) => {
    await page.goto("/discover");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#conteudo")).toBeFocused();
  });

  test("landmarks: uma única <main>, navegação principal e um <h1> por tela", async ({ page }) => {
    for (const path of ["/", "/discover", "/calendar", "/minha-lista", `/obra/${PROD_ID}`]) {
      await page.goto(path);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });

  test("alvos: botões de ícone têm pelo menos 44 x 44 px", async ({ page }) => {
    await page.goto("/dashboard");
    const icons = page.locator("header button[aria-label]");
    const count = await icons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await icons.nth(i).boundingBox();
      if (!box) continue; // oculto neste viewport
      expect(box.width, `largura do botão ${i}`).toBeGreaterThanOrEqual(44);
      expect(box.height, `altura do botão ${i}`).toBeGreaterThanOrEqual(44);
    }
  });

  test("títulos em japonês declaram lang=\"ja\" (leitores de tela pronunciam certo)", async ({ page }) => {
    await page.goto(`/obra/${PROD_ID}`);
    await expect(page.locator('[lang="ja"]').first()).toBeVisible();
  });
});

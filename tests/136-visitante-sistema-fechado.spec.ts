import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Sistema fechado, do lado de quem não entrou: o menu só mostra o que a pessoa pode abrir (Calendário e Explorar); Feed,
// Meus animes, Comunidades, perfis e o resto da parte social levam ao login (que devolve a pessoa à página depois), e as
// APIs dessa parte respondem 401. O catálogo (Explorar, Calendário, Temporada, página da obra) continua aberto.
test.describe("Visitante num sistema fechado", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let userId = "";
  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.$disconnect();
  });

  for (const viewport of [{ name: "computador", width: 1280, height: 800 }, { name: "celular", width: 375, height: 812 }]) {
    test(`menu (${viewport.name}): só Calendário e Explorar`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/discover");
      if (viewport.width < 1240) await page.getByRole("button", { name: /menu/i }).first().click();
      const nav = page.getByRole("navigation", { name: "Navegação principal" }).last();
      await expect(nav.getByRole("link", { name: "Calendário" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Explorar" })).toBeVisible();
      for (const hidden of ["Feed", "Meus animes", "Comunidades"]) await expect(page.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();
    });
  }

  test("as páginas da parte social levam ao login, que guarda o destino", async ({ page }) => {
    const cases: Array<[string, string]> = [
      ["/", "%2F"],
      ["/minha-lista", "%2Fminha-lista"],
      ["/comunidades", "%2Fcomunidades"],
      [`/users/${userId}`, `%2Fusers%2F${userId}`],
      ["/hashtag/qualquer", "%2Fhashtag%2Fqualquer"],
      ["/publicar", "%2Fpublicar"],
      ["/amigos", "%2Famigos"],
      ["/configuracoes", "%2Fconfiguracoes"],
      ["/trocar-senha", "%2Ftrocar-senha"],
    ];
    for (const [path, next] of cases) {
      await page.goto(path);
      await expect(page, path).toHaveURL(new RegExp(`/login\\?next=${next}$`));
    }
  });

  test("o catálogo continua aberto: Explorar, Calendário e Temporada", async ({ page }) => {
    for (const path of ["/discover", "/calendar"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test("as APIs da parte social respondem 401 a quem não entrou", async ({ request }) => {
    for (const url of [`/api/users/${userId}`, `/api/users/${userId}/posts`, `/api/users/${userId}/animes`, `/api/users/${userId}/scraps`, "/api/hashtags", "/api/hashtags/qualquer", "/api/feed/trending-posts", "/api/posts?tab=recent", "/api/communities/active-topics", "/api/anime-threads/trending", "/api/quiz/1"]) {
      expect((await request.get(url)).status(), url).toBe(401);
    }
    // O catálogo segue público.
    for (const url of ["/api/catalog/facets", "/api/calendar", "/api/seasons"]) expect((await request.get(url)).status(), url).toBe(200);
  });

  test("ao entrar, o login devolve a pessoa à página que ela tentou abrir", async ({ page }) => {
    await page.goto("/comunidades");
    await expect(page).toHaveURL(/\/login\?next=%2Fcomunidades$/);
    await expect(page.getByText(/as contas são criadas pela administração/)).toBeVisible();
  });
});

test.describe("Quem entrou vê o menu inteiro", () => {
  test("Feed, Calendário, Explorar, Meus animes e Comunidades", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/discover");
    const nav = page.getByRole("link", { name: /^(Explorar|Calendário|Meus animes|Feed|Comunidades)$/ });
    await expect(nav).toHaveText(["Feed", "Calendário", "Explorar", "Meus animes", "Comunidades"]);
  });
});

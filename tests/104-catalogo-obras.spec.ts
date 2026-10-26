import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Fase 3: catálogo canônico de obras no admin. Lista com filtros, detalhe, edição com revisão (antes → depois), proteção
// contra a importação, conflito de edição simultânea (409), devolver campo à fonte, publicar/despublicar com impacto,
// histórico por campo e cópias (página pública, listas, agenda) atualizadas pela obra.
const WORK = 104001;
const TITLE = "Obra Canonica Round104";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Admin — catálogo de obras", () => {
  let prisma: PrismaClient;
  let entryId: string;

  async function clean() {
    await prisma.changeLog.deleteMany({ where: { entity: "CatalogEntry", catalogEntryId: entryId ?? "-" } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: WORK } });
    await prisma.anime.deleteMany({ where: { anilistId: WORK } });
    await prisma.production.deleteMany({ where: { anilistId: WORK } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: WORK } });
    await deleteCatalogEntries(prisma, { where: { anilistId: WORK } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const entry = await prisma.catalogEntry.create({ data: { anilistId: WORK, titleRomaji: TITLE, source: "anilist", onPlatform: true, kind: "EPISODE", format: "TV", episodes: 12, seasonYear: 2026, season: "FALL", genres: "Drama" } });
    entryId = entry.id;
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: WORK, name: TITLE } });
    await prisma.production.create({ data: { anilistId: WORK, catalogEntryId: entryId, franchiseId: franchise.id, titleRomaji: TITLE, format: "TV", episodes: 12 } });
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.anime.create({ data: { userId, anilistId: WORK, catalogEntryId: entryId, titleRomaji: TITLE } });
    await prisma.airingScheduleEntry.create({ data: { anilistId: WORK, catalogEntryId: entryId, episode: 1, airingAt: new Date(Date.now() - 86_400_000), titleRomaji: TITLE } });
    await prisma.airingScheduleEntry.create({ data: { anilistId: WORK, catalogEntryId: entryId, episode: 2, airingAt: new Date(Date.now() + 6 * 86_400_000), titleRomaji: TITLE } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("só o administrador lista, abre e edita obras", async ({ request }) => {
    expect((await request.get("/api/admin/works")).status()).toBe(403);
    expect((await request.get(`/api/admin/works/${entryId}`)).status()).toBe(403);
    expect((await request.patch(`/api/admin/works/${entryId}`, { data: { expectedUpdatedAt: new Date().toISOString(), changes: { titleEnglish: "x" } } })).status()).toBe(403);
    expect((await request.post(`/api/admin/works/${entryId}/visibility`, { data: { onPlatform: false, reason: "x" } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("a lista filtra no servidor e leva ao detalhe", async ({ page, request }) => {
      const api = await (await request.get(`/api/admin/works?q=${encodeURIComponent("Round104")}`)).json();
      expect(api.rows.map((r: { id: string }) => r.id)).toContain(entryId);
      const none = await (await request.get(`/api/admin/works?q=Round104&qualidade=sem-genero`)).json();
      expect(none.rows).toHaveLength(0);

      await page.goto("/admin/obras?q=Round104");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Catálogo de obras");
      await page.getByTestId(`work-link-${entryId}`).click();
      await expect(page).toHaveURL(new RegExp(`/admin/obras/${entryId}`));
      await expect(page.getByTestId("episodes-informed")).toHaveText("12");
      await expect(page.getByTestId("episodes-registered")).toHaveText("2");
      await expect(page.getByTestId("episodes-aired")).toHaveText("1");
      await expect(page.getByTestId("work-detail-copies")).toBeVisible();
    });

    test("edita com revisão antes → depois, protege o campo e leva às cópias", async ({ page }) => {
      await page.goto(`/admin/obras/${entryId}`);
      await page.getByTestId("edit-titleEnglish").fill("Canonical Work 104");
      await page.getByTestId("edit-episodes").fill("13");
      await page.getByTestId("edit-reason").fill("Corrigido pelo site oficial");
      await page.getByTestId("work-edit-review").click();
      const diff = page.getByTestId("work-edit-diff");
      await expect(diff).toContainText("Canonical Work 104");
      await expect(diff).toContainText("12");
      await expect(diff).toContainText("13");
      await page.getByTestId("work-edit-confirm").click();
      await expect(page.getByTestId("work-edit-message")).toContainText("Salvo: 2 campo(s)");

      const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: entryId } });
      expect(entry.titleEnglish).toBe("Canonical Work 104");
      expect(entry.episodes).toBe(13);
      expect([...entry.manualFields].sort()).toEqual(["episodes", "titleEnglish"]);
      expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: WORK } })).titleEnglish).toBe("Canonical Work 104");
      expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: WORK } })).episodes).toBe(13);
      expect((await prisma.anime.findFirstOrThrow({ where: { anilistId: WORK } })).titleEnglish).toBe("Canonical Work 104");

      const log = await prisma.changeLog.findMany({ where: { catalogEntryId: entryId, origin: "ADMIN" } });
      const titleChange = log.find((l) => l.field === "titleEnglish");
      expect(JSON.parse(titleChange?.after ?? "null")).toBe("Canonical Work 104"); // antes/depois guardados como JSON
      expect(titleChange?.reason).toBe("Corrigido pelo site oficial");
      await page.reload();
      await expect(page.getByTestId("work-detail-history")).toContainText("Corrigido pelo site oficial");
    });

    test("recusa edição sobre versão antiga (409) e valida os campos (400)", async ({ request }) => {
      const stale = "2000-01-01T00:00:00.000Z";
      const conflict = await request.patch(`/api/admin/works/${entryId}`, { data: { expectedUpdatedAt: stale, changes: { titleEnglish: "Outra" } } });
      expect(conflict.status()).toBe(409);
      expect((await conflict.json()).current.titleEnglish).toBe("Canonical Work 104");

      const current = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: entryId } });
      const invalid = await request.patch(`/api/admin/works/${entryId}`, { data: { expectedUpdatedAt: current.updatedAt.toISOString(), changes: { format: "SERIE", anilistId: 1 } } });
      expect(invalid.status()).toBe(400);
      expect(Object.keys((await invalid.json()).errors).sort()).toEqual(["anilistId", "format"]);
      expect((await request.patch(`/api/admin/works/nao-existe`, { data: { expectedUpdatedAt: current.updatedAt.toISOString(), changes: { titleEnglish: "x" } } })).status()).toBe(404);
    });

    test("devolve um campo à fonte", async ({ request }) => {
      const current = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: entryId } });
      const res = await request.patch(`/api/admin/works/${entryId}`, { data: { expectedUpdatedAt: current.updatedAt.toISOString(), changes: {}, unprotect: ["episodes"] } });
      expect(res.status()).toBe(200);
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: entryId } })).manualFields).toEqual(["titleEnglish"]);
    });

    test("tirar da plataforma mostra o impacto, exige motivo e não apaga nada; publicar de novo volta", async ({ page, request }) => {
      expect((await request.post(`/api/admin/works/${entryId}/visibility`, { data: { onPlatform: false } })).status()).toBe(400);

      await page.goto(`/admin/obras/${entryId}`);
      await page.getByTestId("work-visibility").click();
      const impact = page.getByTestId("work-visibility-impact");
      await expect(impact).toContainText("1 pessoa(s) acompanham");
      await expect(impact).toContainText("1 episódio(s) futuros");
      await expect(page.getByTestId("work-visibility-confirm")).toBeDisabled();
      await page.getByTestId("work-visibility-reason").fill("Duplicada de outra obra");
      await page.getByTestId("work-visibility-confirm").click();
      await expect(page.getByTestId("work-visibility")).toHaveText("Publicar na plataforma");
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: entryId } })).onPlatform).toBe(false);
      expect(await prisma.airingScheduleEntry.count({ where: { anilistId: WORK } })).toBe(2);
      expect(await prisma.anime.count({ where: { anilistId: WORK } })).toBe(1);
      const hidden = await prisma.changeLog.findFirstOrThrow({ where: { catalogEntryId: entryId, field: "onPlatform" }, orderBy: { at: "desc" } });
      expect(hidden.reason).toBe("Duplicada de outra obra");

      await page.getByTestId("work-visibility").click();
      await page.getByTestId("work-visibility-confirm").click();
      await expect(page.getByTestId("work-visibility")).toHaveText("Tirar da plataforma");
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: entryId } })).onPlatform).toBe(true);
    });

    test("a saúde do catálogo abre com os grupos e leva à lista filtrada", async ({ page }) => {
      await page.goto("/admin/saude");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Saúde do catálogo");
      for (const group of ["public", "schedule", "decisions", "infra", "quality"]) await expect(page.getByTestId(`health-group-${group}`)).toBeVisible();
      await expect(page.getByTestId("health-protegidas-count")).not.toHaveText("0");
      await page.getByTestId("health-protegidas").getByRole("link", { name: "Ver" }).click();
      await expect(page).toHaveURL(/\/admin\/obras\?qualidade=protegida/);
      await expect(page.getByTestId(`work-link-${entryId}`)).toBeVisible();
      // Menu em grupos: "Saúde do catálogo" está em "Visão geral", que abre com um clique.
      const nav = page.getByRole("navigation", { name: "Administração" });
      await expect(nav.getByRole("link", { name: "Catálogo de obras" })).toBeVisible();
      await nav.getByTestId("admin-group-toggle-visao").click();
      await expect(nav.getByRole("link", { name: "Saúde do catálogo" })).toBeVisible();
    });
  });
});

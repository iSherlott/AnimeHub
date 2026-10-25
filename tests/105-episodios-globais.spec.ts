import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Fase 4 (ADR 0009): episódios globais — a linha da agenda é o episódio da obra, igual para todo mundo. Situação derivada
// da data (sem inventar horário), resumo com o informado pela fonte separado do calculado, edição com motivo, override
// quando a fonte tem dia e hora, aviso único de data alterada, proteção contra as fontes e troca de obra/número segura.
const WORK = 105001;
const OTHER = 105002;
const DAY = 86_400_000;

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Episódios globais", () => {
  let prisma: PrismaClient;
  let workId: string;
  let otherId: string;
  let userId: string;
  const ep: Record<number, string> = {};
  const past = new Date(Date.now() - 2 * DAY);
  const future = new Date(Date.now() + 5 * DAY);

  async function clean() {
    const rows = await prisma.airingScheduleEntry.findMany({ where: { anilistId: { in: [WORK, OTHER] } }, select: { id: true } });
    await prisma.changeLog.deleteMany({ where: { entityId: { in: rows.map((r) => r.id) } } });
    await prisma.catalogOverride.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await prisma.airingAlert.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await prisma.episodeSourceCheck.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [WORK, OTHER] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    workId = (await prisma.catalogEntry.create({ data: { anilistId: WORK, titleRomaji: "Episodios Globais Round105", source: "anilist", onPlatform: true, kind: "EPISODE", format: "TV", episodes: 12, status: "RELEASING" } })).id;
    otherId = (await prisma.catalogEntry.create({ data: { anilistId: OTHER, titleRomaji: "Outra Obra Round105", source: "anilist", onPlatform: true, kind: "EPISODE", format: "TV" } })).id;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.user.update({ where: { id: userId }, data: { notifyReleases: true } });
    await prisma.anime.create({ data: { userId, anilistId: WORK, catalogEntryId: workId, titleRomaji: "Episodios Globais Round105", status: "RELEASING" } });
    const base = { anilistId: WORK, catalogEntryId: workId, titleRomaji: "Episodios Globais Round105" };
    ep[1] = (await prisma.airingScheduleEntry.create({ data: { ...base, episode: 1, airingAt: past, episodeTitle: "Hajimari", synopsis: "O começo." } })).id;
    ep[2] = (await prisma.airingScheduleEntry.create({ data: { ...base, episode: 2, airingAt: future } })).id;
    ep[3] = (await prisma.airingScheduleEntry.create({ data: { ...base, episode: 3, airingAt: null, airDate: new Date(Date.UTC(2020, 0, 10)), dateCertainty: "DATE_ONLY", source: "legacy" } })).id;
    ep[4] = (await prisma.airingScheduleEntry.create({ data: { ...base, episode: 4, airingAt: null, dateCertainty: "UNKNOWN", source: "kitsu" } })).id;
    // Já consultada: a página da obra não vai à Kitsu durante o teste.
    await prisma.episodeSourceCheck.create({ data: { anilistId: WORK, found: 4 } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("só o administrador lista, abre e edita episódios", async ({ request }) => {
    expect((await request.get("/api/admin/episodes")).status()).toBe(403);
    expect((await request.get(`/api/admin/episodes/${ep[1]}`)).status()).toBe(403);
    expect((await request.patch(`/api/admin/episodes/${ep[1]}`, { data: { expectedUpdatedAt: new Date().toISOString(), changes: { synopsis: "x" } } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("a lista da obra separa exibido, agendado, só o dia e sem data — sem inventar horário", async ({ page, request }) => {
      const api = await (await request.get(`/api/admin/episodes?obra=${workId}`)).json();
      const states = Object.fromEntries(api.rows.map((r: { episode: number; state: string }) => [r.episode, r.state]));
      expect(states).toEqual({ 1: "AIRED", 2: "SCHEDULED", 3: "AIRED", 4: "UNKNOWN_DATE" });
      expect(api.rows.find((r: { episode: number }) => r.episode === 3).airingAt).toBeNull();

      const undated = await (await request.get(`/api/admin/episodes?obra=${workId}&pendencia=sem-data`)).json();
      expect(undated.rows.map((r: { episode: number }) => r.episode)).toEqual([4]);
      const scheduled = await (await request.get(`/api/admin/episodes?obra=${workId}&situacao=SCHEDULED`)).json();
      expect(scheduled.rows.map((r: { episode: number }) => r.episode)).toEqual([2]);

      await page.goto(`/admin/episodios?obra=${workId}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Episódios");
      await expect(page.getByTestId(`episode-state-${ep[4]}`)).toContainText("Data desconhecida");
      await expect(page.getByTestId(`episode-state-${ep[3]}`)).toContainText("Exibido");
      await expect(page.getByTestId("admin-episodes-table")).toContainText("(só o dia)");
    });

    test("o resumo da obra separa o informado pela fonte do calculado", async ({ page }) => {
      await page.goto(`/admin/obras/${workId}`);
      await expect(page.getByTestId("episodes-informed")).toHaveText("12");
      await expect(page.getByTestId("episodes-registered")).toHaveText("4");
      await expect(page.getByTestId("episodes-aired")).toHaveText("2");
      await expect(page.getByTestId("episodes-upcoming")).toHaveText("1");
      await expect(page.getByTestId("episodes-undated")).toHaveText("1");
      await expect(page.getByTestId("episodes-next")).toContainText("Ep. 2");
    });

    test("edita título, sinopse e dia (só o dia) com revisão; data exige motivo; o que mudou fica protegido", async ({ page }) => {
      await page.goto(`/admin/episodios/${ep[4]}`);
      await page.getByTestId("ep-edit-episodeTitleJa").fill("終わりの始まり");
      await page.getByTestId("ep-edit-synopsis").fill("O fim do começo.");
      await page.getByTestId("ep-edit-mode-day").click();
      await page.getByTestId("ep-edit-airdate").fill("2099-03-01");
      await page.getByTestId("ep-edit-review").click();
      await expect(page.getByTestId("ep-edit-diff")).toContainText("2099-03-01 (só o dia)");
      await page.getByTestId("ep-edit-confirm").click();
      // Sem motivo, a data não passa.
      await expect(page.getByTestId("ep-edit-message")).toContainText("Corrija os campos");
      await page.getByTestId("ep-edit-reason").fill("Data anunciada no site oficial");
      await page.getByTestId("ep-edit-review").click();
      await page.getByTestId("ep-edit-confirm").click();
      await expect(page.getByTestId("ep-edit-message")).toContainText("Salvo: 3 campo(s)");

      const row = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[4] } });
      expect(row.episodeTitleJa).toBe("終わりの始まり");
      expect(row.airingAt).toBeNull();
      expect(row.airDate?.toISOString().slice(0, 10)).toBe("2099-03-01");
      expect(row.dateCertainty).toBe("DATE_ONLY");
      expect([...row.manualFields].sort()).toEqual(["airDate", "episodeTitleJa", "synopsis"]);
      const log = await prisma.changeLog.findFirstOrThrow({ where: { entityId: ep[4], field: "airDate" } });
      expect(log.reason).toBe("Data anunciada no site oficial");
      await page.reload();
      await expect(page.getByTestId("episode-detail-history")).toContainText("Data anunciada no site oficial");
    });

    test("corrigir o horário de um episódio com hora da fonte vira override e avisa quem acompanha uma vez", async ({ request }) => {
      const row = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[2] } });
      const moved = new Date(future.getTime() + 3 * 3600_000);
      const res = await request.patch(`/api/admin/episodes/${ep[2]}`, { data: { expectedUpdatedAt: row.updatedAt.toISOString(), changes: { airingAt: moved.toISOString() }, reason: "Atraso anunciado pela emissora" } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ override: true, alerts: true });

      // O valor da fonte continua guardado; o efetivo é o override.
      expect((await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[2] } })).airingAt?.getTime()).toBe(future.getTime());
      const override = await prisma.catalogOverride.findFirstOrThrow({ where: { anilistId: WORK, episode: 2, removedAt: null } });
      expect(override.value.getTime()).toBe(moved.getTime());
      expect(override.originalValue.getTime()).toBe(future.getTime());
      const alert = await prisma.airingAlert.findUniqueOrThrow({ where: { userId_anilistId_episode: { userId, anilistId: WORK, episode: 2 } } });
      expect(alert.airingAt.getTime()).toBe(moved.getTime());
      expect(alert.previousAiringAt?.getTime()).toBe(future.getTime());

      // Repetir o mesmo valor não gera outro aviso nem outra alteração.
      const again = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[2] } });
      const repeat = await request.patch(`/api/admin/episodes/${ep[2]}`, { data: { expectedUpdatedAt: again.updatedAt.toISOString(), changes: { airingAt: moved.toISOString() }, reason: "de novo" } });
      expect(repeat.status()).toBe(400);
      expect(await prisma.airingAlert.count({ where: { anilistId: WORK, episode: 2 } })).toBe(1);

      const list = await (await request.get(`/api/admin/episodes?obra=${workId}&numero=2`)).json();
      expect(list.rows[0]).toMatchObject({ overridden: true, airingAt: moved.toISOString() });
    });

    test("recusa versão antiga (409), número repetido (409), número sem motivo (400) e campo inválido (400)", async ({ request }) => {
      const row = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[4] } });
      const stale = await request.patch(`/api/admin/episodes/${ep[4]}`, { data: { expectedUpdatedAt: "2000-01-01T00:00:00.000Z", changes: { synopsis: "x" } } });
      expect(stale.status()).toBe(409);
      expect((await stale.json()).current.id).toBe(ep[4]);

      const v = row.updatedAt.toISOString();
      const noReason = await request.patch(`/api/admin/episodes/${ep[4]}`, { data: { expectedUpdatedAt: v, changes: { episode: 5 } } });
      expect(noReason.status()).toBe(400);
      expect((await noReason.json()).errors).toHaveProperty("reason");

      const clash = await request.patch(`/api/admin/episodes/${ep[4]}`, { data: { expectedUpdatedAt: v, changes: { episode: 1 }, reason: "teste de colisão" } });
      expect(clash.status()).toBe(409);

      const invalid = await request.patch(`/api/admin/episodes/${ep[4]}`, { data: { expectedUpdatedAt: v, changes: { airingAt: "2026-10-30 10:00", status: "LANCADO", anilistId: 1 }, reason: "x y z" } });
      expect(invalid.status()).toBe(400);
      expect(Object.keys((await invalid.json()).errors).sort()).toEqual(["airingAt", "anilistId", "status"]);
    });

    test("cancelar o episódio tira ele dos exibidos e da agenda", async ({ request }) => {
      const row = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[1] } });
      const res = await request.patch(`/api/admin/episodes/${ep[1]}`, { data: { expectedUpdatedAt: row.updatedAt.toISOString(), changes: { status: "CANCELLED" }, reason: "Fonte confirmou cancelamento" } });
      expect(res.status()).toBe(200);
      const api = await (await request.get(`/api/admin/episodes?obra=${workId}&numero=1`)).json();
      expect(api.rows[0].state).toBe("CANCELLED");
      const back = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[1] } });
      expect((await request.patch(`/api/admin/episodes/${ep[1]}`, { data: { expectedUpdatedAt: back.updatedAt.toISOString(), changes: { status: "ACTIVE" }, reason: "Era engano" } })).status()).toBe(200);
    });
  });

  test("a página da obra (de quem acompanha) mostra o título e a sinopse do episódio global", async ({ page }) => {
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: WORK } });
    await page.goto(`/anime/${anime.id}`);
    const tile = page.getByTestId("episode-tile-1-4");
    await expect(tile).toContainText("終わりの始まり");
    // Só o dia: a data aparece sem horário inventado.
    await expect(page.getByTestId("episode-release-1-4")).toHaveText(/01 mar 2099$/);
    // A sinopse fica atrás do aviso de spoiler.
    await page.getByTestId("episode-toggle").click(); // a lista de episódios vem minimizada
    await expect(tile.getByText("O fim do começo.")).toHaveCount(0);
    // Clicar antes de a página ficar interativa não abre: repete até a sinopse aparecer (sem fechar de novo).
    await expect(async () => {
      const show = tile.getByRole("button", { name: /Mostrar sinopse/ });
      if (await show.isVisible()) await show.click();
      await expect(tile.getByText("O fim do começo.")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("episode-tile-1-1")).toContainText("Hajimari");
  });

  test.describe("como administrador (troca de obra)", () => {
    test.use({ storageState: adminState });

    test("mover o episódio para a obra certa exige motivo e leva o override junto", async ({ request }) => {
      const row = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[2] } });
      const res = await request.patch(`/api/admin/episodes/${ep[2]}`, { data: { expectedUpdatedAt: row.updatedAt.toISOString(), changes: { workId: otherId }, reason: "Ligado à obra errada" } });
      expect(res.status()).toBe(200);
      const moved = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: ep[2] } });
      expect(moved).toMatchObject({ anilistId: OTHER, catalogEntryId: otherId, titleRomaji: "Outra Obra Round105", episode: 2 });
      expect(await prisma.catalogOverride.count({ where: { anilistId: OTHER, episode: 2, removedAt: null } })).toBe(1);
      expect(await prisma.catalogOverride.count({ where: { anilistId: WORK, episode: 2, removedAt: null } })).toBe(0);
    });
  });
});

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Fase 7: taxonomia (o banco aplica o vocabulário em toda gravação; criar, variação, mesclar, excluir com solução),
// traduções (automática × revisada × manual, protegidas), pendências (prioridade, ignorar com justificativa, resolver
// só com a condição atendida, reabrir) e franquia com ordem manual protegida e desfazer.
const W1 = 108001;
const W2 = 108002;
const W3 = 108003;
const FR = 108001; // franquia: raiz = W1
const GENRES = ["Round108 Fantasia", "Round108 Magia", "Round108 Variação"];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Taxonomia, traduções, pendências e franquia", () => {
  let prisma: PrismaClient;
  const id: Record<number, string> = {};

  async function clean() {
    const ids = (await prisma.catalogEntry.findMany({ where: { anilistId: { in: [W1, W2, W3] } }, select: { id: true } })).map((e) => e.id);
    await prisma.changeLog.deleteMany({ where: { OR: [{ catalogEntryId: { in: ids } }, { entity: "Genre", entityId: { in: GENRES } }, { entity: "CurationIssue" }] } });
    await prisma.curationIssue.deleteMany({ where: { entryId: { in: ids } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [W1, W2, W3] } } });
    await prisma.catalogGenre.deleteMany({ where: { genreKey: { in: GENRES } } });
    await prisma.genre.updateMany({ where: { mergedInto: { in: GENRES } }, data: { mergedInto: null } });
    await prisma.genre.deleteMany({ where: { key: { in: GENRES } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const base = { source: "anilist", onPlatform: true, kind: "EPISODE", franchiseKey: FR };
    id[W1] = (await prisma.catalogEntry.create({ data: { ...base, anilistId: W1, titleRomaji: "Taxonomia Round108 Um", genres: "Drama", description: "<p>Original one.</p>", descriptionPt: "Original um (automática).", descriptionPtStatus: "AUTO", timelineOrder: 1, timelineRole: "MAIN", timelineSeason: 1, seasonYear: 2020 } })).id;
    id[W2] = (await prisma.catalogEntry.create({ data: { ...base, anilistId: W2, titleRomaji: "Taxonomia Round108 Dois", genres: "Drama", description: "Original two.", timelineOrder: 2, timelineRole: "MAIN", timelineSeason: 2, seasonYear: 2022 } })).id;
    id[W3] = (await prisma.catalogEntry.create({ data: { ...base, anilistId: W3, titleRomaji: "Taxonomia Round108 Filme", genres: null, timelineOrder: 3, timelineRole: "SPECIAL", seasonYear: 2021 } })).id;
    await prisma.curationIssue.createMany({
      data: [
        { entryId: id[W3], anilistId: W3, title: "Taxonomia Round108 Filme", code: "NO_GENRE" },
        { entryId: id[W2], anilistId: W2, title: "Taxonomia Round108 Dois", code: "OFFICIAL_SITE_MISSING" },
        { entryId: id[W1], anilistId: W1, title: "Taxonomia Round108 Um", code: "DUPLICATE_SUSPECT", detail: "mesmo título de outra obra" },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("só o administrador mexe na taxonomia, traduções, pendências e franquias", async ({ request }) => {
    expect((await request.get("/api/admin/genres")).status()).toBe(403);
    expect((await request.post("/api/admin/genres", { data: { key: "X" } })).status()).toBe(403);
    expect((await request.get("/api/admin/translations")).status()).toBe(403);
    expect((await request.get("/api/admin/curation/queue")).status()).toBe(403);
    expect((await request.post(`/api/admin/franchises/${FR}`, { data: { action: "save", items: [] } })).status()).toBe(403);
  });

  test("o banco aplica o vocabulário em qualquer gravação: variação vira o gênero, desconhecido fica para revisar", async () => {
    await prisma.catalogEntry.update({ where: { id: id[W1] }, data: { genres: "drama, Drama,Comedy,Round108 Variação" } });
    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W1] } });
    expect(entry.genres).toBe("Drama,Comedy,Round108 Variação");
    expect(await prisma.catalogGenre.count({ where: { catalogEntryId: id[W1] } })).toBe(3);
    expect((await prisma.genre.findUniqueOrThrow({ where: { key: "Round108 Variação" } })).registered).toBe(false);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("criar gênero, registrar variação (as obras acompanham) e ver as obras dele", async ({ page, request }) => {
      await page.goto("/admin/taxonomia");
      await expect(page.getByTestId("taxonomy-review")).toContainText("Round108 Variação");
      await page.getByTestId("genre-new-key").fill("Round108 Fantasia");
      await page.getByTestId("genre-create").click();
      await expect(page.getByTestId("genre-create-message")).toContainText("Gênero criado");
      expect((await request.post("/api/admin/genres", { data: { key: "round108 fantasia" } })).status()).toBe(409);

      // A variação registrada absorve o gênero solto e regrava a obra.
      const res = await request.patch(`/api/admin/genres/${encodeURIComponent("Round108 Fantasia")}`, { data: { aliases: ["Round108 Variação"] } });
      expect(res.status()).toBe(200);
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W1] } })).genres).toBe("Drama,Comedy,Round108 Fantasia");
      const g = await (await request.get(`/api/admin/genres/${encodeURIComponent("Round108 Fantasia")}`)).json();
      expect(g.works.total).toBe(1);
      expect(g.history.rows.length).toBeGreaterThan(0);
    });

    test("excluir gênero com obras exige transferir ou remover; mesclar leva as obras e as gravações futuras", async ({ page, request }) => {
      await request.post("/api/admin/genres", { data: { key: "Round108 Magia" } });
      await prisma.catalogEntry.update({ where: { id: id[W2] }, data: { genres: "Drama,Round108 Magia" } });
      // Sem dizer o que fazer com as obras, não exclui.
      const blocked = await request.post(`/api/admin/genres/${encodeURIComponent("Round108 Magia")}`, { data: { action: "delete" } });
      expect(blocked.status()).toBe(409);
      expect((await blocked.json()).error).toContain("1 obra(s)");

      await page.goto(`/admin/taxonomia/${encodeURIComponent("Round108 Magia")}`);
      await expect(page.getByTestId("genre-delete-impact")).toContainText("1 obra(s)");
      // Escolhas feitas antes de a página ficar interativa se perdem: repete até o botão de excluir habilitar.
      await expect(async () => {
        if (!(await page.getByRole("combobox", { name: "Destino" }).textContent())?.includes("Round108 Fantasia")) {
          await page.getByRole("combobox", { name: "Destino" }).click();
          await page.getByRole("option", { name: "Round108 Fantasia" }).click();
        }
        const confirm = page.getByTestId("genre-delete-confirm").getByRole("checkbox");
        if (!(await confirm.isChecked())) await confirm.check();
        await expect(page.getByTestId("genre-delete")).toBeEnabled({ timeout: 1000 });
      }).toPass({ timeout: 15_000 });
      await page.getByTestId("genre-delete").click();
      await expect(page.getByTestId("genre-message")).toContainText("1 obra(s) atualizadas");

      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W2] } })).genres).toBe("Drama,Round108 Fantasia");
      // Gravação nova com o gênero mesclado já sai com o destino.
      await prisma.catalogEntry.update({ where: { id: id[W3] }, data: { genres: "Round108 Magia" } });
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W3] } })).genres).toBe("Round108 Fantasia");
    });

    test("traduções: aprovar protege; editar vira manual; rejeitar volta a pendente; protegida não é retraduzida", async ({ page, request }) => {
      await page.goto("/admin/traducoes?q=Round108");
      await page.getByTestId(`translation-approve-${id[W1]}`).click();
      await expect(page.getByTestId(`translation-message-${id[W1]}`)).toContainText("Aprovada");
      let e1 = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W1] } });
      expect(e1.descriptionPtStatus).toBe("REVIEWED");
      expect(e1.manualFields).toContain("descriptionPt");
      expect((await request.post(`/api/admin/translations/${id[W1]}`, { data: { action: "retranslate" } })).status()).toBe(409);

      await page.goto("/admin/traducoes?estado=pendente&q=Round108");
      await page.getByTestId(`translation-edit-${id[W2]}`).click();
      await page.getByTestId(`translation-text-${id[W2]}`).fill("Sinopse escrita pelo admin.");
      await page.getByTestId(`translation-save-${id[W2]}`).click();
      await expect(page.getByTestId(`translation-message-${id[W2]}`)).toContainText("manual");
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W2] } })).descriptionPtStatus).toBe("MANUAL");

      expect((await request.post(`/api/admin/translations/${id[W1]}`, { data: { action: "reject", reason: "Tradução literal demais" } })).status()).toBe(200);
      e1 = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W1] } });
      expect(e1.descriptionPt).toBeNull();
      expect(e1.manualFields).not.toContain("descriptionPt");
      const list = await (await request.get("/api/admin/translations?estado=pendente&q=Round108")).json();
      expect(list.rows.map((r: { id: string }) => r.id)).toContain(id[W1]);
    });

    test("pendências: prioridade, ignorar exige justificativa, resolver só com a condição atendida, reabrir conta", async ({ page, request }) => {
      const issues = await prisma.curationIssue.findMany({ where: { entryId: { in: [id[W1], id[W2], id[W3]] } } });
      const by = (code: string) => issues.find((i) => i.code === code)!;
      const q = await (await request.get("/api/admin/curation/queue?q=Round108")).json();
      // Alta primeiro, informativa por último.
      expect(q.rows.map((r: { code: string }) => r.code)).toEqual(["DUPLICATE_SUSPECT", "NO_GENRE", "OFFICIAL_SITE_MISSING"]);
      expect(q.rows[0].priority).toBe("alta");

      expect((await request.post(`/api/admin/curation/queue/${by("OFFICIAL_SITE_MISSING").id}`, { data: { action: "dismiss" } })).status()).toBe(400);
      // A obra 3 já recebeu gênero: a condição foi atendida.
      expect((await request.post(`/api/admin/curation/queue/${by("NO_GENRE").id}`, { data: { action: "resolve" } })).status()).toBe(200);
      // Site oficial continua faltando: não dá para "resolver"; ignora com justificativa.
      expect((await request.post(`/api/admin/curation/queue/${by("OFFICIAL_SITE_MISSING").id}`, { data: { action: "resolve" } })).status()).toBe(409);

      await page.goto("/admin/pendencias?q=Round108");
      await page.getByTestId(`issue-reason-${by("OFFICIAL_SITE_MISSING").id}`).fill("Obra sem site oficial");
      await page.getByTestId(`issue-dismiss-${by("OFFICIAL_SITE_MISSING").id}`).click();
      await expect(page.getByTestId(`issue-message-${by("OFFICIAL_SITE_MISSING").id}`)).toContainText("Ignorada");
      // Duplicidade depende de decisão: resolver exige motivo.
      expect((await request.post(`/api/admin/curation/queue/${by("DUPLICATE_SUSPECT").id}`, { data: { action: "resolve" } })).status()).toBe(400);
      expect((await request.post(`/api/admin/curation/queue/${by("DUPLICATE_SUSPECT").id}`, { data: { action: "resolve", reason: "São obras diferentes" } })).status()).toBe(200);
      expect((await request.post(`/api/admin/curation/queue/${by("DUPLICATE_SUSPECT").id}`, { data: { action: "reopen" } })).status()).toBe(200);
      const reopened = await prisma.curationIssue.findUniqueOrThrow({ where: { id: by("DUPLICATE_SUSPECT").id } });
      expect(reopened).toMatchObject({ status: "OPEN", reopenCount: 1, resolvedAt: null });
      const dismissed = await prisma.curationIssue.findUniqueOrThrow({ where: { id: by("OFFICIAL_SITE_MISSING").id } });
      expect(dismissed).toMatchObject({ status: "DISMISSED", dismissedReason: "Obra sem site oficial" });
      await expect(page.getByTestId("issues-reopen")).toBeVisible();
    });

    test("franquia: reordenar com prévia, salvar protege, desfazer volta", async ({ page }) => {
      await page.goto(`/admin/franquias/${FR}`);
      // O filme sobe para antes da temporada 2.
      await page.getByTestId(`franchise-up-${id[W3]}`).click();
      await expect(page.getByTestId("franchise-preview")).toContainText("Taxonomia Round108 Filme (especial) → Taxonomia Round108 Dois");
      await page.getByTestId("franchise-save").click();
      await expect(page.getByTestId("franchise-message")).toContainText("2 obra(s)");
      const film = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W3] } });
      expect(film.timelineOrder).toBe(2);
      expect(film.manualFields).toContain("timelineOrder");
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W2] } })).timelineOrder).toBe(3);

      await page.reload();
      await page.getByTestId("franchise-batches").getByRole("button", { name: "Desfazer" }).first().click();
      await expect.poll(async () => (await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W3] } })).timelineOrder).toBe(3);
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id[W3] } })).manualFields).not.toContain("timelineOrder");
    });
  });
});

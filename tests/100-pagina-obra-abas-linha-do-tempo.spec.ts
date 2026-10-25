import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { waitEpisodesStreamed } from "./streaming";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { clearGlobalEpisodes, seedGlobalEpisodes } from "./global-episodes";
import { TEST_USER_EMAIL } from "./test-auth";

// Epic 46: a página da obra mostra as temporadas em abas (Tabs), os episódios numa linha do tempo vertical com os OVA, ODA e
// filmes ramificados no ponto em que foram ao ar, e a nota em estrelas (Rating) para as temporadas que estão na lista.
const S1 = 100101;
const S2 = 100102;
const OVA = 100103; // mar/2021: entre as temporadas (ramifica da 1ª)
const MOVIE = 100104; // dez/2022: entre o ep. 1 e o 2 da 2ª temporada
const ALL = [S1, S2, OVA, MOVIE];

const rel = (...pairs: Array<[number, string]>) => JSON.stringify(pairs.map(([id, relationType]) => ({ id, titleRomaji: `x${id}`, format: "TV", relationType })));

test.describe.serial("Página da obra: abas, linha do tempo e nota em estrelas", () => {
  let prisma: PrismaClient;
  let userId: string;
  let anime1: string;
  let anime2: string;

  async function clean() {
    await clearGlobalEpisodes(prisma, ALL);
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: S1 } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();

    const entry = (anilistId: number, titleRomaji: string, kind: string, format: string, startDate: string, relationsJson: string) =>
      prisma.catalogEntry.create({
        data: { anilistId, titleRomaji, kind, format, season: "FALL", seasonYear: Number(startDate.slice(0, 4)), startDate: new Date(startDate), episodes: kind === "MOVIE" ? 1 : 12, description: `Sinopse ${titleRomaji}.`, genres: "Drama", source: "anilist", onPlatform: true, relationsJson },
      });
    await entry(S1, "Linha Round100", "EPISODE", "TV", "2020-10-01T00:00:00Z", rel([S2, "SEQUEL"], [OVA, "SIDE_STORY"]));
    await entry(S2, "Linha Round100 Season 2", "EPISODE", "TV", "2022-10-05T00:00:00Z", rel([S1, "PREQUEL"], [MOVIE, "SIDE_STORY"]));
    await entry(OVA, "Linha Round100 OVA", "OVA", "OVA", "2021-03-10T00:00:00Z", rel([S1, "PARENT"]));
    await entry(MOVIE, "Linha Round100 Movie", "MOVIE", "MOVIE", "2022-12-15T00:00:00Z", rel([S2, "PARENT"]));

    const franchise = await prisma.franchise.create({ data: { rootAnilistId: S1, name: "Linha Round100" } });
    for (const [anilistId, title, seasonNumber, year] of [[S1, "Linha Round100", 1, 2020], [S2, "Linha Round100 Season 2", 2, 2022]] as const) {
      await prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji: title, seasonNumber, status: "FINISHED", season: "FALL", seasonYear: year, format: "TV", episodes: 12, description: `Sinopse ${title}.`, genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    }

    anime1 = (await prisma.anime.create({ data: { userId, anilistId: S1, titleRomaji: "Linha Round100", genres: "", seriesKey: "linha round100", seasonNumber: 1 } })).id;
    anime2 = (await prisma.anime.create({ data: { userId, anilistId: S2, titleRomaji: "Linha Round100 Season 2", genres: "", seriesKey: "linha round100", seasonNumber: 2 } })).id;
    // Episódios globais (Fase 4) da temporada 2.
    await seedGlobalEpisodes(prisma, S2, { titleRomaji: "Linha Round100 Season 2" }, [
      { number: 1, titleRomaji: "A Volta", airDate: new Date("2022-10-05T00:00:00Z") },
      { number: 2, titleRomaji: "O Reencontro", airDate: new Date("2023-01-05T00:00:00Z") },
    ]);
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("as temporadas viram abas, e a atual abre com a linha do tempo dos episódios", async ({ page }) => {
    await page.goto(`/anime/${anime2}`);
    await waitEpisodesStreamed(page);
    const seasons = page.getByTestId("franchise-seasons");
    const tabs = seasons.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText("Temporada 1");
    await expect(tabs.nth(1)).toHaveText("Temporada 2 · atual");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

    await expect(seasons.getByTestId("episode-count")).toHaveText("2 episódios · 1 especial ramificado");
    const line = seasons.getByTestId("episode-timeline");
    await expect(line).toBeHidden(); // os episódios vêm minimizados
    await seasons.getByTestId("episode-toggle").click();
    const nodes = line.locator("li");
    await expect(nodes).toHaveCount(3);
    await expect(nodes.nth(0)).toContainText("EP 1 · A Volta");
    await expect(nodes.nth(1)).toHaveAttribute("data-branch", "true"); // o filme se ramifica entre o episódio 1 e o 2
    await expect(nodes.nth(1)).toContainText("Linha Round100 Movie");
    await expect(nodes.nth(1).getByTestId(`branch-kind-${MOVIE}`)).toHaveText("Filme");
    await expect(nodes.nth(2)).toContainText("EP 2 · O Reencontro");
    await expect(nodes.nth(0)).not.toHaveAttribute("data-branch", "true");

    // Os episódios podem ser minimizados de novo e mostrados outra vez.
    const toggle = seasons.getByTestId("episode-toggle");
    await expect(toggle).toHaveText("Minimizar episódios");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveText("Mostrar episódios");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(line).toBeHidden();
    await expect(seasons.getByTestId("episode-count")).toBeVisible(); // a contagem continua à mostra
    await toggle.click();
    await expect(toggle).toHaveText("Minimizar episódios");
    await expect(line).toBeVisible();
  });

  test("a outra aba mostra os especiais que se ramificam dela e a nota em estrelas", async ({ page }) => {
    await page.goto(`/anime/${anime2}`);
    const seasons = page.getByTestId("franchise-seasons");
    await seasons.getByRole("tab", { name: "Temporada 1" }).click();
    await expect(seasons.getByTestId(`season-${S1}`)).toBeVisible();
    const branches = seasons.getByTestId(`season-branches-${S1}`);
    await expect(branches.locator("li")).toHaveCount(1);
    await expect(branches).toContainText("Linha Round100 OVA");
    await expect(branches.getByTestId(`branch-kind-${OVA}`)).toHaveText("OVA");
    await expect(seasons.getByRole("link", { name: "Abrir a Temporada 1" })).toHaveAttribute("href", `/anime/${S1}`);

    // Nota em estrelas: dá para avaliar enquanto acompanha; só entra na nota do site quando terminar.
    const score = seasons.getByTestId(`season-score-${S1}`);
    await expect(score).toContainText("Sua nota entra na nota do site quando você terminar a temporada.");
    await expect(seasons.getByTestId(`season-score-value-${S1}`)).toHaveText("Sem nota");
    await score.locator("label", { hasText: "5 estrelas (nota 10)" }).click();
    await expect(seasons.getByTestId(`season-score-value-${S1}`)).toHaveText("Sua nota: 10/10");
    await expect.poll(async () => (await prisma.anime.findUniqueOrThrow({ where: { id: anime1 } })).userScore).toBe(10);
    expect(await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: S1 } })).toMatchObject({ siteScore: 5, siteScoreVotes: 0 });

    // A nota fica guardada depois de recarregar, e dá para trocá-la por outra.
    await page.reload();
    await seasons.getByRole("tab", { name: "Temporada 1" }).click();
    await expect(seasons.getByTestId(`season-score-value-${S1}`)).toHaveText("Sua nota: 10/10");
    await seasons.getByTestId(`season-score-${S1}`).locator("label", { hasText: "1 estrela (nota 2)" }).click();
    await expect(seasons.getByTestId(`season-score-value-${S1}`)).toHaveText("Sua nota: 2/10");
  });

  test("a navegação da franquia lista temporadas, OVA e filmes em ordem e leva à descrição de cada um", async ({ page }) => {
    await page.goto(`/anime/${anime2}`);
    const nav = page.getByTestId("franchise-nav");
    const items = nav.locator("li");
    await expect(items).toHaveCount(4);
    // A linha do tempo é horizontal: os itens se alinham no mesmo topo, da esquerda para a direita, em ordem de estreia.
    const boxes = await items.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; }));
    expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
    expect(boxes.map((b) => b.x)).toEqual([...boxes.map((b) => b.x)].sort((a, b) => a - b));
    expect(new Set(boxes.map((b) => b.x)).size).toBe(4);
    await expect(items.nth(0)).toContainText("Temporada 1");
    await expect(items.nth(1)).toContainText("OVA · opcional");
    await expect(items.nth(1)).toHaveAttribute("data-branch", "true");
    await expect(items.nth(2)).toContainText("Temporada 2");
    await expect(items.nth(2)).toContainText("você está aqui");
    await expect(items.nth(2)).toHaveAttribute("data-current", "true");
    await expect(items.nth(3)).toContainText("Filme · opcional");
    await expect(nav.locator("[aria-current=page]")).toHaveCount(1);

    // O link da temporada 1 abre a descrição dela (a obra que a pessoa já acompanha abre na própria página).
    await nav.getByRole("link", { name: /Temporada 1/ }).click();
    await expect(page).toHaveURL(new RegExp(`/anime/${anime1}$`));
    await expect(page.getByTestId("franchise-nav").locator("li").nth(0)).toContainText("você está aqui");
  });

  test("a faixa horizontal da franquia rola por dentro e não alarga a página, nem no celular", async ({ page }) => {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/anime/${anime2}`);
      const nav = page.getByTestId("franchise-nav");
      await expect(nav).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1); // a página não ganha rolagem horizontal
      const box = await nav.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1); // o quadro cabe na tela
    }
    // No celular os 4 itens (4 × 176 px) não cabem: a faixa rola por dentro.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/anime/${anime2}`);
    const scroller = page.getByTestId("franchise-nav-scroller");
    const [scrollWidth, clientWidth] = await scroller.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("a descrição é um hub: etiquetas no topo, barra de seções que acompanha a rolagem, ficha e 'Sua lista' na lateral", async ({ page }) => {
    await prisma.anime.update({ where: { id: anime2 }, data: { format: "TV", status: "FINISHED", season: "FALL", seasonYear: 2011, episodes: 10 } });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/anime/${anime2}`);
    await waitEpisodesStreamed(page);

    // Etiquetas curtas debaixo do nome; as etiquetas de temporada (que repetiam as abas) não aparecem mais ali.
    await expect(page.getByTestId("work-badges")).toHaveText(/Série \(TV\).*Finalizado.*Outono 2011.*10 episódios/);
    const heroText = await page.getByTestId("work-section-nav").evaluate((nav) => (nav.previousElementSibling as HTMLElement).innerText);
    expect(heroText).not.toMatch(/Temporada \d/);

    // Barra de seções: só as que existem na página, com a rolagem e o destaque da seção.
    const nav = page.getByTestId("work-section-nav");
    await expect(nav.getByTestId("section-link-visao-geral")).toBeVisible();
    await expect(nav.getByTestId("section-link-franquia")).toBeVisible();
    await expect(nav.getByTestId("section-link-episodios")).toBeVisible();
    await expect(nav.getByTestId("section-link-comunidade")).toBeVisible();
    await expect(nav.getByTestId("section-link-trailer")).toHaveCount(0); // a obra não tem trailer
    await expect(nav.getByTestId("section-link-elenco")).toHaveCount(0); // nem elenco
    await nav.getByTestId("section-link-episodios").click();
    await expect(page).toHaveURL(/#episodios$/);
    await expect(nav.getByTestId("section-link-episodios")).toHaveAttribute("aria-current", "true");
    const top = await nav.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(top).toBeGreaterThanOrEqual(80); // fica logo abaixo do cabeçalho enquanto a página rola
    expect(top).toBeLessThanOrEqual(100);

    // Lateral: ficha da obra e o cartão da lista (atualizar, editar, deixar de acompanhar).
    const info = page.getByTestId("work-card-info");
    await expect(info).toContainText("Situação");
    await expect(info).toContainText("Finalizado");
    await expect(info).toContainText("10 episódios");
    await expect(info).toContainText("Temporada 2");
    const mine = page.getByTestId("work-card-list");
    await expect(mine.getByRole("button", { name: /Deixar de acompanhar/ })).toBeVisible();
    await expect(page.getByTestId("work-card-watch")).toContainText("Onde eu assisto");
  });

  test("no celular a descrição cabe na tela e a barra de seções rola por dentro", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/anime/${anime2}`);
    await waitEpisodesStreamed(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("work-section-nav")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("a página pública também tem a barra de seções, a ficha e a lateral", async ({ page }) => {
    await page.context().clearCookies(); // visitante: quem acompanha a obra é levado para a própria página
    await page.goto(`/anime/${S1}`);
    await expect(page.getByTestId("work-section-nav")).toBeVisible();
    await expect(page.getByTestId("work-card-info")).toContainText("Franquia");
    await expect(page.getByTestId("work-card-watch")).toBeVisible();
    await expect(page.getByTestId("my-watch-source-hint")).toBeVisible();
  });

  test("quem não acompanha a obra vê as mesmas abas, sem nota, e os episódios do calendário em linha do tempo", async ({ page, playwright, baseURL }) => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [S1] } } });
    for (const [episode, airingAt] of [[1, "2020-10-01T12:00:00Z"], [2, "2021-05-01T12:00:00Z"]] as const) {
      await prisma.airingScheduleEntry.create({ data: { anilistId: S1, episode, airingAt: new Date(airingAt), titleRomaji: "Linha Round100" } });
    }
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const html = await (await guest.get(`/anime/${S1}`)).text();
    await guest.dispose();
    expect(html).toContain("Temporadas e episódios");
    expect(html).not.toContain("Sua nota:");

    await page.context().clearCookies();
    await page.goto(`/anime/${S1}`);
    await page.getByTestId("episode-toggle").click(); // a lista de episódios vem minimizada
    const line = page.getByTestId("schedule-episodes");
    const nodes = line.locator("li");
    await expect(nodes).toHaveCount(3); // EP01, o OVA de mar/2021 e o EP02 de mai/2021
    await expect(nodes.nth(0)).toContainText("EP01");
    await expect(nodes.nth(1)).toHaveAttribute("data-branch", "true");
    await expect(nodes.nth(2)).toContainText("EP02");
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: S1 } });
  });
});

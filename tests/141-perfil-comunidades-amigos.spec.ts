import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Lote de 28/10: a busca do Feed pequena no topo da lateral; a aba Pausados de Meus Animes; o perfil mais discreto
// (atalhos, ícone de editar no "quem sou eu", "Novo álbum" dentro da grade dos álbuns); Amigos com as pessoas da rede e
// amigos em comum; Comunidades com categorias, ordem e as faixas dos amigos e das obras acompanhadas.
const X = 141001;
const Y = 141002;
const PAUSED = 141101;
const AIRING = 141102;
const DONE = 141103;
const CATEGORY = "Round141Cat";
const base = { passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" };
const EMAILS = ["duda-141@test.local", "eli-141@test.local"];
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

test.describe.serial("Perfil, Meus Animes, Amigos e Comunidades (28/10)", () => {
  let prisma: PrismaClient;
  let userId = "";
  const id: Record<string, string> = {};

  async function clean() {
    await prisma.friendship.deleteMany({ where: { OR: [{ userA: { email: { in: EMAILS } } }, { userB: { email: { in: EMAILS } } }] } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [PAUSED, AIRING, DONE, Y] } } });
    await prisma.community.deleteMany({ where: { franchiseKey: { in: [X, Y] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [X, Y] } } });
    await prisma.genre.deleteMany({ where: { key: CATEGORY } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    await prisma.genre.create({ data: { key: CATEGORY, label: CATEGORY, position: 999 } });
    const work = { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", seasonYear: 2020, timelineOrder: 1 };
    await prisma.catalogEntry.create({ data: { ...work, anilistId: X, franchiseKey: X, titleRomaji: "Categoria Round141", genres: CATEGORY } });
    const y = await prisma.catalogEntry.create({ data: { ...work, anilistId: Y, franchiseKey: Y, titleRomaji: "Acompanhada Round141", genres: "" } });
    id.duda = (await prisma.user.create({ data: { ...base, email: EMAILS[0], displayName: "Duda Round141", handle: "duda_r141" } })).id;
    id.eli = (await prisma.user.create({ data: { ...base, email: EMAILS[1], displayName: "Eli Round141", handle: "eli_r141" } })).id;
    // Eli é amiga da pessoa e da Duda: a Duda vira "1 amigo em comum".
    await prisma.friendship.createMany({ data: [pair(userId, id.eli), pair(id.eli, id.duda)] });
    // A comunidade da obra X tem a Eli (faixa "Dos seus amigos"); a obra Y está na lista da pessoa ("Das obras que você acompanha").
    const community = await prisma.community.create({ data: { franchiseKey: X } });
    await prisma.communityMember.create({ data: { communityId: community.id, userId: id.eli } });
    await prisma.anime.create({ data: { userId, anilistId: Y, catalogEntryId: y.id, titleRomaji: "Acompanhada Round141", genres: "", status: "FINISHED" } });
    // Pausados: só a obra já encerrada que a pessoa não terminou.
    await prisma.anime.create({ data: { userId, anilistId: PAUSED, titleRomaji: "Pausada Round141", genres: "", status: "FINISHED", watchState: "UNFINISHED" } });
    await prisma.anime.create({ data: { userId, anilistId: AIRING, titleRomaji: "No ar Round141", genres: "", status: "RELEASING", watchState: "UNFINISHED" } });
    await prisma.anime.create({ data: { userId, anilistId: DONE, titleRomaji: "Terminada Round141", genres: "", status: "FINISHED", watchState: "FINISHED" } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("Feed: a busca fica pequena, no topo da lateral, e leva à busca", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const search = page.getByRole("search", { name: "Buscar no Feed" });
    const box = await search.boundingBox();
    expect(box?.height ?? 99).toBeLessThan(50);
    expect(box?.x ?? 0).toBeGreaterThan(800); // na coluna da direita
    await search.getByRole("textbox").fill("Round141");
    await search.getByRole("textbox").press("Enter");
    await expect(page).toHaveURL(/\/buscar\?q=Round141&scope=posts$/);
  });

  test("Meus Animes: a aba Pausados mostra só as obras encerradas que a pessoa não terminou", async ({ page }) => {
    await page.goto("/minha-lista");
    await page.getByTestId("tab-paused").click();
    await expect(page).toHaveURL(/\/minha-lista\/pausados$/);
    await expect(page.getByTestId("tab-paused")).toHaveAttribute("aria-selected", "true");
    const list = page.getByTestId("profile-anime-list");
    await list.getByLabel("Buscar animes").fill("Round141");
    await expect(list.getByTestId(`profile-anime-${PAUSED}`)).toBeVisible();
    await expect(list.getByTestId(`profile-anime-${AIRING}`)).toHaveCount(0);
    await expect(list.getByTestId(`profile-anime-${DONE}`)).toHaveCount(0);
    // Marcar "Terminei" tira a obra dos pausados.
    await list.getByTestId(`profile-anime-${PAUSED}`).locator("select").selectOption("FINISHED");
    await expect(list.getByTestId(`profile-anime-${PAUSED}`)).toHaveCount(0);
    await prisma.anime.updateMany({ where: { userId, anilistId: PAUSED }, data: { watchState: "UNFINISHED" } });
  });

  test("perfil: atalhos discretos, só o ícone para editar o quem sou eu e o Novo álbum dentro da grade", async ({ page }) => {
    await page.goto(`/users/${userId}`);
    const edit = page.getByTestId("profile-about-edit");
    await expect(edit).toHaveAttribute("href", "/perfil/editar");
    await expect(edit).toHaveAccessibleName("Editar quem sou eu");
    await expect(edit).toHaveText("");
    await expect(page.getByTestId("profile-albums").getByRole("listitem").filter({ has: page.getByTestId("album-new") })).toHaveCount(1);
    // Os atalhos da dona do perfil são só o ícone, com o nome na dica e para leitores de tela.
    for (const name of ["Nova publicação", "Editar perfil"]) {
      const shortcut = page.getByRole("link", { name, exact: true });
      await expect(shortcut).toHaveText("");
      expect(await shortcut.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    }
    await page.getByRole("link", { name: "Editar perfil", exact: true }).hover();
    await expect(page.getByRole("tooltip")).toHaveText("Editar perfil");
    await expect(page.getByText("só você vê", { exact: true })).toHaveCount(0);
  });

  test("Amigos: as pessoas da rede com amigos em comum, e amigos de amigos nas sugestões", async ({ page }) => {
    await page.goto("/amigos");
    const network = page.getByTestId("network-people");
    await expect(network.getByTestId(`network-${id.duda}`)).toContainText("1 amigo em comum");
    await expect(network.getByTestId(`network-${id.eli}`).getByTestId("friend-remove")).toHaveCount(1);
    await expect(network.getByTestId(`network-${userId}`)).toHaveCount(0);
    await expect(page.getByTestId("friend-suggestions").getByTestId(`suggestion-${id.duda}`)).toContainText("1 amigo em comum");
  });

  test("Comunidades: categorias, ordem e as faixas dos amigos e das obras acompanhadas", async ({ page }) => {
    await page.goto("/comunidades?aba=explorar");
    await expect(page.getByTestId("friends-communities").getByTestId(`directory-${X}`)).toContainText("1 amigo participa");
    await expect(page.getByTestId("tracked-communities").getByTestId(`directory-${Y}`)).toContainText("você acompanha");

    await page.getByTestId(`communities-category-${CATEGORY}`).click();
    await expect(page).toHaveURL(new RegExp(`categoria=${CATEGORY}`));
    const results = page.getByTestId("explore-communities");
    await expect(results.getByTestId(`directory-${X}`)).toContainText("1 membro · 0 tópicos");
    await expect(results.getByTestId(`directory-${Y}`)).toHaveCount(0);
    await expect(page.getByTestId("friends-communities")).toHaveCount(0); // as faixas só sem filtro

    // A ordem mantém a categoria; a busca também.
    await page.getByTestId("communities-sort").getByRole("link", { name: "Mais novas" }).click();
    await expect(page).toHaveURL(new RegExp(`categoria=${CATEGORY}&ordem=novas`));
    await page.getByTestId("communities-search").fill("Round141");
    await page.getByTestId("communities-search-submit").click();
    await expect(page).toHaveURL(new RegExp(`categoria=${CATEGORY}`));
    await expect(page.getByTestId("explore-communities").getByTestId(`directory-${X}`)).toBeVisible();
  });
});

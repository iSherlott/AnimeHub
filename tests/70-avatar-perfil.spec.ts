import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Avatar e banner escolhidos entre as imagens (capa e personagens) das obras acompanhadas + Editar Perfil estilo Crunchyroll.
const A = 970001;
const B = 970002;
// Duas temporadas da mesma obra (mesmo `seriesKey`): no seletor viram um grupo só, sem repetir personagem.
const C1 = 970003;
const C2 = 970004;
const IMG = (name: string) => `https://s4.anilist.co/file/anilistcdn/spec70/${name}.png`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const cast = (names: string[]) => JSON.stringify(names.map((n) => ({ role: "MAIN", name: n, image: IMG(n.toLowerCase().replace(/\W/g, "")), voiceActors: [] })));

test.describe.serial("Avatar de anime e Editar Perfil", () => {
  let prisma: PrismaClient;
  let userId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.anime.deleteMany({ where: { anilistId: { in: [A, B, C1, C2] } } });
    await prisma.anime.create({ data: { userId, anilistId: A, titleRomaji: "Avatar Round70 Alfa", genres: "", coverImage: IMG("capa-a"), bannerImage: IMG("banner-a"), castJson: cast(["Maomao", "Jinshi"]) } });
    await prisma.anime.create({ data: { userId, anilistId: B, titleRomaji: "Avatar Round70 Beta", genres: "", coverImage: IMG("capa-b"), castJson: cast(["Frieren"]) } });
    await prisma.anime.create({ data: { userId, anilistId: C1, titleRomaji: "Avatar Round70 Gama", seriesKey: "avatar round70 gama", seasonNumber: 1, genres: "", coverImage: IMG("capa-g1"), castJson: cast(["Yuji", "Megumi"]) } });
    await prisma.anime.create({
      data: { userId, anilistId: C2, titleRomaji: "Avatar Round70 Gama 2nd Season", seriesKey: "avatar round70 gama", seasonNumber: 2, genres: "", coverImage: IMG("capa-g2"), bannerImage: IMG("banner-g2"), castJson: JSON.stringify([{ role: "MAIN", name: "Yuji", image: IMG("yuji-s2"), voiceActors: [] }, { role: "MAIN", name: "Megumi", image: IMG("megumi"), voiceActors: [] }]) },
    });
  });

  test.afterAll(async () => {
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null, bannerUrl: null, backgroundUrl: null } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [A, B, C1, C2] } } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await page.route(/s4\.anilist\.co\/file\/anilistcdn\/spec70/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  });

  test("a API lista as imagens das obras acompanhadas, agrupadas por obra, e só aceita essas", async ({ request }) => {
    const data = await (await request.get("/api/users/me/avatar")).json();
    const alfa = data.groups.find((g: { anilistId: number }) => g.anilistId === A);
    expect(alfa.avatars.map((i: { label: string }) => i.label)).toEqual(["Capa", "Maomao", "Jinshi"]);
    expect(alfa.banners.map((i: { label: string }) => i.label)).toEqual(["Banner", "Capa"]);

    // URL fora das opções (ou de outro tipo) é recusada.
    expect((await request.patch("/api/users/me/avatar", { data: { kind: "avatar", url: "https://evil.example/x.png" } })).status()).toBe(400);
    expect((await request.patch("/api/users/me/avatar", { data: { kind: "avatar", url: IMG("banner-a") } })).status()).toBe(400); // banner não é opção de avatar
    expect((await request.patch("/api/users/me/avatar", { data: { kind: "outro", url: IMG("maomao") } })).status()).toBe(400);
    expect((await request.patch("/api/users/me/avatar", { data: { kind: "avatar", url: IMG("maomao") } })).status()).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).avatarUrl).toBe(IMG("maomao"));
  });

  test("temporadas da mesma obra viram um grupo só, sem repetir imagem nem personagem; busca e páginas", async ({ request }) => {
    const data = await (await request.get("/api/users/me/avatar")).json();
    const gama = data.groups.filter((g: { titleRomaji: string }) => g.titleRomaji.startsWith("Avatar Round70 Gama"));
    expect(gama).toHaveLength(1);
    // As duas capas (com a temporada) e um Yuji e uma Megumi só — a arte da temporada mais recente.
    expect(gama[0].avatars.map((i: { label: string }) => i.label)).toEqual(["Capa", "Capa · 2ª temporada", "Yuji", "Megumi"]);
    expect(gama[0].avatars.map((i: { url: string }) => i.url)).toContain(IMG("yuji-s2"));
    expect(gama[0].avatars.map((i: { url: string }) => i.url)).not.toContain(IMG("yuji"));
    // Nenhum endereço aparece duas vezes no seletor inteiro.
    const urls = data.groups.flatMap((g: { avatars: Array<{ url: string }> }) => g.avatars.map((i) => i.url));
    expect(new Set(urls).size).toBe(urls.length);

    // Uma página do seletor: busca pelo título, sem acento nem caixa.
    const page = await (await request.get("/api/users/me/avatar?kind=avatar&q=ROUND70%20gama")).json();
    expect(page).toMatchObject({ total: 1, page: 0, pages: 1 });
    expect(page.groups[0].anilistId).toBe(C1);
    const many = await (await request.get("/api/users/me/avatar?kind=avatar&q=round70")).json();
    expect(many.total).toBe(3);
    // O plano de fundo usa as imagens largas (banner) e as capas.
    const bg = await (await request.get("/api/users/me/avatar?kind=background&q=round70")).json();
    expect(bg.groups.find((g: { anilistId: number }) => g.anilistId === A).banners.map((i: { label: string }) => i.label)).toEqual(["Banner", "Capa"]);
  });

  test("Editar Perfil: Seleção de Avatar por obra, escolher e salvar troca o avatar", async ({ page }) => {
    await page.goto("/perfil/editar");
    await expect(page.getByRole("heading", { name: "Editar Perfil" })).toBeVisible();
    await expect(page.getByTestId("profile-edit-save")).toBeDisabled(); // sem mudanças

    await page.getByTestId("edit-avatar").click();
    const dialog = page.getByRole("dialog", { name: "Seleção de Avatar" });
    await expect(dialog).toContainText("Escolha seu avatar! Você pode mudá-lo a qualquer momento.");
    await dialog.getByTestId("avatar-picker-search").fill("Round70");
    await expect(dialog.getByTestId(`avatar-group-${A}`)).toContainText("Avatar Round70 Alfa");
    await expect(dialog.getByTestId(`avatar-group-${B}`).getByTestId("avatar-option")).toHaveCount(2); // capa + 1 personagem
    await expect(dialog.getByTestId("avatar-picker-save")).toBeDisabled();

    await dialog.getByTestId(`avatar-group-${B}`).getByRole("button", { name: "Avatar: Frieren" }).click();
    await dialog.getByTestId("avatar-picker-save").click();
    await expect(dialog).toBeHidden();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).avatarUrl).toBe(IMG("frieren"));
    // O avatar do cabeçalho acompanha sem recarregar (o do editor + o do menu da conta).
    await expect(page.locator(`img[src="${IMG("frieren")}"]`)).toHaveCount(2);
  });

  test("banner: escolhido entre as obras, aparece no perfil e pode ser removido", async ({ page }) => {
    await page.goto("/perfil/editar");
    await page.getByTestId("edit-banner").click();
    const dialog = page.getByRole("dialog", { name: "Seleção de Banner" });
    await dialog.getByTestId("avatar-picker-search").fill("Round70 Alfa");
    await dialog.getByTestId(`avatar-group-${A}`).getByRole("button", { name: "Banner: Banner" }).click();
    await dialog.getByTestId("avatar-picker-save").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("profile-banner")).toHaveAttribute("src", IMG("banner-a"));

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-banner")).toHaveAttribute("src", IMG("banner-a"));
    await expect(page.getByRole("link", { name: "Editar perfil" })).toHaveAttribute("href", "/perfil/editar");

    await page.goto("/perfil/editar");
    await page.getByTestId("edit-banner").click();
    await page.getByTestId("avatar-remove").click();
    await expect(page.getByTestId("profile-banner")).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).bannerUrl).toBeNull();
  });

  test("plano de fundo: escolhido entre as obras, aparece atrás do perfil e pode ser removido", async ({ page, request }) => {
    expect((await request.patch("/api/users/me/avatar", { data: { kind: "background", url: "https://evil.example/x.png" } })).status()).toBe(400);
    await page.goto("/perfil/editar");
    await page.getByTestId("edit-background").click();
    const dialog = page.getByRole("dialog", { name: "Seleção de Plano de Fundo" });
    await dialog.getByTestId("avatar-picker-search").fill("gama");
    await dialog.getByTestId(`avatar-group-${C1}`).getByRole("button", { name: "Plano de fundo: Banner · 2ª temporada" }).click();
    await dialog.getByTestId("avatar-picker-save").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("profile-background-preview")).toHaveAttribute("src", IMG("banner-g2"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).backgroundUrl).toBe(IMG("banner-g2"));

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-background")).toHaveAttribute("style", /banner-g2/);

    // E sai pelo próprio seletor.
    await page.goto("/perfil/editar");
    await page.getByTestId("edit-background").click();
    await page.getByTestId("avatar-remove").click();
    await expect(page.getByTestId("profile-background-preview")).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).backgroundUrl).toBeNull();
  });

  test("Editar Perfil salva nome e bio; remover a foto volta à foto padrão", async ({ page }) => {
    const original = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName;
    await page.goto("/perfil/editar");
    await page.getByLabel("Nome do Perfil").fill("Perfil Round70");
    await page.getByLabel("Quem sou eu (opcional)").fill("Bio escrita no Editar Perfil");
    await page.getByTestId("profile-edit-save").click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}$`));
    await expect(page.getByRole("heading", { name: "Perfil Round70" }).first()).toBeVisible();
    await expect(page.getByText("Bio escrita no Editar Perfil")).toBeVisible();

    await page.goto("/perfil/editar");
    await page.getByTestId("edit-avatar").click();
    await page.getByTestId("avatar-remove").click();
    await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).avatarUrl).toBeNull();
    await page.goto(`/users/${userId}`);
    await expect(page.locator('img[src="/avatar-padrao.svg"]').first()).toBeVisible();
    await prisma.user.update({ where: { id: userId }, data: { displayName: original, bio: null } });
  });

  test("sem animes acompanhados com imagem, o seletor orienta a acompanhar", async ({ page }) => {
    await prisma.anime.deleteMany({ where: { userId, anilistId: { in: [A, B] } } });
    // As demais obras do usuário de teste não têm imagem salva: só sobra a orientação.
    const withImages = await prisma.anime.count({ where: { userId, OR: [{ coverImage: { not: null } }, { bannerImage: { not: null } }, { castJson: { not: null } }] } });
    await page.goto("/perfil/editar");
    await page.getByTestId("edit-avatar").click();
    if (withImages === 0) await expect(page.getByTestId("avatar-picker-empty")).toContainText("Acompanhe um anime");
    else await expect(page.getByTestId("avatar-picker-list")).toBeVisible();
  });
});

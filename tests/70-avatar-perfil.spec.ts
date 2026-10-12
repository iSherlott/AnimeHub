import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Avatar e banner escolhidos entre as imagens (capa e personagens) das obras acompanhadas + Editar Perfil estilo Crunchyroll.
const A = 970001;
const B = 970002;
const IMG = (name: string) => `https://s4.anilist.co/file/anilistcdn/spec70/${name}.png`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const cast = (names: string[]) => JSON.stringify(names.map((n) => ({ role: "MAIN", name: n, image: IMG(n.toLowerCase().replace(/\W/g, "")), voiceActors: [] })));

test.describe.serial("Avatar de anime e Editar Perfil", () => {
  let prisma: PrismaClient;
  let userId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.anime.deleteMany({ where: { anilistId: { in: [A, B] } } });
    await prisma.anime.create({ data: { userId, anilistId: A, titleRomaji: "Avatar Round70 Alfa", genres: "", coverImage: IMG("capa-a"), bannerImage: IMG("banner-a"), castJson: cast(["Maomao", "Jinshi"]) } });
    await prisma.anime.create({ data: { userId, anilistId: B, titleRomaji: "Avatar Round70 Beta", genres: "", coverImage: IMG("capa-b"), castJson: cast(["Frieren"]) } });
  });

  test.afterAll(async () => {
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null, bannerUrl: null } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [A, B] } } });
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

  test("Editar Perfil: Seleção de Avatar por obra, escolher e salvar troca o avatar", async ({ page }) => {
    await page.goto("/perfil/editar");
    await expect(page.getByRole("heading", { name: "Editar Perfil" })).toBeVisible();
    await expect(page.getByTestId("profile-edit-save")).toBeDisabled(); // sem mudanças

    await page.getByTestId("edit-avatar").click();
    const dialog = page.getByRole("dialog", { name: "Seleção de Avatar" });
    await expect(dialog).toContainText("Escolha seu avatar! Você pode mudá-lo a qualquer momento.");
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

  test("Editar Perfil salva nome e bio; remover a foto volta às iniciais", async ({ page }) => {
    const original = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName;
    await page.goto("/perfil/editar");
    await page.getByLabel("Nome do Perfil").fill("Perfil Round70");
    await page.getByLabel("Bio (opcional)").fill("Bio escrita no Editar Perfil");
    await page.getByTestId("profile-edit-save").click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}$`));
    await expect(page.getByRole("heading", { name: "Perfil Round70" }).first()).toBeVisible();
    await expect(page.getByText("Bio escrita no Editar Perfil")).toBeVisible();

    await page.goto("/perfil/editar");
    await page.getByTestId("edit-avatar").click();
    await page.getByTestId("avatar-remove").click();
    await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).avatarUrl).toBeNull();
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

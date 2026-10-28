import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Álbuns do perfil (coletâneas de animes, sem fotos): automáticos pelo andamento (Assistindo, Terminei, Não terminei,
// Dropei) e os que a pessoa monta com obras da própria lista; seguem "Mostrar meus animes". E o avatar só de anime: sem
// envio de foto própria, e a migração que devolve às iniciais quem tinha foto enviada.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const BASE = 130000;
const WORKS = [
  { n: 1, title: "Round130 Um", watchState: "WATCHING" },
  { n: 2, title: "Round130 Dois", watchState: "FINISHED" },
  { n: 3, title: "Round130 Tres", watchState: "UNFINISHED" },
  { n: 4, title: "Round130 Quatro", watchState: "DROPPED" },
];

test.describe.serial("Álbuns e avatar só de anime", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let albumId = "";
  const animeIds: Record<number, string> = {};

  async function clean() {
    await prisma.profileAlbum.deleteMany({ where: { userId: { in: [userId, adminId] } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [...WORKS.map((w) => BASE + w.n), BASE + 9] } } });
    await prisma.user.update({ where: { id: userId }, data: { animeListPublic: true } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();
    for (const w of WORKS) {
      animeIds[w.n] = (await prisma.anime.create({ data: { userId, anilistId: BASE + w.n, titleRomaji: w.title, genres: "", seriesKey: w.title.toLowerCase(), watchState: w.watchState } })).id;
    }
    // Obra da lista de outra pessoa (não pode entrar no álbum de ninguém mais).
    animeIds[9] = (await prisma.anime.create({ data: { userId: adminId, anilistId: BASE + 9, titleRomaji: "Round130 Do Admin", genres: "", seriesKey: "round130 do admin" } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("álbuns automáticos pelo andamento", async ({ page }) => {
    await page.goto(`/users/${userId}`);
    const section = page.getByTestId("profile-albums");
    for (const key of ["assistindo", "terminei", "nao-terminei", "dropei"]) await expect(section.getByTestId(`album-${key}`)).toBeVisible();
    await expect(page.getByTestId("profile-menu")).toContainText("Animes");
    await expect(section.getByTestId("tab-albums")).toHaveAttribute("aria-selected", "true");

    await section.getByTestId("album-terminei").getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}/albuns/terminei$`));
    await expect(page.getByRole("heading", { name: "Terminei" })).toBeVisible();
    await expect(page.getByTestId("album-works")).toContainText("Round130 Dois");
    await expect(page.getByTestId("album-works")).not.toContainText("Round130 Quatro");
    await expect(page.getByTestId("album-editor")).toHaveCount(0);
    await page.goto(`/users/${userId}/albuns/dropei`);
    await expect(page.getByTestId("album-works")).toContainText("Round130 Quatro");
  });

  test("montar um álbum: criar, colocar, tirar, renomear", async ({ page }) => {
    await page.goto(`/users/${userId}`);
    await page.getByTestId("album-new").click();
    await page.getByTestId("album-name").fill("Para maratonar 130");
    await page.getByTestId("album-description").fill("Os que recomendo.");
    await page.getByTestId("album-save").click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}/albuns/[a-z0-9]+$`));
    albumId = page.url().split("/").pop() as string;
    await expect(page.getByRole("heading", { name: "Para maratonar 130" })).toBeVisible();

    await page.getByTestId("album-search").fill("round130 dois");
    await page.getByTestId(`album-add-${BASE + 2}`).click();
    await expect(page.getByTestId(`album-work-${BASE + 2}`)).toBeVisible();
    await page.getByTestId("album-search").fill("round130 tres");
    await page.getByTestId(`album-add-${BASE + 3}`).click();
    await expect(page.getByTestId("album-works")).toContainText("animes (2)");
    await page.getByTestId(`album-remove-${BASE + 3}`).click();
    await expect(page.getByTestId("album-works")).toContainText("animes (1)");

    await page.getByTestId("album-edit").click();
    await page.getByTestId("album-name").fill("Maratona 130");
    await page.getByTestId("album-save").click();
    await expect(page.getByRole("heading", { name: "Maratona 130" })).toBeVisible();

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId(`album-${albumId}`)).toContainText("Maratona 130");
    await expect(page.getByTestId(`album-${albumId}`)).toContainText("1 anime");
  });

  test("regras: só obras da própria lista, só o dono mexe, nome válido", async ({ browser, request }) => {
    expect((await request.put(`/api/albums/${albumId}/items`, { data: { animeId: animeIds[9] } })).status()).toBe(400);
    expect((await request.post("/api/albums", { data: { name: "Terminei" } })).status()).toBe(400);
    expect((await request.post("/api/albums", { data: { name: "   " } })).status()).toBe(400);
    const admin = await browser.newContext({ storageState: adminState });
    expect((await admin.request.patch(`/api/albums/${albumId}`, { data: { name: "Invadido" } })).status()).toBe(403);
    expect((await admin.request.put(`/api/albums/${albumId}/items`, { data: { animeId: animeIds[9] } })).status()).toBe(403);
    await admin.close();
    // Tirar a obra da lista tira do álbum.
    await prisma.anime.delete({ where: { id: animeIds[2] } });
    expect(await prisma.profileAlbumItem.count({ where: { albumId } })).toBe(0);
    animeIds[2] = (await prisma.anime.create({ data: { userId, anilistId: BASE + 2, titleRomaji: "Round130 Dois", genres: "", seriesKey: "round130 dois", watchState: "FINISHED" } })).id;
    expect((await request.put(`/api/albums/${albumId}/items`, { data: { animeId: animeIds[2] } })).status()).toBe(200);
  });

  test("visitante vê só leitura; com 'Mostrar meus animes' desligado, os álbuns somem", async ({ browser, page }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${userId}/albuns/${albumId}`);
    await expect(adminPage.getByTestId("album-works")).toContainText("Round130 Dois");
    await expect(adminPage.getByTestId("album-editor")).toHaveCount(0);
    await expect(adminPage.getByTestId(`album-remove-${BASE + 2}`)).toHaveCount(0);

    await prisma.user.update({ where: { id: userId }, data: { animeListPublic: false } });
    const hidden = await adminPage.goto(`/users/${userId}/albuns/${albumId}`);
    expect(hidden?.status()).toBe(404);
    await adminPage.goto(`/users/${userId}`);
    await expect(adminPage.getByTestId("profile-albums")).toHaveCount(0);
    await admin.close();

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-albums")).toBeVisible();
    await prisma.user.update({ where: { id: userId }, data: { animeListPublic: true } });

    page.on("dialog", (d) => void d.accept());
    await page.goto(`/users/${userId}/albuns/${albumId}`);
    await page.getByTestId("album-delete").click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}#albuns$`));
    expect(await prisma.profileAlbum.count({ where: { id: albumId } })).toBe(0);
  });

  test("avatar só de anime: sem 'Enviar minha própria foto'; a migração volta às iniciais quem tinha foto enviada", async ({ page }) => {
    await page.goto("/perfil/editar");
    await page.getByTestId("edit-avatar").click();
    await expect(page.getByTestId("avatar-upload")).toHaveCount(0);

    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261115110000_avatar_from_anime_only/migration.sql"), "utf8");
    const update = sql.slice(sql.indexOf("UPDATE"));
    const ROLLBACK = new Error("rollback");
    await prisma
      .$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { avatarUrl: "http://localhost:3100/api/uploads/avatars/2026-10/abc.webp" } });
        await tx.user.update({ where: { id: adminId }, data: { avatarUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg" } });
        await tx.$executeRawUnsafe(update);
        expect((await tx.user.findUniqueOrThrow({ where: { id: userId } })).avatarUrl).toBeNull();
        expect((await tx.user.findUniqueOrThrow({ where: { id: adminId } })).avatarUrl).toContain("anilistcdn");
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});

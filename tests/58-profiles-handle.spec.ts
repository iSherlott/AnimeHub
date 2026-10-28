import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// F11 (PROF-001/002/004; Figma 13:43571): @identificador único, edição de
// nome/identificador, atalhos no perfil próprio e "Discussões iniciadas".
const SUFFIX = Date.now().toString(36).slice(-6);
const HANDLE = `perfil_${SUFFIX}`;

test.describe("Perfil: nome, @identificador e discussões", () => {
  let prisma: PrismaClient;
  let originalName = "";
  let userId = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    userId = user.id;
    originalName = user.displayName;
  });

  test.afterAll(async () => {
    await prisma.user.update({ where: { id: userId }, data: { handle: null, displayName: originalName } });
    await prisma.$disconnect();
  });

  test("API: o @ é fixo para a pessoa; só o administrador define, valida, salva em minúsculas e recusa duplicado (409)", async ({ request, playwright, baseURL }) => {
    // A própria pessoa não troca o @ (nem para um valor válido).
    expect((await request.patch("/api/users/me", { data: { handle: HANDLE } })).status()).toBe(403);
    expect((await request.patch("/api/users/me", { data: { displayName: "   " } })).status()).toBe(400);
    expect((await request.patch("/api/users/me", { data: {} })).status()).toBe(400);

    const admin = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    try {
      for (const bad of ["ab", "com espaço", "joão", "admin", "x".repeat(21)]) {
        expect((await admin.patch(`/api/admin/users/${userId}`, { data: { handle: bad } })).status()).toBe(400);
      }
      const ok = await admin.patch(`/api/admin/users/${userId}`, { data: { handle: `@${HANDLE.toUpperCase()}` } });
      expect(ok.status()).toBe(200);
      expect((await ok.json()).handle).toBe(HANDLE);
      // Outra conta com o mesmo @.
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
      expect((await admin.patch(`/api/admin/users/${adminId}`, { data: { handle: HANDLE } })).status()).toBe(409);
      // Quem não é administrador não define o @ de ninguém.
      expect((await request.patch(`/api/admin/users/${userId}`, { data: { handle: `${HANDLE}z` } })).status()).toBe(403);
    } finally {
      await admin.dispose();
    }

    // a bio continua independente
    const bioOnly = await request.patch("/api/users/me", { data: { bio: "olá" } });
    expect((await bioOnly.json()).handle).toBe(HANDLE);
    await request.patch("/api/users/me", { data: { bio: "" } });
  });

  test("perfil próprio: @identificador, editar perfil, atalhos e Discussões iniciadas", async ({ page, request }) => {
    await prisma.user.update({ where: { id: userId }, data: { handle: HANDLE } });
    const plain = await request.post("/api/posts", { data: { body: `Sem obra ${SUFFIX}` } });
    const about = await request.post("/api/posts", { data: { body: `Com obra ${SUFFIX}`, anilistId: 907000 } });
    const ids = [(await plain.json()).post.id, about.status() === 201 ? (await about.json()).post.id : null];

    try {
      await page.goto(`/users/${userId}`);
      await expect(page.getByTestId("profile-handle")).toHaveText(`@${HANDLE}`);
      await expect(page.getByRole("link", { name: "Minha Lista privada" })).toHaveAttribute("href", "/minha-lista");
      await expect(page.getByRole("link", { name: "Nova publicação" })).toBeVisible();

      await page.getByRole("tab", { name: "Discussões iniciadas" }).click();
      await expect(page.getByText(`Sem obra ${SUFFIX}`)).toHaveCount(0);
      if (about.status() === 201) await expect(page.getByText(`Com obra ${SUFFIX}`)).toBeVisible();

      // Editar Perfil (estilo Crunchyroll): página própria; o @ aparece fixo, sem campo para trocar.
      await page.getByTestId("profile-edit-open").click();
      await expect(page).toHaveURL(/\/perfil\/editar$/);
      await expect(page.getByRole("heading", { name: "Editar Perfil" })).toBeVisible();
      await expect(page.getByTestId("profile-handle-fixed")).toContainText(`@${HANDLE}`);
      await expect(page.getByTestId("profile-handle-fixed").getByRole("textbox")).toHaveCount(0);
      await page.getByLabel("Nome do Perfil").fill("Perfil Round58");
      await page.getByTestId("profile-edit-save").click();
      await expect(page).toHaveURL(new RegExp(`/users/${userId}$`));
      await expect(page.getByTestId("profile-handle")).toHaveText(`@${HANDLE}`);
    } finally {
      for (const id of ids) if (id) await request.delete(`/api/posts/${id}`);
    }
  });

  test("perfil de outra pessoa não mostra atalhos de edição; busca encontra por @identificador", async ({ page, request }) => {
    await prisma.user.update({ where: { id: userId }, data: { handle: HANDLE } });
    const found = await (await request.get(`/api/search?q=${HANDLE}&scope=profiles`)).json();
    expect(found.profiles.map((p: { id: string }) => p.id)).toContain(userId);

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } });
    await page.goto(`/users/${admin.id}`);
    await expect(page.getByTestId("profile-edit-open")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Minha Lista privada" })).toHaveCount(0);
  });
});

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Conta própria do spec (criada pelo admin, como toda conta; a pessoa troca a senha provisória por esta).
const LOGIN_EMAIL = `destino-${Date.now()}@spec48.test.local`;
const LOGIN_PASSWORD = "senha-do-spec-48";

test.beforeAll(async ({ playwright, baseURL }) => {
  const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` } });
  const created = await (await admin.post("/api/admin/users", { data: { email: LOGIN_EMAIL, displayName: "Spec 48", handle: `spec48_${Date.now() % 1_000_000}` } })).json();
  await admin.dispose();
  const person = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await person.post("/api/auth/login", { data: { email: LOGIN_EMAIL, password: created.temporaryPassword } })).status()).toBe(200);
  expect((await person.post("/api/auth/password", { data: { currentPassword: created.temporaryPassword, newPassword: LOGIN_PASSWORD } })).status()).toBe(200);
  await person.dispose();
});

test.afterAll(async () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  await prisma.user.deleteMany({ where: { email: LOGIN_EMAIL } });
  await prisma.$disconnect();
});

// F3: destino pós-login (D-04) e validação do login. Roda sem sessão. (O cadastro aberto deixou de existir: as contas são
// criadas pelo administrador — ver 06-admin-contas.spec.ts.)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login: corpo inválido", () => {
  test("corpo JSON nulo devolve 400", async ({ request }) => {
    const res = await request.post("/api/auth/login", { headers: { "Content-Type": "application/json" }, data: "null" });
    expect(res.status()).toBe(400);
  });
});

test.describe("Destino pós-login", () => {
  test("login com ?next= volta ao destino de origem", async ({ page }) => {
    await page.goto("/login?next=%2Fcalendar");
    await page.getByLabel("E-mail").fill(LOGIN_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
  });

  test("?next= externo ou malicioso é ignorado e cai na home", async ({ page }) => {
    await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fphish");
    await page.getByLabel("E-mail").fill(LOGIN_EMAIL);
    await page.getByLabel("Senha", { exact: true }).fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 20_000 });
  });

  test("os pontos de entrada 'Entrar' levam o caminho atual em ?next=", async ({ page }) => {
    // Página só de quem tem conta: o visitante vai direto ao login, que devolve a pessoa a ela depois.
    await page.goto("/minha-lista");
    await expect(page).toHaveURL(/\/login\?next=%2Fminha-lista$/);

    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: "Entrar" }).first()).toHaveAttribute(
      "href",
      "/login?next=%2Fcalendar"
    );
  });
});

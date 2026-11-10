import { test, expect, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Pedido de 10/11: em vez de ditar a senha provisória, o admin manda um link de uso único (WhatsApp) e a pessoa define a
// senha dela. Sem e-mail, e o sistema continua fechado: só o admin gera o link.
const DOMAIN = "link145.test.local";
const adminHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

async function anonymousContext(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: test.info().project.use.baseURL });
}

test.describe.serial("Link de uso único para definir a senha", () => {
  let prisma: PrismaClient;
  const email = `pessoa-${Date.now()}@${DOMAIN}`;
  let link = "";
  let temporaryPassword = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
    await prisma.$disconnect();
  });

  test("criar a conta devolve o link (e a provisória, para quem preferir ditar); no banco só fica o hash", async ({ request }) => {
    const res = await request.post("/api/admin/users", { headers: adminHeaders, data: { email, displayName: "Pessoa Link 145", handle: "pessoa_link145" } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    link = body.passwordLink;
    temporaryPassword = body.temporaryPassword;
    expect(link).toMatch(/^\/definir-senha\?codigo=[A-Za-z0-9_-]{43}$/);
    const code = link.split("=")[1];
    const stored = await prisma.passwordLink.findFirstOrThrow({ where: { user: { email } } });
    expect(stored.tokenHash).not.toContain(code);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(47 * 3600 * 1000);
  });

  test("o painel mostra o link para copiar", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    await page.goto("/admin/acesso");
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Pessoa Painel 145");
    await page.getByTestId("new-account-handle").fill("painel145");
    await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(`painel-${Date.now()}@${DOMAIN}`);
    await page.getByRole("button", { name: "Criar conta" }).click();
    const dialog = page.getByRole("dialog", { name: "Conta criada" });
    await expect(dialog.getByTestId("password-link")).toHaveText(/\/definir-senha\?codigo=[A-Za-z0-9_-]{43}$/);
    await expect(dialog.getByRole("button", { name: "Copiar link" })).toBeVisible();
    await expect(dialog.getByText("Vale uma vez só, por 48 horas.", { exact: false })).toBeVisible();
    await context.close();
  });

  test("pelo link, a pessoa define a senha e já entra; a provisória deixa de valer e o link não serve de novo", async ({ browser }) => {
    const context = await anonymousContext(browser);
    const page = await context.newPage();
    await page.goto(link);
    await expect(page.getByText("Olá, Pessoa Link 145!", { exact: false })).toBeVisible();
    await page.getByLabel("Nova senha", { exact: true }).fill("minha-senha-145");
    await page.getByLabel("Confirme a nova senha").fill("minha-senha-145");
    await page.getByRole("button", { name: "Salvar e entrar" }).click();
    await expect(page).not.toHaveURL(/definir-senha/);
    expect((await context.request.get("/api/auth/me")).status()).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ mustChangePassword: false });

    const other = await anonymousContext(browser);
    expect((await other.request.post("/api/auth/login", { data: { email, password: temporaryPassword } })).status()).toBe(401);
    expect((await other.request.post("/api/auth/login", { data: { email, password: "minha-senha-145" } })).status()).toBe(200);
    const again = await other.request.post("/api/auth/password-link", { data: { codigo: link.split("=")[1], password: "outra-senha-145" } });
    expect(again.status()).toBe(410);
    const otherPage = await other.newPage();
    await otherPage.goto(link);
    await expect(otherPage.getByTestId("password-link-invalid")).toContainText("já foi usado");
    await context.close();
    await other.close();
  });

  test("esqueceu a senha: o admin gera um link novo, e só o último vale", async ({ request, browser }) => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email } });
    const first = (await (await request.post(`/api/admin/users/${target.id}/reset-password`, { headers: adminHeaders })).json()).passwordLink as string;
    const second = (await (await request.post(`/api/admin/users/${target.id}/reset-password`, { headers: adminHeaders })).json()).passwordLink as string;
    expect(first).not.toBe(second);
    const context = await anonymousContext(browser);
    expect((await context.request.get(`/api/auth/password-link?codigo=${first.split("=")[1]}`)).status()).toBe(410);
    expect((await context.request.get(`/api/auth/password-link?codigo=${second.split("=")[1]}`)).status()).toBe(200);
    // Senha curta não gasta o link.
    expect((await context.request.post("/api/auth/password-link", { data: { codigo: second.split("=")[1], password: "curta" } })).status()).toBe(400);
    expect((await context.request.post("/api/auth/password-link", { data: { codigo: second.split("=")[1], password: "de-novo-145" } })).status()).toBe(200);
    await context.close();
  });

  test("link inventado ou vencido não abre nada", async ({ browser }) => {
    const context = await anonymousContext(browser);
    expect((await context.request.get("/api/auth/password-link?codigo=nada")).status()).toBe(410);
    expect((await context.request.post("/api/auth/password-link", { data: { codigo: "A".repeat(43), password: "qualquer-145" } })).status()).toBe(410);
    const target = await prisma.user.findUniqueOrThrow({ where: { email } });
    const res = await context.request.post(`/api/admin/users/${target.id}/reset-password`, { headers: adminHeaders });
    const code = ((await res.json()).passwordLink as string).split("=")[1];
    await prisma.passwordLink.updateMany({ where: { userId: target.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const page = await context.newPage();
    await page.goto(`/definir-senha?codigo=${code}`);
    await expect(page.getByTestId("password-link-invalid")).toContainText("venceu");
    await context.close();
  });
});

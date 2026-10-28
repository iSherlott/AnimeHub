import { test, expect, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Sistema fechado: não existe cadastro aberto nem convite. Só o administrador cria contas — sempre como membro, mesmo
// que alguém tente mandar um papel junto — com uma senha provisória mostrada uma única vez. No primeiro login a pessoa
// troca a senha; até lá nada abre (nem as APIs). Uma conta nova nunca alcança a área de administração.
const DOMAIN = "contas06.test.local";
const NEW_PASSWORD = "nova-senha-06";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const adminHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };
const anonymous = { cookies: [], origins: [] };

async function freshContext(browser: Browser) {
  return browser.newContext({ storageState: anonymous, baseURL: test.info().project.use.baseURL });
}

test.describe.serial("Contas criadas só pelo administrador", () => {
  let prisma: PrismaClient;
  const email = `pessoa-${Date.now()}@${DOMAIN}`;
  let temporaryPassword = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
    await prisma.$disconnect();
  });

  test("não existe cadastro aberto: /signup leva ao login e as rotas de cadastro e convite sumiram", async ({ browser }) => {
    const context = await freshContext(browser);
    const page = await context.newPage();
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/as contas são criadas pela administração/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar conta" })).toHaveCount(0);
    const signup = await context.request.post("/api/auth/signup", { data: { email: `aberto@${DOMAIN}`, password: "password123", displayName: "Aberto" } });
    expect(signup.status()).toBe(404);
    const invite = await context.request.post("/api/admin/invites", { headers: adminHeaders });
    expect(invite.status()).toBe(404);
    expect(await prisma.user.count({ where: { email: `aberto@${DOMAIN}` } })).toBe(0);
    await context.close();
  });

  test("só o administrador cria conta: visitante recebe 401 e membro recebe 403", async ({ browser, request }) => {
    const context = await freshContext(browser);
    expect((await context.request.post("/api/admin/users", { data: { email: `x@${DOMAIN}`, displayName: "X" } })).status()).toBe(401);
    await context.close();
    // A sessão padrão da suíte é de um membro comum.
    expect((await request.post("/api/admin/users", { data: { email: `y@${DOMAIN}`, displayName: "Y" } })).status()).toBe(403);
    expect(await prisma.user.count({ where: { email: { endsWith: `@${DOMAIN}` } } })).toBe(0);
  });

  test("a conta nasce membro, com senha provisória, mesmo que o pedido traga outro papel", async ({ request }) => {
    const res = await request.post("/api/admin/users", { headers: adminHeaders, data: { email, displayName: "Pessoa Nova 06", role: "ADMIN", mustChangePassword: false } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    temporaryPassword = body.temporaryPassword;
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(body.user).toMatchObject({ email, role: "MEMBER", mustChangePassword: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ role: "MEMBER", mustChangePassword: true });
    // E-mail repetido e dados inválidos não criam nada.
    expect((await request.post("/api/admin/users", { headers: adminHeaders, data: { email, displayName: "De Novo" } })).status()).toBe(409);
    expect((await request.post("/api/admin/users", { headers: adminHeaders, data: { email: "sem-arroba", displayName: "X" } })).status()).toBe(400);
    expect((await request.post("/api/admin/users", { headers: adminHeaders, data: { email: `z@${DOMAIN}`, displayName: " " } })).status()).toBe(400);
  });

  test("primeiro login: a senha provisória só deixa trocar a senha; nada mais abre, nem a administração", async ({ browser }) => {
    const context = await freshContext(browser);
    const page = await context.newPage();
    await page.goto("/login?next=%2Fminha-lista");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(temporaryPassword);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/trocar-senha\?next=%2Fminha-lista$/);
    await expect(page.getByRole("heading", { name: "Crie sua senha" })).toBeVisible();

    // Até trocar: as APIs recusam, a administração não existe e qualquer página volta para a troca de senha.
    const blocked = await context.request.get("/api/my-list");
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await context.request.get("/api/admin/users")).status()).toBe(403);
    expect((await page.goto("/admin"))?.status()).toBe(404);
    await page.goto("/discover");
    await expect(page).toHaveURL(/\/trocar-senha/);

    // Senha atual errada e confirmação diferente não trocam nada.
    await page.getByLabel("Senha provisória").fill("errada-errada");
    await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirme a nova senha").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(page.getByText("A senha atual não confere.")).toBeVisible();
    await page.getByLabel("Senha provisória").fill(temporaryPassword);
    await page.getByLabel("Confirme a nova senha").fill("outra-coisa-06");
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(page.getByText("A confirmação não é igual à nova senha.")).toBeVisible();

    await page.getByLabel("Confirme a nova senha").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(page).toHaveURL(/\/discover$/);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ mustChangePassword: false, role: "MEMBER" });

    // Agora usa o site como membro — e continua sem administração.
    expect((await context.request.get("/api/my-list")).status()).toBe(200);
    expect((await context.request.get("/api/admin/users")).status()).toBe(403);
    expect((await context.request.patch(`/api/admin/users/${(await prisma.user.findUniqueOrThrow({ where: { email } })).id}`, { data: { role: "ADMIN" } })).status()).toBe(403);
    for (const path of ["/admin", "/admin/acesso", "/admin/obras"]) expect((await page.goto(path))?.status(), path).toBe(404);
    await context.close();
  });

  test("a senha provisória deixa de valer; a nova entra direto", async ({ browser }) => {
    const context = await freshContext(browser);
    expect((await context.request.post("/api/auth/login", { data: { email, password: temporaryPassword } })).status()).toBe(401);
    const ok = await context.request.post("/api/auth/login", { data: { email, password: NEW_PASSWORD } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).user).toMatchObject({ mustChangePassword: false });
    await context.close();
  });

  test("senha redefinida pelo admin volta a ser provisória", async ({ request }) => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email } });
    const res = await request.post(`/api/admin/users/${target.id}/reset-password`, { headers: adminHeaders });
    expect(res.status()).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ mustChangePassword: true });
  });

  test.describe("pelo painel", () => {
    test.use({ storageState: adminState });

    test("Administração → Acesso cria a conta e mostra a senha provisória uma vez", async ({ page }) => {
      await page.goto("/admin/acesso");
      await expect(page.getByRole("heading", { name: "Acesso e moderação" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Gerar convite/ })).toHaveCount(0);
      const panelEmail = `painel-${Date.now()}@${DOMAIN}`;
      await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Pelo Painel 06");
      await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(panelEmail);
      await page.getByRole("button", { name: "Criar conta" }).click();
      const dialog = page.getByRole("dialog", { name: "Conta criada" });
      await expect(dialog).toContainText(panelEmail);
      await expect(dialog.getByTestId("temporary-password")).toHaveText(/^[A-Za-z0-9]{12}$/);
      await dialog.getByRole("button", { name: "Fechar" }).click();
      const row = page.getByRole("row", { name: /Pelo Painel 06/ });
      await expect(row).toContainText("senha provisória");
      await expect(page.getByTestId(`user-role-${(await prisma.user.findUniqueOrThrow({ where: { email: panelEmail } })).id}`)).toHaveValue("MEMBER");
    });

    test("lista os usuários existentes", async ({ request }) => {
      const res = await request.get("/api/admin/users");
      expect(res.status()).toBe(200);
      const emails = (await res.json()).users.map((u: { email: string }) => u.email);
      expect(emails).toContain("e2e@test.local");
      expect(emails).toContain("e2e-admin@test.local");
    });
  });
});

test.describe("Não-administrador — acesso negado", () => {
  test("GET /api/admin/users retorna 403", async ({ request }) => {
    expect((await request.get("/api/admin/users")).status()).toBe(403);
  });

  test("toda a área /admin retorna 404 pra quem não é administrador", async ({ page }) => {
    for (const path of ["/admin", "/admin/acesso", "/admin/jobs", "/admin/importacoes"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });
});

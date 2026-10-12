import { test, expect, type APIRequestContext } from "@playwright/test";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// F3: destino pós-login (D-04), cadastro sem enumeração de contas (GAP-S-03)
// e limites de tamanho. Roda sem sessão; convites são gerados como admin.
test.use({ storageState: { cookies: [], origins: [] } });

async function newInvite(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/admin/invites", {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
  });
  return (await res.json()).invite.code as string;
}

test.describe("Cadastro: sem enumeração e com limites", () => {
  test("convite inválido responde igual para e-mail novo e e-mail já cadastrado", async ({ request }) => {
    const base = { password: "password123", displayName: "Alguém", inviteCode: "codigo-que-nao-existe" };
    const fresh = await request.post("/api/auth/signup", { data: { ...base, email: `novo-${Date.now()}@test.local` } });
    const existing = await request.post("/api/auth/signup", { data: { ...base, email: TEST_USER_EMAIL } });

    expect(existing.status()).toBe(fresh.status());
    expect(await existing.json()).toEqual(await fresh.json());
  });

  test("e-mail já cadastrado com convite válido não revela que a conta existe", async ({ request }) => {
    const invite = await newInvite(request);
    const res = await request.post("/api/auth/signup", {
      data: { email: TEST_USER_EMAIL, password: "password123", displayName: "Duplicado", inviteCode: invite },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/já existe uma conta com esse e-mail/i);

    // O convite NÃO foi consumido pela tentativa fracassada (transação desfeita).
    const ok = await request.post("/api/auth/signup", {
      data: { email: `reuso-${Date.now()}@test.local`, password: "password123", displayName: "Reuso", inviteCode: invite },
    });
    expect(ok.status()).toBe(201);
  });

  test("rejeita nome e e-mail longos demais", async ({ request }) => {
    const invite = await newInvite(request);
    const longName = await request.post("/api/auth/signup", {
      data: { email: `nome-${Date.now()}@test.local`, password: "password123", displayName: "x".repeat(61), inviteCode: invite },
    });
    expect(longName.status()).toBe(400);

    const longEmail = await request.post("/api/auth/signup", {
      data: { email: `${"a".repeat(250)}@test.local`, password: "password123", displayName: "Ok", inviteCode: invite },
    });
    expect(longEmail.status()).toBe(400);
  });

  test("corpo JSON nulo devolve 400 em login e cadastro", async ({ request }) => {
    for (const url of ["/api/auth/login", "/api/auth/signup"]) {
      const res = await request.post(url, { headers: { "Content-Type": "application/json" }, data: "null" });
      expect(res.status()).toBe(400);
    }
  });
});

test.describe("Destino pós-login", () => {
  test("cadastro com ?next= volta ao destino de origem", async ({ page, request }) => {
    const invite = await newInvite(request);
    await page.goto("/signup?next=%2Fcalendar");
    await page.getByLabel("Código de convite").fill(invite);
    await page.getByLabel("Nome de exibição").fill("Volta ao Destino");
    await page.getByLabel("E-mail").fill(`destino-${Date.now()}@test.local`);
    await page.getByLabel(/^Senha/).fill("password123");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page).toHaveURL(/\/calendar$/);
  });

  test("?next= externo ou malicioso é ignorado e cai na home", async ({ page, request }) => {
    const invite = await newInvite(request);
    await page.goto("/signup?next=https%3A%2F%2Fevil.example%2Fphish");
    await page.getByLabel("Código de convite").fill(invite);
    await page.getByLabel("Nome de exibição").fill("Sem Open Redirect");
    await page.getByLabel("E-mail").fill(`seguro-${Date.now()}@test.local`);
    await page.getByLabel(/^Senha/).fill("password123");
    await page.getByRole("button", { name: "Criar conta" }).click();
    // Criar conta gasta scrypt + sessão: com a máquina carregada passa dos 5 s padrão.
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 20_000 });
  });

  test("os pontos de entrada 'Entrar' levam o caminho atual em ?next=", async ({ page }) => {
    await page.goto("/minha-lista");
    await expect(page.getByRole("link", { name: /entrar/i }).first()).toHaveAttribute(
      "href",
      /\/login\?next=%2Fminha-lista/
    );

    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: "Entrar" }).first()).toHaveAttribute(
      "href",
      "/login?next=%2Fcalendar"
    );
  });
});

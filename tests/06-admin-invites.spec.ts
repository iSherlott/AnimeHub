import { test, expect } from "@playwright/test";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

test.describe("Não-administrador — acesso negado", () => {
  // Roda com a sessão padrão da suíte (usuário comum, não admin).

  test("GET /api/admin/users retorna 403", async ({ request }) => {
    const res = await request.get("/api/admin/users");
    expect(res.status()).toBe(403);
  });

  test("POST /api/admin/invites retorna 403", async ({ request }) => {
    const res = await request.post("/api/admin/invites");
    expect(res.status()).toBe(403);
  });

  test("toda a área /admin retorna 404 pra quem não é administrador", async ({ page }) => {
    for (const path of ["/admin", "/admin/acesso", "/admin/jobs", "/admin/importacoes"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });
});

test.describe("Administrador — convites e usuários", () => {
  test.use({
    storageState: {
      cookies: [
        {
          name: SESSION_COOKIE_NAME,
          value: TEST_ADMIN_SESSION_TOKEN,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  });

  test("acessa o painel de administração", async ({ page }) => {
    await page.goto("/admin/acesso");
    await expect(page.getByRole("heading", { name: "Acesso e moderação" })).toBeVisible();
    // O cabeçalho não mostra mais o nome como texto (só o avatar com
    // iniciais, desde o lote 3 do Epic 27) — "E2E Admin" aqui só pode vir
    // da lista de usuários do próprio painel, que é o que a página
    // realmente busca da API.
    await expect(page.getByText("E2E Admin").last()).toBeVisible();
    await expect(page.getByText("E2E Test User")).toBeVisible();
  });

  test("gera um convite", async ({ request }) => {
    const res = await request.post("/api/admin/invites");
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.invite.code).toMatch(/^[0-9a-f]{24}$/);
  });

  test("lista usuários existentes", async ({ request }) => {
    const res = await request.get("/api/admin/users");
    expect(res.status()).toBe(200);
    const data = await res.json();
    const emails = data.users.map((u: { email: string }) => u.email);
    expect(emails).toContain("e2e@test.local");
    expect(emails).toContain("e2e-admin@test.local");
  });
});

test.describe("Cadastro exige convite válido", () => {
  // Sem sessão — testando o fluxo público de /api/auth/signup.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("rejeita cadastro sem código de convite", async ({ request }) => {
    const res = await request.post("/api/auth/signup", {
      data: {
        email: `sem-convite-${Date.now()}@test.local`,
        password: "password123",
        displayName: "Sem Convite",
      },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/convite/i);
  });

  test("aceita cadastro com um convite válido, e o convite não pode ser reutilizado", async ({
    request,
  }) => {
    // Gera o convite autenticado como admin — este describe roda com
    // storageState vazio, então manda o cookie manualmente só nesta chamada
    // em vez de trocar de contexto.
    const inviteRes = await request.post("/api/admin/invites", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const { invite } = await inviteRes.json();

    const email = `com-convite-${Date.now()}@test.local`;
    const signupRes = await request.post("/api/auth/signup", {
      data: {
        email,
        password: "password123",
        displayName: "Com Convite",
        inviteCode: invite.code,
      },
    });
    expect(signupRes.status()).toBe(201);

    // Tentar usar o mesmo código de novo deve falhar.
    const reuseRes = await request.post("/api/auth/signup", {
      data: {
        email: `outro-${Date.now()}@test.local`,
        password: "password123",
        displayName: "Outro",
        inviteCode: invite.code,
      },
    });
    expect(reuseRes.status()).toBe(400);
    const reuseData = await reuseRes.json();
    expect(reuseData.error).toMatch(/convite/i);
  });

  test("duas tentativas concorrentes com o mesmo convite: só uma vence", async ({
    request,
  }) => {
    const inviteRes = await request.post("/api/admin/invites", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const { invite } = await inviteRes.json();

    // Promise.all dispara as duas requisições sem esperar uma terminar antes
    // da outra — testa de verdade o updateMany+count da transação de
    // signup, não só "um convite já usado falha depois".
    const [resA, resB] = await Promise.all([
      request.post("/api/auth/signup", {
        data: {
          email: `race-a-${Date.now()}@test.local`,
          password: "password123",
          displayName: "Race A",
          inviteCode: invite.code,
        },
      }),
      request.post("/api/auth/signup", {
        data: {
          email: `race-b-${Date.now()}@test.local`,
          password: "password123",
          displayName: "Race B",
          inviteCode: invite.code,
        },
      }),
    ]);

    const statuses = [resA.status(), resB.status()].sort();
    expect(statuses).toEqual([201, 400]);
  });

  test("rejeita um código de convite inexistente", async ({ request }) => {
    const res = await request.post("/api/auth/signup", {
      data: {
        email: `invalido-${Date.now()}@test.local`,
        password: "password123",
        displayName: "Invalido",
        inviteCode: "codigo-que-nao-existe",
      },
    });
    expect(res.status()).toBe(400);
  });
});

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Epic 28 (bio + avatar) — nasceu sem nenhum teste (auditoria Figma×PoC,
// GAP-Q-01). Cobre só a API; a UI de edição fica para depois de D-15
// (avatar por upload contradiz o Figma, que só tem avatar de iniciais).
const FIXTURES = path.join(__dirname, "fixtures");

test.describe("PATCH /api/users/me (bio)", () => {
  test("salva e devolve a bio aparada; bio em branco vira null", async ({ request }) => {
    const ok = await request.patch("/api/users/me", { data: { bio: "  Gosto de cenários e trilhas.  " } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).bio).toBe("Gosto de cenários e trilhas.");

    const cleared = await request.patch("/api/users/me", { data: { bio: "   " } });
    expect(cleared.status()).toBe(200);
    expect((await cleared.json()).bio).toBeNull();
  });

  test("rejeita bio acima de 300 caracteres", async ({ request }) => {
    const res = await request.patch("/api/users/me", { data: { bio: "x".repeat(301) } });
    expect(res.status()).toBe(400);
  });

  test("JSON inválido ou corpo não-objeto devolve 400, não 500", async ({ request }) => {
    const invalid = await request.patch("/api/users/me", {
      headers: { "Content-Type": "application/json" },
      data: "{nope",
    });
    expect(invalid.status()).toBe(400);

    const nullBody = await request.patch("/api/users/me", {
      headers: { "Content-Type": "application/json" },
      data: "null",
    });
    expect(nullBody.status()).toBe(400);
  });

  test("anônimo recebe 401", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const res = await anon.patch("/api/users/me", { data: { bio: "x" } });
    expect(res.status()).toBe(401);
    await anon.dispose();
  });
});

test.describe("POST/DELETE /api/users/me/avatar", () => {
  test("envia uma imagem, grava a URL e permite remover", async ({ request }) => {
    const file = readFileSync(path.join(FIXTURES, "test-image.png"));
    const up = await request.post("/api/users/me/avatar", {
      multipart: { file: { name: "avatar.png", mimeType: "image/png", buffer: file } },
    });
    expect(up.status()).toBe(201);
    const { avatarUrl } = await up.json();
    expect(avatarUrl).toMatch(/\/api\/uploads\/avatars\/\d{4}-\d{2}\/[0-9a-f-]+\.webp$/);

    const served = await request.get(new URL(avatarUrl).pathname);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/webp");

    const del = await request.delete("/api/users/me/avatar");
    expect(del.status()).toBe(200);
    expect((await del.json()).avatarUrl).toBeNull();
  });

  test("rejeita arquivo que não é imagem e corpo sem arquivo", async ({ request }) => {
    const text = readFileSync(path.join(FIXTURES, "not-an-image.txt"));
    const bad = await request.post("/api/users/me/avatar", {
      multipart: { file: { name: "avatar.png", mimeType: "image/png", buffer: text } },
    });
    expect(bad.status()).toBe(400);

    const none = await request.post("/api/users/me/avatar", { multipart: { other: "x" } });
    expect(none.status()).toBe(400);
  });

  test("anônimo recebe 401", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const file = readFileSync(path.join(FIXTURES, "test-image.png"));
    const res = await anon.post("/api/users/me/avatar", {
      multipart: { file: { name: "a.png", mimeType: "image/png", buffer: file } },
    });
    expect(res.status()).toBe(401);
    await anon.dispose();
  });
});

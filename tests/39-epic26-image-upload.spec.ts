import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const VALID_IMAGE = readFileSync(path.join(FIXTURES_DIR, "test-image.png"));
const NOT_AN_IMAGE = readFileSync(path.join(FIXTURES_DIR, "not-an-image.txt"));
const CORRUPT_IMAGE = readFileSync(path.join(FIXTURES_DIR, "corrupt-image.png"));

test.describe("Epic 26 — upload real de imagem", () => {
  test("POST /api/uploads sem sessão retorna 401", async ({ request }) => {
    // Sem storageState (cookies vazios) — mesmo padrão já usado noutros
    // testes de rota autenticada.
    const res = await request.post("/api/uploads", {
      headers: { Cookie: "" },
      multipart: { file: { name: "test.png", mimeType: "image/png", buffer: VALID_IMAGE } },
    });
    expect(res.status()).toBe(401);
  });

  test("aceita uma imagem válida e devolve URL absoluta + dimensões", async ({ request }) => {
    const res = await request.post("/api/uploads", {
      multipart: { file: { name: "test.png", mimeType: "image/png", buffer: VALID_IMAGE } },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    // URL absoluta é essencial — POST /api/anime/[id]/posts valida
    // imageUrls com isValidHttpUrl (new URL() lançaria num caminho
    // relativo) e não foi alterado pra aceitar caminho local de propósito
    // (ver comentário em src/app/api/uploads/route.ts).
    expect(data.url).toMatch(/^https?:\/\//);
    expect(data.url).toContain("/uploads/posts/");
    expect(data.width).toBe(20);
    expect(data.height).toBe(20);
  });

  test("rejeita arquivo que não é imagem", async ({ request }) => {
    const res = await request.post("/api/uploads", {
      multipart: { file: { name: "not-an-image.txt", mimeType: "text/plain", buffer: NOT_AN_IMAGE } },
    });
    expect(res.status()).toBe(400);
  });

  // Achado ao vivo desta sessão: `sharp(buffer).metadata()` só lê o
  // cabeçalho — um PNG com cabeçalho válido mas dado de pixel corrompido
  // passa pela checagem de formato sem erro e só quebra de verdade dentro
  // do reencode (`toBuffer()`), gerando um 500 cru em vez do 400 esperado
  // se essa 2ª etapa não estiver no mesmo try/catch.
  test("rejeita PNG com cabeçalho válido mas dado de pixel corrompido (não derruba com 500)", async ({
    request,
  }) => {
    const res = await request.post("/api/uploads", {
      multipart: { file: { name: "corrupt.png", mimeType: "image/png", buffer: CORRUPT_IMAGE } },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  // Achado real da revisão de código desta entrega: sem essa checagem por
  // Content-Length, `request.formData()` bufferizava a requisição inteira
  // pra memória ANTES de `isWithinMaxSize` sequer rodar.
  test("rejeita requisição maior que o limite antes de processar (413)", async ({ request }) => {
    const oversized = Buffer.alloc(9 * 1024 * 1024, 1); // 9MB, acima do limite de 8MB
    const res = await request.post("/api/uploads", {
      multipart: { file: { name: "big.png", mimeType: "image/png", buffer: oversized } },
    });
    expect(res.status()).toBe(413);
  });

  test("rejeita quando nenhum arquivo é enviado", async ({ request }) => {
    const res = await request.post("/api/uploads", { multipart: {} });
    expect(res.status()).toBe(400);
  });

  test("a URL devolvida é aceita como imageUrls na criação de post existente", async ({ request }) => {
    const upload = await request.post("/api/uploads", {
      multipart: { file: { name: "test.png", mimeType: "image/png", buffer: VALID_IMAGE } },
    });
    const uploadData = await upload.json();

    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.$disconnect();

    const res = await request.post(`/api/anime/${anime.id}/posts`, {
      data: { body: "Post com imagem enviada de verdade", imageUrls: [uploadData.url] },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.post.imageUrls).toEqual([uploadData.url]);
  });
});

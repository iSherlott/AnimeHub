import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { currentSeason } from "../src/lib/anilist";

// anilistId fora da faixa usada por outras fixtures.
const RECOMMENDED_SOURCE_ANILIST_ID = 910000;
const RECOMMENDED_TARGET_ANILIST_ID = 910001; // o que aparece recomendado
const THREAD_ANILIST_ID = 910002;
const SUGGESTION_EMAIL = "epic26-sidebar-suggestion@test.local";
const SUGGESTION_NAME = "Epic26 Sidebar Suggestion User";

// Dados semeados para as APIs de recomendações/threads/sugestões (a lateral antiga do Feed foi
// substituída pela do Figma; as APIs continuam existindo e testadas).
  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    // "Animes recomendados" — agrega Anime.recommendationsJson de TODOS
    // os animes do usuário (src/lib/animeRecommendations.ts). Um anime
    // próprio com 1 recomendação pra um anilistId que o usuário NÃO tem.
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: RECOMMENDED_SOURCE_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: RECOMMENDED_SOURCE_ANILIST_ID,
        titleRomaji: "Anime Round Epic26 Sidebar Source",
        genres: "",
        recommendationsJson: JSON.stringify([
          {
            anilistId: RECOMMENDED_TARGET_ANILIST_ID,
            titleRomaji: "Anime Round Epic26 Sidebar Recommended",
            titleEnglish: null,
            coverImage: null,
          },
        ]),
      },
      update: {
        recommendationsJson: JSON.stringify([
          {
            anilistId: RECOMMENDED_TARGET_ANILIST_ID,
            titleRomaji: "Anime Round Epic26 Sidebar Recommended",
            titleEnglish: null,
            coverImage: null,
          },
        ]),
      },
    });

    // A recomendação só aparece se a obra foi carregada: aqui, no catálogo da temporada atual (carregada sempre).
    const { season, seasonYear } = currentSeason();
    await prisma.catalogEntry.upsert({
      where: { anilistId: RECOMMENDED_TARGET_ANILIST_ID },
      create: { anilistId: RECOMMENDED_TARGET_ANILIST_ID, titleRomaji: "Anime Round Epic26 Sidebar Recommended", genres: "", season, seasonYear, source: "anilist" },
      update: { season, seasonYear },
    });

    // "Pessoas pra seguir" — usuário dedicado, nunca seguido pelo
    // TEST_USER, criado por último (a rota ordena por criação mais
    // recente) pra aparecer de forma previsível no topo da lista.
    await prisma.user.upsert({
      where: { email: SUGGESTION_EMAIL },
      create: {
        email: SUGGESTION_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: SUGGESTION_NAME,
      },
      update: {},
    });

    // "Threads recentes"/"Mais comentadas hoje" — confirma que o
    // componente renomeado (FeedSidebar) continua encanando essa seção
    // corretamente, mesmo sem reconferir sua correção interna (já
    // coberta desde o Epic 25/rodada 22).
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: THREAD_ANILIST_ID } },
      create: { userId: user.id, anilistId: THREAD_ANILIST_ID, titleRomaji: "Anime Round Epic26 Sidebar Thread", genres: "" },
      update: {},
    });
    await prisma.comment.deleteMany({ where: { anilistId: THREAD_ANILIST_ID } });
    await prisma.comment.create({
      data: { anilistId: THREAD_ANILIST_ID, userId: user.id, body: "Comentário pra aparecer na lateral (Epic 26)" },
    });

    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.comment.deleteMany({ where: { anilistId: THREAD_ANILIST_ID } });
    await deleteCatalogEntries(prisma, { where: { anilistId: RECOMMENDED_TARGET_ANILIST_ID } });
    await prisma.user.deleteMany({ where: { email: SUGGESTION_EMAIL } });
    await prisma.$disconnect();
  });


test.describe("Epic 26 — GET /api/feed/trending-posts", () => {
  test("é pública e devolve no máximo 5 posts com o formato esperado", async ({ request }) => {
    const res = await request.get("/api/feed/trending-posts");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.posts)).toBe(true);
    expect(data.posts.length).toBeLessThanOrEqual(5);
    if (data.posts.length > 0) {
      const [post] = data.posts;
      expect(typeof post.id).toBe("string");
      expect(typeof post.body).toBe("string");
      expect(typeof post.likeCount).toBe("number");
      expect(post.author).toMatchObject({ id: expect.any(String), displayName: expect.any(String) });
    }
  });
});

test.describe("Epic 26 — GET /api/feed/recommendations", () => {
  test("exige sessão", async ({ request }) => {
    const res = await request.get("/api/feed/recommendations", { headers: { Cookie: "" } });
    expect(res.status()).toBe(401);
  });

  test("devolve as recomendações agregadas do usuário logado", async ({ request }) => {
    const res = await request.get("/api/feed/recommendations");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.animes).toContainEqual(
      expect.objectContaining({ anilistId: RECOMMENDED_TARGET_ANILIST_ID, isInternal: true, href: `/anime/${RECOMMENDED_TARGET_ANILIST_ID}` })
    );
  });
});

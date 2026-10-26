import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toPostDto } from "@/lib/postDto";
import { blockedUserIdSet } from "@/lib/blocks";
import { isValidHttpUrl } from "@/lib/url";
import { isBlank } from "@/lib/text";
import { extractHashtags, MAX_HASHTAGS_PER_POST } from "@/lib/hashtags";
import { linkHashtagsToPost } from "@/lib/postHashtags";
import { equippedTitleNames } from "@/lib/quiz";

export const MAX_POST_BODY_LENGTH = 500;
export const MAX_POST_IMAGES = 6;

/**
 * Contexto de obra congelado no post (opcional: publicar sem anime é válido — D-27/Figma 13:41840). A obra é a da AniList
 * ou, sem AniList ID (só do AniDB/Kitsu), a do catálogo (`catalogEntryId`).
 */
export type PostAnimeContext = {
  anilistId: number | null;
  catalogEntryId?: string | null;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
} | null;

/**
 * Criação de publicação compartilhada pelas duas rotas (`POST /api/posts`,
 * contexto opcional escolhido explicitamente; `POST /api/anime/[id]/posts`,
 * contexto vindo da linha de Anime do autor). Valida corpo, imagens e
 * citação, e devolve a resposta HTTP pronta.
 */
export async function createPostResponse(user: User, rawBody: unknown, anime: PostAnimeContext): Promise<NextResponse> {
  const body = (rawBody && typeof rawBody === "object" ? rawBody : {}) as Record<string, unknown>;

  const text = typeof body.body === "string" ? body.body.trim() : "";
  // isBlank (não só !text) — ver src/lib/text.ts (achado real da 11ª
  // rodada de auditoria, Epic 18).
  if (isBlank(text)) {
    return NextResponse.json({ error: "Post não pode ser vazio" }, { status: 400 });
  }
  if (text.length > MAX_POST_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Post muito longo (máximo ${MAX_POST_BODY_LENGTH} caracteres)` },
      { status: 400 }
    );
  }

  // Hashtags: Unicode, ID canônico, limite por publicação (D-13, provisório).
  const hashtags = extractHashtags(text);
  if (hashtags.length > MAX_HASHTAGS_PER_POST) {
    return NextResponse.json(
      { error: `No máximo ${MAX_HASHTAGS_PER_POST} hashtags por publicação` },
      { status: 400 }
    );
  }

  const imageUrls: string[] = [];
  if (body.imageUrls !== undefined) {
    if (!Array.isArray(body.imageUrls)) {
      return NextResponse.json({ error: "imageUrls deve ser uma lista" }, { status: 400 });
    }
    if (body.imageUrls.length > MAX_POST_IMAGES) {
      return NextResponse.json({ error: `No máximo ${MAX_POST_IMAGES} imagens por post` }, { status: 400 });
    }
    for (const raw of body.imageUrls) {
      if (typeof raw !== "string") {
        return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
      }
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (!isValidHttpUrl(trimmed)) {
        return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
      }
      imageUrls.push(trimmed);
    }
  }

  // Citação (Epic 25) — confirma que o post citado existe, não foi apagado
  // e não é de alguém bloqueado. Sem exigir o mesmo anime do citado: citar é
  // sobre o POST.
  let quotedPostId: string | null = null;
  if (typeof body.quotedPostId === "string" && body.quotedPostId.trim()) {
    const quoted = await prisma.post.findUnique({
      where: { id: body.quotedPostId.trim() },
      select: { id: true, deletedAt: true, repostOfId: true, userId: true },
    });
    if (!quoted || quoted.deletedAt || (await blockedUserIdSet(user.id)).has(quoted.userId)) {
      return NextResponse.json({ error: "Post citado não encontrado" }, { status: 404 });
    }
    // Uma linha-repost não tem corpo/imagem próprios (Epic 25) — citar
    // normaliza pro original de verdade antes de gravar, para
    // `quotedPostId` nunca apontar para outra linha-repost (achado real da
    // 21ª rodada de auditoria, Epic 18).
    if (quoted.repostOfId) {
      const original = await prisma.post.findUnique({
        where: { id: quoted.repostOfId },
        select: { id: true, deletedAt: true },
      });
      if (!original || original.deletedAt) {
        return NextResponse.json({ error: "Post citado não encontrado" }, { status: 404 });
      }
      quotedPostId = original.id;
    } else {
      quotedPostId = quoted.id;
    }
  }

  const post = await prisma.post.create({
    data: {
      userId: user.id,
      anilistId: anime?.anilistId ?? null,
      catalogEntryId: anime?.anilistId === null ? (anime.catalogEntryId ?? null) : null,
      animeTitleRomaji: anime?.titleRomaji ?? null,
      animeTitleEnglish: anime?.titleEnglish ?? null,
      animeCoverImage: anime?.coverImage ?? null,
      body: text,
      isSpoiler: body.isSpoiler === true,
      imageUrls,
      quotedPostId,
    },
    include: {
      user: { select: { id: true, displayName: true, handle: true, avatarUrl: true } },
      quotedPost: { include: { user: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } } },
      catalogEntry: { select: { anidbId: true, kitsuId: true } },
    },
  });

  await linkHashtagsToPost(post.id, hashtags, [anime?.titleRomaji, anime?.titleEnglish]);

  return NextResponse.json(
    {
      post: toPostDto(post, {
        viewerId: user.id,
        likeCount: 0,
        likedByMe: false,
        reportedByMe: false,
        commentCount: 0,
        quotedPost: post.quotedPost,
        authorTitle: (await equippedTitleNames([user.id])).get(user.id) ?? null,
      }),
    },
    { status: 201 }
  );
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { toPostDto } from "@/lib/postDto";
import { isValidHttpUrl } from "@/lib/url";
import { isBlank } from "@/lib/text";

type Params = { params: Promise<{ id: string }> };

const MAX_BODY_LENGTH = 500;

/**
 * `[id]` é a linha de Anime do próprio autor (não o anilistId) — o post
 * congela título/capa a partir dela na criação, pra aparecer no feed
 * global sem depender de quem for ver também ter esse anime na lista
 * (diferente de Comment, que é escopado por posse).
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    select: {
      userId: true,
      anilistId: true,
      titleRomaji: true,
      titleEnglish: true,
      coverImage: true,
    },
  });
  if (!anime || anime.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  // isBlank (não só !text) — ver src/lib/text.ts (achado real da 11ª
  // rodada de auditoria, Epic 18).
  if (isBlank(text)) {
    return NextResponse.json({ error: "Post não pode ser vazio" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Post muito longo (máximo ${MAX_BODY_LENGTH} caracteres)` },
      { status: 400 }
    );
  }

  let imageUrl: string | null = null;
  if (typeof body.imageUrl === "string" && body.imageUrl.trim()) {
    const trimmed = body.imageUrl.trim();
    if (!isValidHttpUrl(trimmed)) {
      return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
    }
    imageUrl = trimmed;
  }

  const post = await prisma.post.create({
    data: {
      userId: user.id,
      anilistId: anime.anilistId,
      animeTitleRomaji: anime.titleRomaji,
      animeTitleEnglish: anime.titleEnglish,
      animeCoverImage: anime.coverImage,
      body: text,
      imageUrl,
    },
    include: { user: { select: { id: true, displayName: true } } },
  });

  return NextResponse.json(
    {
      post: toPostDto(post, {
        viewerId: user.id,
        likeCount: 0,
        likedByMe: false,
        reportedByMe: false,
      }),
    },
    { status: 201 }
  );
}

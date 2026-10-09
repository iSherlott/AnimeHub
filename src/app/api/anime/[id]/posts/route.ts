import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { createPostResponse } from "@/lib/createPost";

type Params = { params: Promise<{ id: string }> };

/**
 * Compatibilidade: `[id]` é a linha de Anime do próprio autor. A rota
 * canônica agora é `POST /api/posts` (contexto de obra opcional, escolhido
 * explicitamente); esta continua existindo para quem já publica "a partir
 * de um anime da própria lista".
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await prisma.anime.findUnique({
    where: { id },
    select: { userId: true, anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true },
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

  return createPostResponse(user, body, {
    anilistId: anime.anilistId,
    titleRomaji: anime.titleRomaji,
    titleEnglish: anime.titleEnglish,
    coverImage: anime.coverImage,
  });
}

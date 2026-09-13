import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { refreshAnimeData, type RefreshResult } from "@/lib/refreshAnimeData";
import { callInternalService } from "@/lib/serviceDelegate";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const anime = await prisma.anime.findUnique({ where: { id } });
  if (!anime || anime.userId !== user.id) {
    return NextResponse.json({ error: "Anime não encontrado" }, { status: 404 });
  }

  // Atualização completa (5 fontes em sequência) — timeout mais folgado que
  // os outros endpoints delegados.
  const delegated = await callInternalService<RefreshResult>(
    process.env.CACHE_UPDATER_URL,
    "/refresh-anime",
    { animeId: id },
    15000
  );
  if (delegated) return NextResponse.json(delegated);

  const result = await refreshAnimeData(anime);
  return NextResponse.json(result);
}

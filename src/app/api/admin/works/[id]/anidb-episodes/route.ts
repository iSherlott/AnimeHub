import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isAnidbConfigured } from "@/lib/anidb";
import { fetchAnidbEpisodes } from "@/lib/anidbEpisodes";

export const dynamic = "force-dynamic";

/** Busca agora os episódios desta obra no AniDB (título e dia de cada um; campos protegidos não mudam). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const entry = await prisma.catalogEntry.findUnique({ where: { id: (await params).id }, select: { id: true, anidbId: true, anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true } });
  if (!entry) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
  if (entry.anidbId === null) return NextResponse.json({ error: "A obra não tem AniDB ID." }, { status: 400 });
  if (!isAnidbConfigured()) return NextResponse.json({ error: "AniDB não configurada no servidor." }, { status: 503 });
  try {
    const result = await fetchAnidbEpisodes(entry, "refresh");
    await prisma.adminLog.create({ data: { source: "AniDB", event: "AniDB episodes", message: `${entry.titleRomaji}: ${result.found} episódio(s) no AniDB, ${result.written} gravado(s) ou completado(s), ${result.extras} extra(s).`, context: `catalog:${entry.id}`, adminName: user.displayName } });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: `O AniDB não respondeu: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}` }, { status: 502 });
  }
}

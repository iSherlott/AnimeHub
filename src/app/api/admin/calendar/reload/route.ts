import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { defaultImportDeps, loadAiring } from "@/lib/anilistImport";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 2 * 60_000;

/**
 * Reprocessamento controlado da agenda de UMA obra (Fase 5): relê os episódios na AniList e grava pelo mesmo caminho do
 * carregador (idempotente: o mesmo dado não muda nada nem gera aviso). Uma vez a cada 2 minutos por obra; fica no log.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { workId?: unknown } | null;
  const workId = typeof body?.workId === "string" ? body.workId : "";
  const work = workId ? await prisma.catalogEntry.findUnique({ where: { id: workId }, select: { id: true, anilistId: true, titleRomaji: true, onPlatform: true } }) : null;
  if (!work) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
  if (work.anilistId === null) return NextResponse.json({ error: "A obra não tem AniList ID: não há agenda para reler." }, { status: 400 });
  if (!work.onPlatform) return NextResponse.json({ error: "A obra não está na plataforma: publique antes de carregar a agenda." }, { status: 400 });
  const context = `AniList ${work.anilistId}`;
  const recent = await prisma.adminLog.findFirst({ where: { event: "Calendar reload", context, at: { gt: new Date(Date.now() - COOLDOWN_MS) } } });
  if (recent) return NextResponse.json({ error: "Esta obra acabou de ser relida. Tente de novo em 2 minutos." }, { status: 429 });
  await prisma.adminLog.create({ data: { source: "AniList", event: "Calendar reload", message: `Releitura da agenda de ${work.titleRomaji} pedida.`, context, adminName: user.displayName } });
  try {
    const episodes = await loadAiring([work.anilistId], defaultImportDeps);
    await prisma.adminLog.create({ data: { source: "AniList", event: "Calendar reload done", message: `${work.titleRomaji}: ${episodes} episódio(s) lido(s) da AniList.`, context, adminName: user.displayName } });
    return NextResponse.json({ episodes });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.adminLog.create({ data: { source: "AniList", level: "ERROR", event: "Calendar reload failed", message: `${work.titleRomaji}: ${message}`, context, adminName: user.displayName } });
    return NextResponse.json({ error: `A AniList não respondeu: ${message}` }, { status: 502 });
  }
}

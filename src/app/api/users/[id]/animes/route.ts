import { NextResponse } from "next/server";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { loadProfileAnimeList } from "@/lib/profileAnimeList";

type Params = { params: Promise<{ id: string }> };

/**
 * Animes acompanhados de um perfil (estilo My Anime List), com `?q=` (título), `?genre=` e `?category=` (watching | unfinished | finished | dropped | paused), em páginas (`?cursor=`, `?limit=`). Leitura não exige
 * sessão; a lista é pública por padrão, mas a pessoa pode ocultá-la (403) e bloqueios valem como no resto
 * do perfil (404, sem revelar quem bloqueou quem).
 */
export async function GET(request: Request, { params }: Params) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const viewer = await getCurrentUser();
  // Rolagem infinita: `cursor` é a posição (padrão 0) e `limit` o tamanho da página (padrão 48, no máximo 100).
  const cursor = Number(searchParams.get("cursor"));
  const limit = Number(searchParams.get("limit"));
  const page = {
    offset: Number.isInteger(cursor) && cursor > 0 ? cursor : 0,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 48,
  };
  const result = await loadProfileAnimeList(id, viewer?.id ?? null, (searchParams.get("q") ?? "").slice(0, 100), (searchParams.get("genre") ?? "").slice(0, 60), (searchParams.get("category") ?? "").slice(0, 20), page);
  if (result.kind === "unavailable") return NextResponse.json({ error: "Perfil indisponível" }, { status: 404 });
  if (result.kind === "hidden") return NextResponse.json({ error: "Esta pessoa mantém a lista de animes privada." }, { status: 403 });
  return NextResponse.json({ ...result.list, isOwn: result.isOwn });
}

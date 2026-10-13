import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadProfileAnimeList } from "@/lib/profileAnimeList";

type Params = { params: Promise<{ id: string }> };

/**
 * Animes acompanhados de um perfil (estilo My Anime List), com `?q=` (título), `?genre=` e `?category=` (watching | unfinished | finished). Leitura não exige
 * sessão; a lista é pública por padrão, mas a pessoa pode ocultá-la (403) e bloqueios valem como no resto
 * do perfil (404, sem revelar quem bloqueou quem).
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const viewer = await getCurrentUser();
  const result = await loadProfileAnimeList(id, viewer?.id ?? null, (searchParams.get("q") ?? "").slice(0, 100), (searchParams.get("genre") ?? "").slice(0, 60), (searchParams.get("category") ?? "").slice(0, 20));
  if (result.kind === "unavailable") return NextResponse.json({ error: "Perfil indisponível" }, { status: 404 });
  if (result.kind === "hidden") return NextResponse.json({ error: "Esta pessoa mantém a lista de animes privada." }, { status: 403 });
  return NextResponse.json({ ...result.list, isOwn: result.isOwn });
}

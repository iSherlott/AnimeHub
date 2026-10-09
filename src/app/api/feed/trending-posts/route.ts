import { NextResponse } from "next/server";
import { toDtoPage } from "@/lib/postFeedDto";
import { loadRecommendedPage } from "@/lib/feedRecommended";
import { getCurrentUser } from "@/lib/auth/session";

const LIMIT = 5;

/**
 * "Posts em alta" da lateral do Feed (Epic 26) — pública, mesmo espírito
 * da aba "Recomendado" do próprio Feed (que também é pública). Reaproveita
 * a MESMA janela/pontuação/desempate (loadRecommendedPage) e a MESMA
 * resolução de repost/citação (toDtoPage) do feed principal, só pegando
 * uma fatia (top 5) de um instantâneo (`new Date()` na hora da própria
 * requisição — a lateral não precisa da mesma trava de sessão de rolagem
 * que o feed principal usa, é só um retrato do momento).
 */
export async function GET() {
  const { page } = await loadRecommendedPage(0, LIMIT, new Date());
  // Com sessão, aplica o bloqueio do viewer (D-10); sem sessão segue público.
  const viewer = await getCurrentUser();
  const posts = await toDtoPage(page, viewer?.id ?? null);
  return NextResponse.json({ posts });
}

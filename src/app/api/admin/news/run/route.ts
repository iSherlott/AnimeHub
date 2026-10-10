import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { callInternalService } from "@/lib/serviceDelegate";
import { isNewsRunning, runNewsSync } from "@/lib/animeNews";

/**
 * Admin → Scrapers → "Buscar notícias": chama o serviço secundário `news-fetcher`
 * (notícias das obras da temporada atual). Responde 202 e segue em segundo plano;
 * 409 se já houver uma execução em andamento.
 */
export async function POST() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  if (await isNewsRunning()) return NextResponse.json({ error: "Já existe uma execução em andamento." }, { status: 409 });

  const delegated = await callInternalService<{ started: boolean }>(process.env.NEWS_FETCHER_URL, "/run", { adminName: user.displayName }, 5000);
  // Sem o serviço (dev local/testes), roda neste mesmo processo, em segundo plano.
  if (!delegated) void runNewsSync({ trigger: "manual", adminName: user.displayName });
  return NextResponse.json({ started: true }, { status: 202 });
}

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { callInternalService } from "@/lib/serviceDelegate";
import { isRunning, runEpisodeImageSync } from "@/lib/episodeImages";

/**
 * Admin → Scrapers → "Executar agora": força a busca das imagens dos episódios
 * (a mesma que roda todo dia às 00:00). Responde 202 e segue em segundo plano;
 * 409 se já houver uma execução em andamento.
 */
export async function POST() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;

  if (await isRunning()) return NextResponse.json({ error: "Já existe uma execução em andamento." }, { status: 409 });

  const delegated = await callInternalService<{ started: boolean }>(
    process.env.CACHE_UPDATER_URL,
    "/episode-images/run",
    { adminName: user.displayName },
    5000
  );
  // Sem o serviço (dev local/testes), roda neste mesmo processo, em segundo plano.
  if (!delegated) void runEpisodeImageSync({ trigger: "manual", adminName: user.displayName });
  return NextResponse.json({ started: true }, { status: 202 });
}

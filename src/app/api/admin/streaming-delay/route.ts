import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { MAX_STREAMING_DELAY_MINUTES, parseStreamingDelay, setStreamingDelay } from "@/lib/streamingDelay";

export const dynamic = "force-dynamic";

/** Admin → Overrides: obras com atraso do streaming (Epic 50). */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const rows = await prisma.catalogEntry.findMany({
    where: { streamingDelayMinutes: { not: null } },
    select: { anilistId: true, titleRomaji: true, titleNative: true, streamingDelayMinutes: true, streamingSite: true },
    orderBy: { titleRomaji: "asc" },
  });
  return NextResponse.json({ items: rows }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Grava o atraso de uma obra: `{ anilistId, minutes, site }` (minutos depois da TV japonesa; `null` ou 0 tira o atraso).
 * A agenda e o próximo episódio já gravados andam junto.
 */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (precisa ser JSON)." }, { status: 400 });
  }
  const input = parseStreamingDelay(body);
  if (!input) {
    return NextResponse.json({ error: `Informe o anilistId da obra e o atraso em minutos (de -${MAX_STREAMING_DELAY_MINUTES} a ${MAX_STREAMING_DELAY_MINUTES}; 0 tira o atraso). A plataforma tem até 40 caracteres.` }, { status: 400 });
  }
  const result = await setStreamingDelay(input);
  if (!result) return NextResponse.json({ error: "Essa obra não está no catálogo." }, { status: 404 });
  await prisma.adminLog
    .create({
      data: {
        source: "Admin",
        level: "INFO",
        event: "Streaming delay",
        message: input.minutes === null ? `Atraso do streaming retirado da obra #${input.anilistId}.` : `Obra #${input.anilistId}: ${input.site ?? "streaming"} ${input.minutes} min depois da TV japonesa (${result.episodes} episódio(s) deslocado(s)).`,
        context: "Admin → Overrides",
        adminName: user.displayName,
      },
    })
    .catch(() => undefined);
  return NextResponse.json({ anilistId: input.anilistId, minutes: input.minutes, site: input.site, episodes: result.episodes });
}

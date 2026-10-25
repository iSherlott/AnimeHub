import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { importOldWorks, parseOldRange } from "@/lib/oldWorksImport";
import { withProgressJob } from "@/lib/progressJob";
import { JobBusyError } from "@/lib/jobLock";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * Admin → AniList: traz para a plataforma as obras antigas que estrearam entre `from` e `to` (`{ from?, to? }`, padrão
 * 1917 a 1999), ano a ano, pela busca por temporada e pela data de estreia. Conteúdo adulto nunca entra. Responde com o resumo
 * quando termina; o andamento aparece em Admin → Jobs.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  let body: { from?: unknown; to?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const range = parseOldRange(body.from, body.to);
  if (!range) return NextResponse.json({ error: "Informe anos de 1917 a 1999, com from até to." }, { status: 400 });
  try {
    return NextResponse.json(
      await withProgressJob({ kind: "ANILIST", source: "AniList", label: `Obras antigas ${range.from}–${range.to}`, stage: "COMMIT", actor: { id: user.id, name: user.displayName } }, (report) => importOldWorks(range, undefined, report))
    );
  } catch (error) {
    if (error instanceof JobBusyError) return NextResponse.json({ error: error.message, running: error.running.seq }, { status: 409 });
    console.error("[admin-anilist] carga das obras antigas falhou:", error);
    return NextResponse.json({ error: "A carga falhou no meio. O que já entrou foi mantido; tente de novo." }, { status: 502 });
  }
}

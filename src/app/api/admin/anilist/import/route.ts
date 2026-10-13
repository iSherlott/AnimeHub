import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { defaultImportDeps, importSelected, MAX_SELECTION, parseIds } from "@/lib/anilistImport";
import { withProgressJob } from "@/lib/progressJob";

/** Admin → AniList: traz para a plataforma só as obras escolhidas (`{ ids }`, até 150) e carrega os episódios delas no calendário. */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const ids = parseIds(body.ids);
  if (!ids) return NextResponse.json({ error: `Escolha de 1 a ${MAX_SELECTION} obras.` }, { status: 400 });
  try {
    return NextResponse.json(
      await withProgressJob({ kind: "ANILIST", source: "AniList", label: `Trazer ${ids.length} obras`, stage: "COMMIT", actor: { id: user.id, name: user.displayName } }, (report) => importSelected(ids, defaultImportDeps, report))
    );
  } catch (error) {
    console.error("[admin-anilist] importação falhou:", error);
    return NextResponse.json({ error: "A importação falhou no meio. O que já entrou foi mantido; tente de novo para completar." }, { status: 502 });
  }
}

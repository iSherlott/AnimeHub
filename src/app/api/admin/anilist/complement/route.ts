import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { complementSelected, defaultImportDeps, MAX_SELECTION, parseIds } from "@/lib/anilistImport";
import { withProgressJob } from "@/lib/progressJob";

/**
 * Admin → AniList: complementa com informação da AniList as obras que JÁ estão na plataforma (`{ ids, overwrite? }`).
 * Por padrão só preenche o que está vazio; com `overwrite` a AniList passa a valer em tudo.
 */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  let body: { ids?: unknown; overwrite?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const ids = parseIds(body.ids);
  if (!ids) return NextResponse.json({ error: `Escolha de 1 a ${MAX_SELECTION} obras.` }, { status: 400 });
  if (body.overwrite !== undefined && typeof body.overwrite !== "boolean") return NextResponse.json({ error: "overwrite deve ser um booleano" }, { status: 400 });
  try {
    return NextResponse.json(
      await withProgressJob({ kind: "ANILIST", source: "AniList", label: `Complementar ${ids.length} obras`, stage: "COMMIT", actor: { id: user.id, name: user.displayName } }, (report) =>
        complementSelected(ids, body.overwrite === true, defaultImportDeps, report)
      )
    );
  } catch (error) {
    console.error("[admin-anilist] complemento falhou:", error);
    return NextResponse.json({ error: "O complemento falhou no meio. O que já foi preenchido foi mantido; tente de novo." }, { status: 502 });
  }
}

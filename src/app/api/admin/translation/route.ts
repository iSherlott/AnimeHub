import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { aliveExclusiveJob } from "@/lib/jobLock";
import { translateCatalog, getTranslationStatus } from "@/lib/curation/translateEngine";
import { isTranslationTarget } from "@/lib/synopsis";

export const dynamic = "force-dynamic";

/** Admin → Curadoria: andamento da tradução em lote das sinopses (quantas já estão em português/japonês e qual motor traduz). */
export async function GET() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  return NextResponse.json(await getTranslationStatus(), { headers: { "Cache-Control": "no-store" } });
}

/**
 * Inicia a tradução em lote em segundo plano (`{ lang?: "pt" | "ja", limit? }`; padrão pt, todas). Retomável: pula o que já
 * está traduzido e para sozinha quando a cota do serviço acaba. Responde 202; 409 se já houver uma rodando.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  let body: { lang?: unknown; limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const lang = body.lang === undefined ? "pt" : body.lang;
  if (!isTranslationTarget(lang)) return NextResponse.json({ error: "lang deve ser pt ou ja" }, { status: 400 });
  const limit = body.limit === undefined ? undefined : Number(body.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20_000)) return NextResponse.json({ error: "limit deve ser um inteiro de 1 a 20000" }, { status: 400 });

  // Fase 8: vivo = rodando com sinal de vida recente (o início em si é atômico, em startExclusiveJob).
  const alive = await aliveExclusiveJob("TRANSLATION");
  if (alive) {
    return NextResponse.json({ error: "Já existe uma tradução em andamento.", seq: alive.seq }, { status: 409 });
  }
  void translateCatalog({ actor: { id: user.id, name: user.displayName }, lang, limit }).catch((error) => console.error("[tradução] falhou:", error));
  return NextResponse.json({ started: true }, { status: 202 });
}

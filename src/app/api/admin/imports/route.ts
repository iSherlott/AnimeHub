import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { analyzeImport } from "@/lib/adminImport/pipeline";

/**
 * Admin → Importações → ANALISAR: lê o HTML colado e grava só a PRÉVIA
 * (job + registros + conflitos). Nada entra no catálogo sem a confirmação
 * explícita (`POST /api/admin/imports/[seq]/commit`).
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const { html, source, season } = (body ?? {}) as { html?: unknown; source?: unknown; season?: unknown };
  if (typeof html !== "string" || typeof source !== "string" || typeof season !== "string") {
    return NextResponse.json({ error: "Informe fonte, temporada e HTML." }, { status: 400 });
  }

  const result = await analyzeImport({ html, source, season, actor: { id: user.id, name: user.displayName } });
  if (!result.ok) return NextResponse.json({ error: result.error, field: result.field, seq: result.seq }, { status: 422 });
  return NextResponse.json({ seq: result.seq }, { status: 201 });
}

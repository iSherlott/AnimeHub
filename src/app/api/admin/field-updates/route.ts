import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parseWorksFilters, worksWhereFull } from "@/lib/adminWorks";
import { createFieldUpdate, FIELD_UPDATE_SOURCES, isFieldUpdateSource } from "@/lib/fieldUpdate";

export const dynamic = "force-dynamic";

/**
 * Cria um lote de atualização seletiva (Fase 6): `{ ids: [id do catálogo] }` ou `{ filter: "q=…&qualidade=…" }` (os
 * mesmos filtros de Admin → Catálogo de obras), com `source`: "anilist" (padrão), "kitsu" ou "anidb". AniList e Kitsu
 * coletam na hora; o AniDB coleta em segundo plano (uma obra a cada poucos segundos). Nada muda até a execução.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { ids?: unknown; filter?: unknown; label?: unknown; source?: unknown } | null;
  if (body?.source !== undefined && !isFieldUpdateSource(body.source)) return NextResponse.json({ error: "Fonte inválida (anilist, kitsu ou anidb)." }, { status: 400 });
  const source = isFieldUpdateSource(body?.source) ? body.source : "anilist";
  const src = FIELD_UPDATE_SOURCES[source];
  let ids: string[] = [];
  let label = typeof body?.label === "string" ? body.label : "";
  if (Array.isArray(body?.ids)) {
    ids = body.ids.filter((x): x is string => typeof x === "string" && /^[a-z0-9]{8,40}$/i.test(x));
    label ||= `${ids.length} obra(s) escolhida(s)`;
  } else if (typeof body?.filter === "string") {
    const filters = parseWorksFilters(new URLSearchParams(body.filter));
    const rows = await prisma.catalogEntry.findMany({ where: { AND: [await worksWhereFull(filters), { [src.idField]: { not: null } }] }, select: { id: true }, orderBy: { titleRomaji: "asc" }, take: src.max + 1 });
    if (rows.length > src.max) return NextResponse.json({ error: `O filtro tem mais de ${src.max} obras com ${src.label} ID. Refine o filtro.` }, { status: 400 });
    ids = rows.map((r) => r.id);
    label ||= `${src.label} · filtro: ${body.filter || "todas"}`;
  } else {
    return NextResponse.json({ error: "Informe as obras (ids) ou um filtro." }, { status: 400 });
  }
  try {
    const result = await createFieldUpdate(ids, { id: user.id, name: user.displayName }, label, source);
    return result.ok ? NextResponse.json({ seq: result.seq }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    console.error("[field-update] criação falhou:", error);
    return NextResponse.json({ error: "Não foi possível criar o lote." }, { status: 500 });
  }
}

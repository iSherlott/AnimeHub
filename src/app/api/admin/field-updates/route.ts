import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parseWorksFilters, worksWhereFull } from "@/lib/adminWorks";
import { MAX_SELECTION } from "@/lib/anilistImport";
import { createFieldUpdate } from "@/lib/fieldUpdate";

export const dynamic = "force-dynamic";

/**
 * Cria um lote de atualização seletiva (Fase 6): `{ ids: [id do catálogo] }` ou `{ filter: "q=…&qualidade=…" }` (os
 * mesmos filtros de Admin → Catálogo de obras). Coleta na AniList na hora; nada muda no catálogo até a execução.
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { ids?: unknown; filter?: unknown; label?: unknown } | null;
  let ids: string[] = [];
  let label = typeof body?.label === "string" ? body.label : "";
  if (Array.isArray(body?.ids)) {
    ids = body.ids.filter((x): x is string => typeof x === "string" && /^[a-z0-9]{8,40}$/i.test(x));
    label ||= `${ids.length} obra(s) escolhida(s)`;
  } else if (typeof body?.filter === "string") {
    const filters = parseWorksFilters(new URLSearchParams(body.filter));
    const rows = await prisma.catalogEntry.findMany({ where: { AND: [await worksWhereFull(filters), { anilistId: { not: null } }] }, select: { id: true }, orderBy: { titleRomaji: "asc" }, take: MAX_SELECTION + 1 });
    if (rows.length > MAX_SELECTION) return NextResponse.json({ error: `O filtro tem mais de ${MAX_SELECTION} obras com AniList ID. Refine o filtro.` }, { status: 400 });
    ids = rows.map((r) => r.id);
    label ||= `Filtro: ${body.filter || "todas"}`;
  } else {
    return NextResponse.json({ error: "Informe as obras (ids) ou um filtro." }, { status: 400 });
  }
  try {
    const result = await createFieldUpdate(ids, { id: user.id, name: user.displayName }, label);
    return result.ok ? NextResponse.json({ seq: result.seq }, { status: 201 }) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    console.error("[field-update] criação falhou:", error);
    return NextResponse.json({ error: "Não foi possível criar o lote." }, { status: 500 });
  }
}

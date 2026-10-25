import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { auditTimelines } from "@/lib/curation/timelineAudit";
import { applyLoot, validateLoot } from "@/lib/story/loot";
import { getStoryStatus } from "@/lib/story/status";

export const dynamic = "force-dynamic";

/** Admin → Curadoria: andamento da pesquisa de reboots e arcos (fila de candidatos, conferidos e lotes aplicados). */
export async function GET() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  return NextResponse.json(await getStoryStatus(), { headers: { "Cache-Control": "no-store" } });
}

/**
 * Aplica um lote de pesquisa (`{ loot, items }`, ver src/lib/story/loot): valida tudo antes de gravar e responde 400 com a lista
 * de erros se algo estiver errado. Quando o lote muda o que é reboot, refaz as linhas do tempo em segundo plano (cada versão da
 * história passa a ter a sua).
 */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: ["Corpo da requisição inválido (precisa ser JSON)."] }, { status: 400 });
  }
  const ids = new Set<number>();
  const shape = body as { items?: Array<{ a?: unknown; b?: unknown; arcs?: Array<{ anilistId?: unknown }> }>; arcs?: Array<{ anilistId?: unknown }> };
  const collect = (value: unknown) => {
    if (typeof value === "number" && Number.isInteger(value)) ids.add(value);
  };
  for (const item of Array.isArray(shape?.items) ? shape.items : []) {
    collect(item?.a);
    collect(item?.b);
    for (const g of Array.isArray(item?.arcs) ? item.arcs : []) collect(g?.anilistId);
  }
  for (const g of Array.isArray(shape?.arcs) ? shape.arcs : []) collect(g?.anilistId);
  const rows = ids.size ? await prisma.catalogEntry.findMany({ where: { anilistId: { in: [...ids] } }, select: { anilistId: true, episodes: true, startDate: true, seasonYear: true, titleRomaji: true } }) : [];
  const startOf = (r: (typeof rows)[number]) => (r.startDate ? r.startDate.getTime() : r.seasonYear ? Date.UTC(r.seasonYear, 0, 1) : null);
  const checked = validateLoot(body, new Map(rows.map((r) => [r.anilistId as number, { episodes: r.episodes, startMs: startOf(r), title: r.titleRomaji }])));
  if (!checked.ok) return NextResponse.json({ errors: checked.errors }, { status: 400 });

  const result = await applyLoot(checked.loot);
  // Quem é reboot de quem muda as franquias: refaz as linhas do tempo (a própria auditoria evita rodar duas ao mesmo tempo).
  void auditTimelines({ actor: { id: user.id, name: user.displayName } }).catch((error) => console.error("[story] auditoria depois do lote falhou:", error));
  return NextResponse.json({ ...result, auditStarted: true });
}

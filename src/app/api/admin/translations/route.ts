import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listTranslations, pendingCsv, stateWhere, TRANSLATION_STATES, translationCounts, translationState, type TranslationState } from "@/lib/translations";

export const dynamic = "force-dynamic";

const parseState = (v: string | null): TranslationState => (v && v in TRANSLATION_STATES ? (v as TranslationState) : "automatica");

/** Lista por estado (`?estado=&q=&pagina=`), ou exporta as do estado em CSV (`&formato=csv`). */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const sp = new URL(request.url).searchParams;
  const estado = parseState(sp.get("estado"));
  if (sp.get("formato") === "csv") {
    const rows = await prisma.catalogEntry.findMany({ where: { onPlatform: true, ...stateWhere(estado) }, orderBy: { titleRomaji: "asc" }, select: { id: true, anilistId: true, titleRomaji: true, titleNative: true, description: true, descriptionPt: true, descriptionPtStatus: true } });
    return new Response(`﻿${pendingCsv(rows.map((r) => ({ ...r, state: translationState(r) })))}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="traducoes-${estado}.csv"`, "Cache-Control": "no-store" },
    });
  }
  const [list, counts] = await Promise.all([listTranslations({ estado, q: (sp.get("q") ?? "").slice(0, 80), pagina: Math.max(0, Number(sp.get("pagina")) || 0) }), translationCounts()]);
  return NextResponse.json({ ...list, counts }, { headers: { "Cache-Control": "no-store" } });
}

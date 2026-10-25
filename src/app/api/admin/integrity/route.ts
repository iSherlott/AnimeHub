import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { linkMissingCatalogIds } from "@/lib/catalogLink";
import { runIntegrityChecks } from "@/lib/integrity";

export const dynamic = "force-dynamic";

/** Verificações de integridade do catálogo (Fase 2): vínculos, órfãos e duplicidades, com o impacto de cada uma. */
export async function GET() {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  return NextResponse.json({ checks: await runIntegrityChecks() }, { headers: { "Cache-Control": "no-store" } });
}

/** `{ action: "link" }`: liga ao catálogo as cópias e episódios que ainda não têm vínculo (idempotente). */
export async function POST(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "link") return NextResponse.json({ error: "Ação desconhecida (use { action: \"link\" })." }, { status: 400 });
  const linked = await linkMissingCatalogIds();
  await prisma.adminLog
    .create({ data: { source: "Admin", level: "INFO", event: "Catalog links", message: `Ligadas ao catálogo: ${linked.productions} produção(ões), ${linked.listEntries} item(ns) de lista, ${linked.schedule} episódio(s) da agenda.`, context: "Integridade", adminName: user.displayName } })
    .catch(() => undefined);
  return NextResponse.json({ linked, checks: await runIntegrityChecks() });
}

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { isIssueCode, ISSUE_LABELS } from "@/lib/curation/issues";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Admin → Curadoria: pendências abertas de um motivo (`?code=…&page=0`), 50 por página, ou o CSV inteiro dele
 * (`&format=csv`) para tratar fora do sistema.
 */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!isIssueCode(code)) return NextResponse.json({ error: "code inválido" }, { status: 400 });
  const where = { code, status: "OPEN" } as const;

  if (url.searchParams.get("format") === "csv") {
    const rows = await prisma.curationIssue.findMany({ where, orderBy: { title: "asc" }, select: { title: true, anilistId: true, anidbId: true, detail: true } });
    const lines = ["titulo,anilistId,anidbId,detalhe", ...rows.map((r) => [r.title, r.anilistId, r.anidbId, r.detail].map(csvCell).join(","))];
    return new NextResponse(`﻿${lines.join("\n")}\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="curadoria-${code.toLowerCase()}.csv"`, "Cache-Control": "no-store" },
    });
  }

  const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
  const [total, items] = await Promise.all([
    prisma.curationIssue.count({ where }),
    prisma.curationIssue.findMany({ where, orderBy: { title: "asc" }, skip: page * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, title: true, anilistId: true, anidbId: true, detail: true } }),
  ]);
  return NextResponse.json({ code, label: ISSUE_LABELS[code].title, why: ISSUE_LABELS[code].why, total, page, pageSize: PAGE_SIZE, items }, { headers: { "Cache-Control": "no-store" } });
}

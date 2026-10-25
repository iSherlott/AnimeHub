import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { sinceFor } from "@/lib/adminJobView";
import { jobsCsv, jobsWhere, parseJobFilters } from "@/lib/jobsOverview";

export const dynamic = "force-dynamic";

/** Exporta os jobs do filtro (até 5.000) em CSV — sem HTML colado nem parâmetros sensíveis. */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const f = parseJobFilters(new URL(request.url).searchParams);
  const jobs = await prisma.adminJob.findMany({ where: jobsWhere(f, sinceFor(f.periodo)), orderBy: { seq: "desc" }, take: 5000, omit: { html: true, resultJson: true } });
  return new Response(`﻿${jobsCsv(jobs.map((j) => ({ ...j, html: null, resultJson: null })))}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="jobs-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}

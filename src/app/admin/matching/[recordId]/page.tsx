import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader, AdminPanel, SmallChip, adminPanelSx } from "@/components/admin/AdminUi";
import { MatchActions } from "@/components/admin/MatchActions";
import { Notice } from "@/components/StatePanels";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";
import type { ScoreDetail } from "@/lib/adminImport/matching";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  AUTO: "Match automático",
  CONFIRMED: "Confirmado por admin",
  NEW: "Será criado como produção nova",
  IGNORED: "Ignorado",
};

function ScoreBar({ label, value, emptyLabel = "n/d" }: { label: string; value: number | null; emptyLabel?: string }) {
  const pct = value === null ? null : Math.round(value * 100);
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr) 56px", alignItems: "center", gap: 2 }}>
      <Typography sx={{ fontSize: 16 }}>{label}</Typography>
      <Box role="img" aria-label={pct === null ? `${label}: sem dado` : `${label}: ${pct}%`} sx={{ height: 8, borderRadius: 4, bgcolor: "#171820", overflow: "hidden" }}>
        <Box sx={{ width: `${pct ?? 0}%`, height: "100%", bgcolor: "text.secondary" }} />
      </Box>
      <Typography sx={{ fontSize: pct === null && emptyLabel.length > 3 ? 12 : 16, color: pct === null && emptyLabel.length > 3 ? "text.secondary" : undefined }}>{pct === null ? emptyLabel : `${pct}%`}</Typography>
    </Box>
  );
}

/** Admin → Matching → Revisar correspondência (Figma `8:4179`): origem × candidato, score por critério e a decisão humana. */
export default async function MatchReviewPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { timeZone } = await requireAdminPage();
  const record = await prisma.importRecord.findUnique({ where: { id: (await params).recordId }, include: { job: { select: { seq: true, state: true, source: true, parserVersion: true } } } });
  if (!record) notFound();

  const candidate = record.matchedProductionId
    ? await prisma.production.findUnique({ where: { id: record.matchedProductionId }, include: { franchise: { include: { _count: { select: { productions: true } } } } } })
    : null;
  // Obra que só está no catálogo da temporada (ainda sem página): `ce:<anilistId>`.
  const catalogCandidate =
    !candidate && record.matchedAnilistId !== null ? await prisma.catalogEntry.findUnique({ where: { anilistId: record.matchedAnilistId } }) : null;
  const pendingIds = (await prisma.importRecord.findMany({ where: { jobSeq: record.jobSeq, state: "PENDING" }, orderBy: { titleRomaji: "asc" }, select: { id: true } })).map((r) => r.id);
  const position = pendingIds.indexOf(record.id);
  const nextId = pendingIds.find((id) => id !== record.id);
  const nextHref = nextId ? `/admin/matching/${nextId}` : `/admin/importacoes/${record.jobSeq}`;
  const detail: ScoreDetail | null = record.scoreDetail ? (JSON.parse(record.scoreDetail) as ScoreDetail) : null;
  const pct = record.score !== null ? Math.round(record.score * 100) : null;

  return (
    <>
      <AdminPageHeader
        title="Revisar correspondência"
        subtitle={
          record.state === "PENDING"
            ? `Prévia #${record.jobSeq} · ${position + 1} de ${pendingIds.length} ${pendingIds.length === 1 ? "pendência" : "pendências"} · nenhuma mudança aplicada`
            : `Prévia #${record.jobSeq} · ${STATE_LABEL[record.state] ?? record.state}`
        }
      />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3, alignItems: "stretch" }}>
        <AdminPanel title={`Registro de origem / ${record.job.source}`} testId="match-source">
          <Typography lang={record.titleNative ? "ja" : undefined} sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3 }}>
            {record.titleNative ?? record.titleRomaji}
          </Typography>
          <Typography sx={{ fontSize: 16 }}>{record.titleRomaji}</Typography>
          {record.titleEnglish && <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{record.titleEnglish}</Typography>}
          <SmallChip>
            {record.job.source} #{record.sourceKey}
          </SmallChip>
          <Typography suppressHydrationWarning sx={{ fontSize: 14, color: "text.secondary" }}>
            Temporada · {record.seasonLabel ?? "—"} · Ano · {record.year ?? "—"} · Tipo · {record.format ?? "—"} · Captura · {fmtFull(record.capturedAt, timeZone)} · ParserVersion · {record.job.parserVersion ?? "—"}
          </Typography>
        </AdminPanel>

        <AdminPanel title="Candidato no catálogo" testId="match-candidate">
          {candidate ? (
            <>
              <Typography lang={candidate.titleNative ? "ja" : undefined} sx={{ fontSize: 20, lineHeight: 1.4 }}>
                {candidate.titleNative ?? candidate.titleRomaji}
              </Typography>
              <SmallChip>Franquia · {candidate.franchise.name}</SmallChip>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Production #{candidate.id.slice(-6).toUpperCase()} · Season {candidate.seasonNumber} · Tipo · {candidate.format ?? "—"} · Temporada · {candidate.season ?? "—"} {candidate.seasonYear ?? ""} · AniList #{candidate.anilistId}
                {candidate.anidbId ? ` · AniDB #${candidate.anidbId}` : ""}
              </Typography>
              {candidate.franchise._count.productions > 1 && <SmallChip tone="warning">Mesma franquia · validar produção</SmallChip>}
            </>
          ) : catalogCandidate ? (
            <>
              <Typography lang={catalogCandidate.titleNative ? "ja" : undefined} sx={{ fontSize: 20, lineHeight: 1.4 }}>
                {catalogCandidate.titleNative ?? catalogCandidate.titleRomaji}
              </Typography>
              <Typography sx={{ fontSize: 16 }}>{catalogCandidate.titleRomaji}</Typography>
              <SmallChip>Catálogo da temporada · página criada ao confirmar</SmallChip>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                Temporada · {catalogCandidate.season ?? "—"} {catalogCandidate.seasonYear ?? ""} · AniList #{catalogCandidate.anilistId}
              </Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 16, color: "text.secondary" }}>
              Nenhum candidato no catálogo. Use “Outro candidato” para buscar uma produção ou “Criar como novo” para cadastrar esta obra no commit.
            </Typography>
          )}
        </AdminPanel>
      </Box>

      {detail && pct !== null && (
        <Box component="section" data-testid="match-score" sx={{ ...adminPanelSx, gap: 2.5 }}>
          <Typography component="h2" sx={{ fontSize: 20 }}>
            Score de correspondência · {pct}%
          </Typography>
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Score do motor com pesos e normalização; não é média simples dos critérios. Não substitui revisão humana. Critério sem dado não entra no cálculo: a imagem não pesa nem bloqueia, e a capa vem depois da AniList.
          </Typography>
          <ScoreBar label="Título" value={detail.title} />
          <ScoreBar label="Imagem" value={detail.image} emptyLabel="não pesa" />
          <ScoreBar label="Temporada" value={detail.season} />
          <ScoreBar label="Ano" value={detail.year} />
        </Box>
      )}

      <Notice tone="info" title="Confira a produção, não apenas o título">
        Confirmar associa a origem à produção escolhida da franquia. Não criar uma nova franquia com sufixo de temporada. Outro candidato permite buscar outra produção; Ignorar exclui este registro do commit e registra o motivo.
      </Notice>

      <MatchActions recordId={record.id} hasCandidate={Boolean(record.matchedProductionId)} editable={record.job.state === "RUNNING"} nextHref={nextHref} />
    </>
  );
}

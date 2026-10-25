import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { OVERRIDE_SOURCE } from "@/lib/airingCache";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { adminPanelSx, AdminPageHeader, AdminPanel, SmallChip } from "@/components/admin/AdminUi";
import { ConflictActions } from "@/components/admin/ConflictActions";
import { EmptyState, Notice } from "@/components/StatePanels";
import { fmtDate, fmtFull, fmtWeekdayClock, requireAdminPage, toLocalInput } from "@/lib/adminPage";

export const dynamic = "force-dynamic";

function SourcePanel({ label, source, value, timeZone, meta }: { label: string; source: string; value: Date; timeZone: string; meta: string[] }) {
  return (
    <Box component="section" aria-label={`${label} · ${source}`} sx={{ ...adminPanelSx, gap: 2 }}>
      <Typography component="h2" sx={{ fontSize: 20, textTransform: "uppercase" }}>
        {label} / {source}
      </Typography>
      <Typography suppressHydrationWarning sx={{ fontSize: 40, lineHeight: 1.2 }}>
        {fmtDate(value, timeZone)}
      </Typography>
      <Typography suppressHydrationWarning sx={{ fontSize: 24, fontWeight: 700 }}>
        {fmtWeekdayClock(value, timeZone)}
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{meta.join(" · ")}</Typography>
    </Box>
  );
}

/** Admin → Conflitos (Figma `8:4327`): duas fontes divergem num campo; a decisão é humana e auditável. */
export default async function AdminConflictsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const wanted = (await searchParams).id;

  const pending = await prisma.catalogConflict.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50 });
  const selected = wanted
    ? await prisma.catalogConflict.findUnique({ where: { id: wanted } })
    : pending[0] ?? (await prisma.catalogConflict.findFirst({ orderBy: { decidedAt: "desc" } }));

  if (!selected) {
    return (
      <>
        <AdminPageHeader title="Conflitos" subtitle="Divergências entre fontes, revisadas antes de confirmar." />
        <AdminPanel>
          <EmptyState testId="admin-conflicts-empty" icon={<CheckCircleOutlinedIcon />} title="Nenhum conflito pendente.">
            As divergências revisadas continuam acessíveis nos logs de auditoria.
          </EmptyState>
        </AdminPanel>
      </>
    );
  }

  const bMeta = selected.bMeta ? (JSON.parse(selected.bMeta) as { sourceKey?: string; parserVersion?: string; capturedAt?: string; overrideReason?: string; overrideBy?: string; previousSourceValue?: string }) : {};
  // Fase 5: "a fonte mudou depois do override" — a decisão do admin foi tomada sobre um valor que a fonte já trocou.
  const overrideConflict = selected.bSource === OVERRIDE_SOURCE;
  const isPending = selected.status === "PENDING";
  const others = pending.filter((c) => c.id !== selected.id);

  return (
    <>
      <AdminPageHeader
        title="Conflito de broadcast"
        subtitle={`${selected.titleSnapshot} · AniList #${selected.anilistId} · episódio ${selected.episode} · campo horário de exibição`}
      />
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        {isPending ? (
          <SmallChip tone="warning" icon={<WarningAmberOutlinedIcon />}>
            Pendente{selected.jobSeq ? ` · lote #${selected.jobSeq}` : ""}
          </SmallChip>
        ) : (
          <SmallChip tone="success" icon={<CheckCircleOutlinedIcon />}>
            Resolvido · {selected.resolution === "A" ? "fonte A" : selected.resolution === "B" ? "fonte B" : "manual"}
          </SmallChip>
        )}
        {others.length > 0 && (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }} data-testid="conflicts-others">
            + {others.length} {others.length === 1 ? "outro conflito pendente" : "outros conflitos pendentes"}:{" "}
            {others.slice(0, 5).map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <a href={`/admin/conflitos?id=${c.id}`} style={{ color: "inherit" }}>
                  {c.titleSnapshot} EP{c.episode}
                </a>
              </span>
            ))}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 3 }}>
        <SourcePanel label="Fonte A" source={selected.aSource} value={selected.aValue} timeZone={timeZone} meta={[`Broadcast origem · ${selected.aValue.toISOString()}`, "Cache do calendário (AniList)"]} />
        <SourcePanel
          label="Fonte B"
          source={`${selected.bSource}${bMeta.sourceKey ? ` #${bMeta.sourceKey}` : ""}`}
          value={selected.bValue}
          timeZone={timeZone}
          meta={
            overrideConflict
              ? [`Override de ${bMeta.overrideBy ?? "admin"}${bMeta.overrideReason ? ` · ${bMeta.overrideReason}` : ""}`, ...(bMeta.previousSourceValue ? [`Valor da fonte quando o override foi feito · ${fmtFull(new Date(bMeta.previousSourceValue), timeZone)}`] : [])]
              : [`Broadcast origem · ${selected.bValue.toISOString()}`, ...(bMeta.capturedAt ? [`Captura · ${fmtFull(new Date(bMeta.capturedAt), timeZone)}`] : []), ...(bMeta.parserVersion ? [`ParserVersion · ${bMeta.parserVersion}`] : []), "HTML colado"]
          }
        />
      </Box>
      {overrideConflict && isPending && (
        <Notice tone="warning" title="A fonte mudou depois do override" testId="conflict-override-note">
          O horário manual foi definido sobre um valor que a AniList já trocou. Até a decisão, o calendário continua usando o override. &quot;Usar fonte A&quot; tira o override; &quot;fonte B&quot; mantém o horário manual.
        </Notice>
      )}

      {isPending ? (
        <ConflictActions
          conflictId={selected.id}
          aSource={selected.aSource}
          bSource={selected.bSource}
          initialLocal={toLocalInput(selected.aValue, timeZone)}
          timeZone={timeZone}
        />
      ) : (
        <Notice
          tone="success"
          title={`Variante resolvida · ${selected.resolution === "A" ? "fonte A mantida" : selected.resolution === "B" ? "fonte B escolhida" : "valor definido manualmente"}`}
          testId="conflict-resolved"
        >
          Horário definido: <span suppressHydrationWarning>{selected.resolvedValue ? fmtWeekdayClock(selected.resolvedValue, timeZone) : "—"}</span> · {selected.decidedByName ?? "admin"} ·{" "}
          <span suppressHydrationWarning>{selected.decidedAt ? fmtFull(selected.decidedAt, timeZone) : ""}</span>
          {selected.reason ? ` · motivo: ${selected.reason}` : ""}. Fontes A e B preservadas no registro; a notificação DATA ALTERADA é preparada após o commit.
        </Notice>
      )}

      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>A decisão reduz a pendência e volta à revisão do lote.</Typography>
      {selected.jobSeq && (
        <Box>
          <AdminButtonLink href={`/admin/importacoes/${selected.jobSeq}`}>Voltar à revisão do lote #{selected.jobSeq}</AdminButtonLink>
        </Box>
      )}
    </>
  );
}

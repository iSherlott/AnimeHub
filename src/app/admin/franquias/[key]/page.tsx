import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel } from "@/components/admin/AdminUi";
import { FranchiseOrderEditor, FranchiseUndoButton } from "@/components/admin/FranchiseOrderEditor";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";
import { ISSUE_LABELS, type IssueCode } from "@/lib/curation/issues";
import { loadFranchise, TIMELINE_ROLES } from "@/lib/franchiseAdmin";

export const dynamic = "force-dynamic";

/** Admin → Franquias → franquia (Fase 7): ordem, papel e temporada das obras, relações suspeitas e desfazer. */
export default async function AdminFranchisePage({ params }: { params: Promise<{ key: string }> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const key = Number((await params).key);
  if (!Number.isInteger(key)) notFound();
  const { works, issues, batches } = await loadFranchise(key);
  if (works.length === 0) notFound();
  const root = works.find((w) => w.anilistId === key) ?? works[0];
  const titleById = new Map(works.map((w) => [w.id, w.titleNative ?? w.titleRomaji]));
  return (
    <>
      <AdminPageHeader title={root.titleNative ?? root.titleRomaji} subtitle={`Franquia ${key} · ${works.length} obra(s). A ordem salva aqui fica protegida contra a auditoria automática.`} action={<AdminButtonLink href="/admin/franquias">Todas as franquias</AdminButtonLink>} />
      {issues.length > 0 && (
        <AdminPanel title="Relações suspeitas" testId="franchise-issues">
          <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 14 }}>
            {issues.map((i) => (
              <li key={i.id}>{`${titleById.get(i.entryId) ?? "?"}: ${ISSUE_LABELS[i.code as IssueCode]?.title ?? i.code}${i.detail ? ` — ${i.detail}` : ""}`}</li>
            ))}
          </Box>
        </AdminPanel>
      )}
      <AdminPanel title="Ordem da linha do tempo" testId="franchise-editor">
        <FranchiseOrderEditor
          franchiseKey={key}
          roles={TIMELINE_ROLES}
          works={works.map((w) => ({ id: w.id, title: w.titleNative ?? w.titleRomaji, year: w.seasonYear ?? w.startDate?.getUTCFullYear() ?? null, kind: w.kind ?? w.format, role: w.timelineRole === "MAIN" || w.timelineRole === "RELATED" ? w.timelineRole : "SPECIAL", season: w.timelineSeason, manual: w.manualFields.includes("timelineOrder") }))}
        />
      </AdminPanel>
      <AdminPanel title="Salvamentos recentes" testId="franchise-batches">
        {batches.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>A ordem é a da auditoria automática; nada foi definido à mão.</Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, pl: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}>
            {batches.map((b) => (
              <Box component="li" key={b.batchId} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
                <span suppressHydrationWarning>{`${b.at ? fmtFull(b.at, timeZone) : ""} · ${b.changes} alteração(ões)${b.batchId.endsWith("-desfazer") ? " · desfazer" : ""}`}</span>
                {!b.batchId.endsWith("-desfazer") && <FranchiseUndoButton franchiseKey={key} batchId={b.batchId} />}
              </Box>
            ))}
          </Box>
        )}
      </AdminPanel>
    </>
  );
}

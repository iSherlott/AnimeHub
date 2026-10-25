import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined";
import { Box, Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPager } from "@/components/admin/AdminPager";
import { AdminPageHeader, AdminPanel, StatCard, StatGrid } from "@/components/admin/AdminUi";
import { TranslationRow } from "@/components/admin/TranslationRow";
import { EmptyState } from "@/components/StatePanels";
import { requireAdminPage } from "@/lib/adminPage";
import { listTranslations, TRANSLATION_STATES, TRANSLATIONS_PAGE_SIZE, translationCounts, type TranslationState } from "@/lib/translations";

export const dynamic = "force-dynamic";

/**
 * Admin → Traduções (Fase 7, §13): sinopses em português por estado — ausente, pendente, automática, revisada, manual —
 * com o original ao lado; títulos e leituras japonesas que faltam. Nada é inventado: sem original, não há o que traduzir.
 */
export default async function AdminTranslationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("catalog");
  const sp = await searchParams;
  const estado = (sp.estado && sp.estado in TRANSLATION_STATES ? sp.estado : "automatica") as TranslationState;
  const q = (sp.q ?? "").slice(0, 80);
  const pagina = Math.max(0, Number(sp.pagina) || 0);
  const [list, counts, titles] = await Promise.all([
    listTranslations({ estado, q, pagina }),
    translationCounts(),
    prisma.$queryRaw<Array<{ semja: bigint; semen: bigint; semleitura: bigint }>>`
      SELECT
        COUNT(*) FILTER (WHERE c."titleNative" IS NULL) AS semja,
        COUNT(*) FILTER (WHERE c."titleEnglish" IS NULL) AS semen,
        COUNT(*) FILTER (WHERE c."titleNative" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TitleReading" t WHERE t."text" = c."titleNative")) AS semleitura
      FROM "CatalogEntry" c WHERE c."onPlatform" = true`,
  ]);
  const t = titles[0];
  const params = Object.fromEntries(Object.entries({ estado: estado === "automatica" ? "" : estado, q }).filter(([, v]) => v)) as Record<string, string>;
  return (
    <>
      <AdminPageHeader title="Traduções" subtitle="Sinopses em português (automáticas, revisadas e manuais) e títulos japoneses. Revisada e manual ficam protegidas contra a tradução automática." action={<AdminButtonLink href={`/api/admin/translations?estado=${estado}&formato=csv`}>Exportar este estado (CSV)</AdminButtonLink>} />
      <StatGrid>
        {(Object.keys(TRANSLATION_STATES) as TranslationState[]).map((s) => (
          <StatCard key={s} testId={`translation-count-${s}`} label={TRANSLATION_STATES[s]} value={counts[s].toLocaleString("pt-BR")} hint={<AdminButtonLink href={`/admin/traducoes?estado=${s}`}>Ver</AdminButtonLink>} />
        ))}
      </StatGrid>
      <AdminPanel title="Títulos e leituras" testId="translation-titles">
        <Typography sx={{ fontSize: 14 }}>
          Sem título japonês: {Number(t.semja).toLocaleString("pt-BR")} · sem título internacional: {Number(t.semen).toLocaleString("pt-BR")} · título japonês sem leitura em kana guardada: {Number(t.semleitura).toLocaleString("pt-BR")} (a leitura é gerada na primeira exibição).
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <AdminButtonLink href="/admin/obras?qualidade=sem-titulo-ja">Obras sem título japonês</AdminButtonLink>
        </Box>
      </AdminPanel>
      <AdminFilters fields={[{ kind: "search", name: "q", label: "Buscar", placeholder: "Título", value: q }, { kind: "select", name: "estado", label: "Estado", value: estado === "automatica" ? "" : estado, width: 180, options: [{ value: "", label: TRANSLATION_STATES.automatica }, ...(Object.keys(TRANSLATION_STATES) as TranslationState[]).filter((s) => s !== "automatica").map((s) => ({ value: s, label: TRANSLATION_STATES[s] }))] }]} />
      {list.rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="translations-empty" icon={<TranslateOutlinedIcon />} title="Nada neste estado.">
            Escolha outro estado ou busque outro título.
          </EmptyState>
        </AdminPanel>
      ) : (
        <>
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1.5 }} data-testid="translations-list">
            {list.rows.map((r) => (
              <TranslationRow key={r.id} id={r.id} title={r.titleNative ?? r.titleRomaji} original={r.original} pt={r.descriptionPt} state={r.state} source={r.descriptionPtSource} reviewedBy={r.descriptionPtReviewedBy} />
            ))}
          </Box>
          <AdminPager basePath="/admin/traducoes" params={params} page={list.page} pages={list.pages} total={list.total} pageSize={TRANSLATIONS_PAGE_SIZE} />
        </>
      )}
    </>
  );
}

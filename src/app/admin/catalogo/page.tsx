import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import { Box, Typography } from "@mui/material";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminCatalogTable } from "@/components/admin/AdminCatalogTable";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPageHeader, AdminPanel, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { ADMIN_CATALOG_FORMATS, loadAdminCatalogPage, parseAdminCatalogFilters } from "@/lib/adminCatalog";
import { requireAdminPage } from "@/lib/adminPage";
import { CATALOG_STATUS_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special", MUSIC: "Music" };

/**
 * Admin → Catálogo (Figma `8:3603`): franquias únicas, produções, temporadas e
 * fontes rastreáveis. "TV / Movie / OVA / Special são distintos"; o sufixo de
 * temporada pertence à produção, não gera uma nova franquia. Somente leitura —
 * mudanças entram por Importações → Matching → Conflitos → Overrides.
 * A tabela rola sem fim: a primeira página vem pronta e as seguintes chegam ao descer.
 */
export default async function AdminCatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage("catalog");
  const filters = parseAdminCatalogFilters(await searchParams);
  const { q, tipo, status, fonte } = filters;

  const { rows, productionCount, entryCount, franchiseCount, nextCursor } = await loadAdminCatalogPage(filters, 0);
  const query = new URLSearchParams(Object.entries({ q, tipo, status, fonte }).filter(([, value]) => value)).toString();

  return (
    <>
      <AdminPageHeader
        title="Catálogo"
        subtitle="Franquias únicas. Produções, temporadas e fontes rastreáveis."
        action={
          <AdminButtonLink href="/admin/importacoes" icon={<FileDownloadOutlinedIcon />}>
            Importar temporada
          </AdminButtonLink>
        }
      />
      <AdminFilters
        fields={[
          { kind: "search", name: "q", label: "Buscar título / identificador", placeholder: "Buscar no catálogo…", value: q },
          { kind: "select", name: "tipo", label: "Tipo", value: tipo, options: [{ value: "", label: "Todos" }, ...ADMIN_CATALOG_FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))] },
          { kind: "select", name: "status", label: "Status", value: status, options: [{ value: "", label: "Todos" }, ...Object.entries(CATALOG_STATUS_LABELS).map(([value, label]) => ({ value, label }))] },
          { kind: "select", name: "fonte", label: "Fonte", value: fonte, options: [{ value: "", label: "Todas" }, { value: "anilist", label: "AniList" }, { value: "anidb", label: "AniDB" }] },
        ]}
      />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography data-testid="admin-catalog-count" sx={{ fontSize: 16, color: "text.secondary" }}>
          {productionCount} {productionCount === 1 ? "produção" : "produções"} · {entryCount} {entryCount === 1 ? "obra" : "obras"} só no catálogo · {franchiseCount} {franchiseCount === 1 ? "franquia" : "franquias"}
        </Typography>
        <SmallChip>TV / Movie / OVA / Special são distintos</SmallChip>
      </Box>

      {rows.length === 0 ? (
        <AdminPanel>
          <EmptyState testId="admin-catalog-empty" icon={<LibraryBooksOutlinedIcon />} title="Nenhuma produção encontrada.">
            Ajuste a busca ou os filtros. O catálogo é preenchido sob demanda pelas páginas de obra e pelas importações revisadas.
          </EmptyState>
        </AdminPanel>
      ) : (
        <AdminCatalogTable key={query} initialRows={rows} initialCursor={nextCursor} query={query} />
      )}

      <AdminPanel title="Modelo de identidade">
        <Typography sx={{ fontSize: 16 }}>
          Uma Franquia reúne várias Produções (Season 1, Season 2, Movie, OVA). O sufixo de temporada pertence à produção, não gera uma nova franquia.
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Cancelado permanece auditável, mas nunca aparece como lançamento ativo. Mudanças só por Importações, Conflitos e Overrides.
        </Typography>
      </AdminPanel>
    </>
  );
}

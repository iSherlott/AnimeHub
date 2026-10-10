import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import { Box, Typography } from "@mui/material";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminFilters } from "@/components/admin/AdminFilters";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { EmptyState } from "@/components/StatePanels";
import { requireAdminPage } from "@/lib/adminPage";
import { CATALOG_STATUS_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const FORMATS = ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"];
const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special", MUSIC: "Music" };

type Row = {
  key: string;
  production: string;
  franchise: string;
  titles: string[];
  native: string | null;
  format: string | null;
  status: string | null;
  source: string;
  identifier: string;
};

/**
 * Admin → Catálogo (Figma `8:3603`): franquias únicas, produções, temporadas e
 * fontes rastreáveis. "TV / Movie / OVA / Special são distintos"; o sufixo de
 * temporada pertence à produção, não gera uma nova franquia. Somente leitura —
 * mudanças entram por Importações → Matching → Conflitos → Overrides.
 */
export default async function AdminCatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const tipo = FORMATS.includes(sp.tipo ?? "") ? (sp.tipo as string) : "";
  const status = Object.keys(CATALOG_STATUS_LABELS).includes(sp.status ?? "") ? (sp.status as string) : "";
  const fonte = sp.fonte === "anidb" || sp.fonte === "anilist" ? sp.fonte : "";
  const page = Math.max(0, Number(sp.page) || 0);
  const asId = /^\d{1,9}$/.test(q) ? Number(q) : null;

  const where: Prisma.ProductionWhereInput = {
    ...(tipo ? { format: tipo } : {}),
    ...(status ? { status } : {}),
    ...(fonte === "anidb" ? { anidbId: { not: null } } : {}),
    ...(q
      ? {
          OR: [
            { titleRomaji: { contains: q, mode: "insensitive" } },
            { titleEnglish: { contains: q, mode: "insensitive" } },
            { titleNative: { contains: q, mode: "insensitive" } },
            { franchise: { name: { contains: q, mode: "insensitive" } } },
            ...(asId !== null ? [{ anilistId: asId }, { anidbId: asId }] : []),
          ],
        }
      : {}),
  };

  // Obras do catálogo (AniList/AniDB) que ainda não têm produção: aparecem depois das produções.
  const producedIds = (await prisma.production.findMany({ select: { anilistId: true } })).map((p) => p.anilistId);
  const [total, productions, entries, franchiseCount] = await Promise.all([
    prisma.production.count({ where }),
    prisma.production.findMany({ where, orderBy: [{ titleRomaji: "asc" }, { id: "asc" }], skip: page * PAGE_SIZE, take: PAGE_SIZE, include: { franchise: true } }),
    // Entradas do catálogo sem produção: temporada da AniList (ainda sem página) e obras criadas por importação (AniDB).
    tipo
      ? Promise.resolve([])
      : prisma.catalogEntry.findMany({
          where: {
            ...(fonte ? { source: fonte } : {}),
            ...(status ? { status } : {}),
            AND: [
              // `NOT IN` descartaria as obras sem anilistId (NULL): elas são justamente as criadas só pelo AniDB.
              { OR: [{ anilistId: null }, { anilistId: { notIn: producedIds } }] },
              ...(q ? [{ OR: [{ titleRomaji: { contains: q, mode: "insensitive" as const } }, { titleNative: { contains: q, mode: "insensitive" as const } }, { titleEnglish: { contains: q, mode: "insensitive" as const } }] }] : []),
            ],
          },
          orderBy: { titleRomaji: "asc" },
          take: 60,
        }),
    prisma.franchise.count(),
  ]);

  const rows: Row[] = [
    ...productions.map((p) => ({
      key: `p-${p.id}`,
      production: p.format === "MOVIE" ? "Feature film" : p.format === "OVA" ? `OVA ${p.seasonNumber}` : p.format === "SPECIAL" ? "Special" : `Season ${p.seasonNumber}`,
      franchise: `${p.franchise.name} · Franquia ${p.franchise.id.slice(-4).toUpperCase()}`,
      titles: [p.titleRomaji, p.titleEnglish].filter((t): t is string => Boolean(t) && t !== p.titleNative),
      native: p.titleNative,
      format: p.format,
      status: p.status,
      source: p.anidbId ? `AniDB #${p.anidbId}` : `AniList #${p.anilistId}`,
      identifier: `Production #${p.id.slice(-6).toUpperCase()}`,
    })),
    ...entries.map((e) => ({
      key: `e-${e.id}`,
      production: "Sem produção",
      franchise: e.source === "anidb" ? "Aguarda criação de produção" : "Catálogo da temporada · página criada ao abrir",
      titles: [e.titleRomaji, e.titleEnglish].filter((t): t is string => Boolean(t) && t !== e.titleNative),
      native: e.titleNative,
      format: null,
      status: e.status,
      source: e.anilistId ? `AniList #${e.anilistId}` : `AniDB #${e.anidbId}`,
      identifier: e.source === "anidb" ? "Importação revisada" : "Catálogo da temporada",
    })),
  ];

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tipo) params.set("tipo", tipo);
    if (status) params.set("status", status);
    if (fonte) params.set("fonte", fonte);
    if (p > 0) params.set("page", String(p));
    const qs = params.toString();
    return `/admin/catalogo${qs ? `?${qs}` : ""}`;
  };

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
          { kind: "select", name: "tipo", label: "Tipo", value: tipo, options: [{ value: "", label: "Todos" }, ...FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))] },
          { kind: "select", name: "status", label: "Status", value: status, options: [{ value: "", label: "Todos" }, ...Object.entries(CATALOG_STATUS_LABELS).map(([value, label]) => ({ value, label }))] },
          { kind: "select", name: "fonte", label: "Fonte", value: fonte, options: [{ value: "", label: "Todas" }, { value: "anilist", label: "AniList" }, { value: "anidb", label: "AniDB" }] },
        ]}
      />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography data-testid="admin-catalog-count" sx={{ fontSize: 16, color: "text.secondary" }}>
          {total} {total === 1 ? "produção" : "produções"} · {franchiseCount} {franchiseCount === 1 ? "franquia" : "franquias"}
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
        <AdminTable
          caption="Produções do catálogo"
          testId="admin-catalog-table"
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            {
              key: "p",
              label: "Produção / Franquia",
              render: (r) => (
                <>
                  <div>{r.production}</div>
                  <div>{r.franchise}</div>
                </>
              ),
            },
            {
              key: "t",
              label: "Títulos",
              render: (r) => (
                <>
                  {r.native && <div lang="ja">{r.native}</div>}
                  {r.titles.map((t) => (
                    <div key={t}>{t}</div>
                  ))}
                </>
              ),
            },
            {
              key: "s",
              label: "Tipo / Status",
              render: (r) => (
                <>
                  <div>{r.format ? (FORMAT_LABEL[r.format] ?? r.format) : "—"}</div>
                  <div>{r.status ? (CATALOG_STATUS_LABELS[r.status] ?? r.status) : "Data desconhecida"}</div>
                </>
              ),
            },
            {
              key: "f",
              label: "Fonte / Identificador",
              render: (r) => (
                <>
                  <div>{r.source}</div>
                  <div>{r.identifier}</div>
                </>
              ),
            },
          ]}
        />
      )}

      {total > PAGE_SIZE && (
        <Box component="nav" aria-label="Paginação" sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          {page > 0 && <AdminButtonLink href={href(page - 1)}>Anterior</AdminButtonLink>}
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            Página {page + 1} de {lastPage + 1}
          </Typography>
          {page < lastPage && <AdminButtonLink href={href(page + 1)}>Próxima</AdminButtonLink>}
        </Box>
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

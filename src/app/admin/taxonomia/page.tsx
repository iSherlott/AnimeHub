import { Box, Typography } from "@mui/material";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { GenreCreateForm } from "@/components/admin/GenreActions";
import { requireAdminPage } from "@/lib/adminPage";
import { listGenres, type GenreRow } from "@/lib/genres";

export const dynamic = "force-dynamic";

const TONE: Record<GenreRow["state"], "success" | "warning" | "neutral"> = { ativo: "success", "não registrado": "warning", mesclado: "neutral", excluído: "neutral" };

/**
 * Admin → Taxonomia (Fase 7, §12): o vocabulário de gêneros. O banco aplica o vocabulário em toda gravação, então
 * renomear, mesclar e excluir aqui vale para o catálogo inteiro e para o que as importações trouxerem depois.
 */
export default async function AdminTaxonomyPage() {
  await requireAdminPage("catalog");
  const genres = await listGenres();
  const unregistered = genres.filter((g) => g.state === "não registrado");
  const duplicates = genres.filter((g) => g.similar.length > 0);
  return (
    <>
      <AdminPageHeader title="Taxonomia" subtitle="Gêneros da plataforma: quantas obras cada um tem, variações de escrita, duplicidades e o que foi mesclado ou excluído." />
      {(unregistered.length > 0 || duplicates.length > 0) && (
        <AdminPanel title="Para revisar" testId="taxonomy-review">
          {unregistered.length > 0 && <Typography sx={{ fontSize: 14 }}>{`Não registrados (apareceram em obras sem estar no vocabulário): ${unregistered.map((g) => g.key).join(", ")}`}</Typography>}
          {duplicates.length > 0 && <Typography sx={{ fontSize: 14 }}>{`Possíveis duplicidades: ${duplicates.map((g) => `${g.key} ≈ ${g.similar.join("/")}`).join(" · ")}`}</Typography>}
        </AdminPanel>
      )}
      <AdminPanel title="Novo gênero" testId="taxonomy-create">
        <GenreCreateForm />
      </AdminPanel>
      <AdminTable<GenreRow>
        caption={`Gêneros (${genres.length})`}
        testId="taxonomy-table"
        rows={genres}
        rowKey={(g) => g.key}
        columns={[
          { key: "k", label: "Gênero", render: (g) => <AdminButtonLink href={`/admin/taxonomia/${encodeURIComponent(g.key)}`}><span data-testid={`genre-link-${g.key}`}>{g.label !== g.key ? `${g.label} (${g.key})` : g.key}</span></AdminButtonLink> },
          { key: "n", label: "Obras (plataforma · total)", render: (g) => <span data-testid={`genre-count-${g.key}`}>{`${g.onPlatform} · ${g.works}`}</span> },
          { key: "a", label: "Variações", render: (g) => g.aliases.join(", ") || "—" },
          {
            key: "s",
            label: "Estado",
            render: (g) => (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                <SmallChip tone={TONE[g.state]}>{g.state === "mesclado" ? `mesclado em ${g.mergedInto}` : g.state}</SmallChip>
                {g.adult && <SmallChip tone="warning">+18</SmallChip>}
              </Box>
            ),
          },
        ]}
      />
    </>
  );
}

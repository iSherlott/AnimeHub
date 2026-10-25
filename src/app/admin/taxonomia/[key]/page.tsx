import { notFound } from "next/navigation";
import { Typography } from "@mui/material";
import { prisma } from "@/lib/prisma";
import { AdminButtonLink } from "@/components/admin/AdminButtonLink";
import { AdminPageHeader, AdminPanel, AdminTable, SmallChip } from "@/components/admin/AdminUi";
import { GenreActions } from "@/components/admin/GenreActions";
import { fmtFull, requireAdminPage } from "@/lib/adminPage";
import { changeHistory } from "@/lib/changeLog";
import { activeGenreKeys, genreState, genreWorks } from "@/lib/genres";

export const dynamic = "force-dynamic";

const value = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") || "—" : String(v));

/** Admin → Taxonomia → gênero (Fase 7): obras relacionadas, edição, renomear, mesclar, excluir e histórico. */
export default async function AdminGenrePage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { timeZone } = await requireAdminPage("catalog");
  const key = decodeURIComponent((await params).key);
  const genre = await prisma.genre.findUnique({ where: { key } });
  if (!genre) notFound();
  const page = Math.max(0, Number((await searchParams).pagina) || 0);
  const [works, history, targets] = await Promise.all([genreWorks(key, page), changeHistory({ entity: "Genre", entityId: key }, 0, 50), activeGenreKeys()]);
  const state = genreState(genre);
  return (
    <>
      <AdminPageHeader title={genre.label} subtitle={`Chave gravada nas obras: ${genre.key}${genre.description ? ` · ${genre.description}` : ""}`} action={<AdminButtonLink href="/admin/taxonomia">Todos os gêneros</AdminButtonLink>} />
      <SmallChip tone={state === "ativo" ? "success" : "warning"}>{state === "mesclado" ? `mesclado em ${genre.mergedInto}` : state}</SmallChip>
      <AdminPanel title="Gerenciar" testId="genre-manage">
        <GenreActions genreKey={genre.key} label={genre.label} description={genre.description} aliases={genre.aliases} adult={genre.adult} works={works.total} targets={targets.filter((t) => t !== genre.key)} editable={state === "ativo" || state === "não registrado"} />
      </AdminPanel>
      <AdminPanel title={`Obras com este gênero (${works.total})`} testId="genre-works">
        {works.rows.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma.</Typography>
        ) : (
          <AdminTable
            caption="Obras"
            rows={works.rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "t", label: "Obra", render: (r) => <AdminButtonLink href={`/admin/obras/${r.id}`}>{r.titleNative ?? r.titleRomaji}</AdminButtonLink> },
              { key: "g", label: "Gêneros", render: (r) => r.genres ?? "—" },
              { key: "p", label: "Plataforma", render: (r) => (r.onPlatform ? "sim" : "cache") },
            ]}
          />
        )}
        {(page + 1) * 50 < works.total && <AdminButtonLink href={`/admin/taxonomia/${encodeURIComponent(key)}?pagina=${page + 1}`}>Mais obras</AdminButtonLink>}
      </AdminPanel>
      <AdminPanel title="Histórico" testId="genre-history">
        {history.rows.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Sem alterações registradas.</Typography>
        ) : (
          <AdminTable
            caption="Alterações"
            rows={history.rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "t", label: "Quando", render: (r) => <span suppressHydrationWarning>{fmtFull(new Date(r.at), timeZone)}</span> },
              { key: "a", label: "Quem", render: (r) => r.actorName ?? "—" },
              { key: "f", label: "Campo", render: (r) => r.field },
              { key: "b", label: "Antes", render: (r) => value(r.before) },
              { key: "d", label: "Depois", render: (r) => value(r.after) },
              { key: "m", label: "Motivo", render: (r) => r.reason ?? "—" },
            ]}
          />
        )}
      </AdminPanel>
    </>
  );
}

import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ScrapForm } from "@/components/profile/ProfileOrkut";
import { ProfileSection, ScrapList } from "@/components/profile/ProfileSections";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { blockRelation } from "@/lib/blocks";
import { listScraps, SCRAPS_PAGE } from "@/lib/profileOrkut";
import { loginHref } from "@/lib/safeRedirect";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> };

/** Todos os recados do perfil (o "scrapbook" do Orkut), 20 por página. */
export default async function ScrapbookPage({ params, searchParams }: Props) {
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { displayName: true } });
  if (!target) notFound();
  const viewer = await getCurrentUser();
  if ((await blockRelation(viewer?.id ?? null, id)) !== "none") notFound();
  const page = Math.max(0, Number((await searchParams).page) || 0);
  const { total, rows } = await listScraps(id, page, viewer?.id ?? null);
  const pages = Math.max(1, Math.ceil(total / SCRAPS_PAGE));
  const own = viewer?.id === id;

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="プロフィール / PERFIL" title={own ? "Meus recados" : `Recados de ${target.displayName}`} subtitle={`${total} ${total === 1 ? "recado" : "recados"}`} />
        <AppLink href={`/users/${id}#recados`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← {own ? "Meu perfil" : `Perfil de ${target.displayName}`}
        </AppLink>
        <ProfileSection id="recados" title="recados" count={total} testId="scrapbook">
          {viewer ? (
            <ScrapForm userId={id} />
          ) : (
            <Typography sx={{ fontSize: 14 }}>
              <AppLink href={loginHref(`/users/${id}/recados`)}>Entre</AppLink> para deixar um recado.
            </Typography>
          )}
          <ScrapList scraps={rows} viewerId={viewer?.id ?? null} canModerate={can(viewer?.role, "moderation")} empty="Nenhum recado ainda." />
          {pages > 1 && (
            <Box component="nav" aria-label="Páginas de recados" sx={{ display: "flex", justifyContent: "space-between", gap: 2, fontSize: 14 }}>
              {page > 0 ? <AppLink href={`/users/${id}/recados?page=${page - 1}`}>← Mais recentes</AppLink> : <span />}
              <Typography component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
                Página {page + 1} de {pages}
              </Typography>
              {page + 1 < pages ? <AppLink href={`/users/${id}/recados?page=${page + 1}`}>Mais antigos →</AppLink> : <span />}
            </Box>
          )}
        </ProfileSection>
      </PageContainer>
    </Box>
  );
}

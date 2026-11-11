import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { TierListBoard } from "@/components/TierListBoard";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { profileTierLists } from "@/lib/profileTierLists";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tier list · Anime Hub" };

type Props = { params: Promise<{ id: string; season: string }> };

/** Uma tier list do perfil (12/11/2026): o quadro publicado daquela temporada e o caminho para a discussão no Feed. */
export default async function ProfileTierListPage({ params }: Props) {
  const { id, season } = await params;
  const [viewer, owner] = await Promise.all([getCurrentUser(), prisma.user.findUnique({ where: { id }, select: { id: true, displayName: true } })]);
  if (!owner) notFound();
  const list = (await profileTierLists(id)).find((l) => l.slug === season);
  if (!list) notFound();
  const own = viewer?.id === owner.id;
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="ランキング / TIER LIST" title={`Tier list · ${list.label}`} subtitle={own ? "A sua tier list, como saiu no Feed." : `A tier list de ${owner.displayName}, como saiu no Feed.`} />
        <AppLink href={`/users/${owner.id}#tier-lists`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Perfil de {owner.displayName.split(" ")[0]}
        </AppLink>
        <Box data-testid="profile-tier-list-board" sx={{ maxWidth: 960 }}>
          <TierListBoard snapshot={list.snapshot} />
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <LinkButton href={`/publicacao/${list.postId}`} variant="contained">
            Ver a discussão no Feed
          </LinkButton>
          {own && (
            <LinkButton href={`/tier-list?temporada=${list.slug}`} variant="outlined">
              Mexer e publicar de novo
            </LinkButton>
          )}
        </Box>
      </PageContainer>
    </Box>
  );
}

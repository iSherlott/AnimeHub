import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { ListCompareView } from "@/components/ListCompareView";
import { AppLink } from "@/components/AppLink";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { prisma } from "@/lib/prisma";
import { compareLists } from "@/lib/listCompare";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comparar listas · Anime Hub" };

type Props = { params: Promise<{ id: string }> };

/** Comparar listas com outra pessoa, lado a lado (12/11/2026). Ver src/lib/listCompare.ts. */
export default async function ComparePage({ params }: Props) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect(loginHref(`/comparar/${id}`));
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, displayName: true } });
  if (!target) notFound();
  const result = await compareLists(viewer.id, target.id);
  if (result.kind === "self") redirect(`/users/${id}`);
  const firstName = target.displayName.split(" ")[0];
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="比較 / COMPARAR"
          title={`Você e ${target.displayName}`}
          subtitle={result.kind === "ok" && result.percent !== null ? `${result.percent}% de gosto em comum. As notas mais diferentes aparecem primeiro.` : "As listas de vocês, lado a lado."}
        />
        <AppLink href={`/users/${target.id}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Perfil de {firstName}
        </AppLink>
        {result.kind === "hidden" ? (
          <Typography data-testid="compare-hidden" sx={{ color: "text.secondary" }}>
            {firstName} deixou a lista de animes escondida, então não dá para comparar.
          </Typography>
        ) : (
          <ListCompareView firstName={firstName} common={result.common} onlyMine={result.onlyMine} onlyTheirs={result.onlyTheirs} />
        )}
      </PageContainer>
    </Box>
  );
}

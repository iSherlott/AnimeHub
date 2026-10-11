import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box } from "@mui/material";
import { AchievementsView } from "@/components/AchievementsView";
import { AppLink } from "@/components/AppLink";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { listTitles } from "@/lib/quiz";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Minhas conquistas · Anime Hub" };

/** Minhas conquistas (Figma "19 — Perfil"): títulos desbloqueados nos quizzes, para equipar no perfil. Exige conta. */
export default async function AchievementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/conquistas"));
  const titles = await listTitles(user.id);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro
          kicker="会話 / COMUNIDADE"
          title="Minhas conquistas"
          subtitle="Títulos que você pode levar para o perfil. Uma conquista não registra seu consumo de anime."
        />
        <AppLink href={`/users/${user.id}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Meu perfil
        </AppLink>
        <Box component="nav" aria-label="Seções do perfil" sx={{ display: "flex", gap: 4, borderBottom: 1, borderColor: "divider" }}>
          {[
            { label: "Publicações", href: `/users/${user.id}` },
            { label: "Discussões iniciadas", href: `/users/${user.id}` },
          ].map((tab) => (
            <AppLink key={tab.label} href={tab.href} underline="none" sx={{ pt: 2, pb: 1.5, fontSize: 14, color: "text.secondary" }}>
              {tab.label}
            </AppLink>
          ))}
          <AppLink href="/conquistas" underline="none" aria-current="page" sx={{ pt: 2, pb: 1.5, fontSize: 14, fontWeight: 700, color: "text.primary", borderBottom: "2px solid", borderColor: "primary.main", mb: "-1px" }}>
            Minhas conquistas · {titles.length}
          </AppLink>
        </Box>
        <AchievementsView me={{ id: user.id, displayName: user.displayName, handle: user.handle, avatarUrl: user.avatarUrl }} initialTitles={titles} />
      </PageContainer>
    </Box>
  );
}

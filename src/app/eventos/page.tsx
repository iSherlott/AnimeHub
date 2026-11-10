import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { EventsAgenda } from "@/components/EventsAgenda";
import { getCurrentUser } from "@/lib/auth/session";
import { loginHref } from "@/lib/safeRedirect";
import { upcomingEvents } from "@/lib/animeEvents";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eventos de anime · Anime Hub" };

/** Agenda de eventos de anime (10/11/2026): convenções, estreias no cinema e lives, cadastrados pela administração. */
export default async function EventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/eventos"));
  const events = await upcomingEvents(user.id);
  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="イベント / EVENTOS" title="Eventos de anime" subtitle="Convenções, estreias no cinema e lives. Marque “Vou” para ver quem mais vai e receber um lembrete no dia." />
        <EventsAgenda initial={events} />
      </PageContainer>
    </Box>
  );
}

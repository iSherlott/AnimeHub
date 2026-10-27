import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Panel } from "@/components/community/CommunityParts";
import { EventCard, NewEventForm } from "@/components/community/CommunityPanels";
import { can } from "@/lib/auth/permissions";
import { listEvents } from "@/lib/community";
import { canonical, getCommunity, getScope, getViewer } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }> };

/** Eventos da comunidade (maratonas, estreias, encontros): os próximos e os que já passaram; quem participa marca presença. */
export default async function CommunityEvents({ params }: Props) {
  const { key } = await params;
  await canonical(key, "/eventos");
  const scope = await getScope(key);
  if (!scope) notFound();
  const [community, { user, member }] = await Promise.all([getCommunity(key), getViewer(key)]);
  const [upcoming, past] = community ? await Promise.all([listEvents(community.id, "upcoming", user?.id ?? null), listEvents(community.id, "past", user?.id ?? null, 10)]) : [[], []];
  const canModerate = Boolean(user && can(user.role, "moderation"));
  return (
    <>
      {member ? (
        <NewEventForm communityKey={scope.key} />
      ) : (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Participe da comunidade para criar eventos e confirmar presença.</Typography>
      )}
      <Panel title={`Próximos eventos (${upcoming.length})`} testId="community-events">
        {upcoming.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum evento marcado.</Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} canRsvp={member} canDelete={user?.id === e.author.id || canModerate} canReport={Boolean(user) && user?.id !== e.author.id} />
            ))}
          </Box>
        )}
      </Panel>
      {past.length > 0 && (
        <Panel title="Eventos que já passaram" testId="community-past-events">
          <Box component="ul" sx={{ m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            {past.map((e) => (
              <EventCard key={e.id} event={e} canRsvp={false} canDelete={canModerate} canReport={Boolean(user) && user?.id !== e.author.id} />
            ))}
          </Box>
        </Panel>
      )}
    </>
  );
}

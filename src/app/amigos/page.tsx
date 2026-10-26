import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { FriendButton } from "@/components/profile/ProfileOrkut";
import { PeopleGrid, ProfileSection } from "@/components/profile/ProfileSections";
import { getCurrentUser } from "@/lib/auth/session";
import { friendRequests, listFriends } from "@/lib/friends";
import { formatRelativeTime } from "@/lib/relativeTime";
import { loginHref } from "@/lib/safeRedirect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Amigos · Anime Hub" };

type Person = { id: string; displayName: string; handle: string | null; avatarUrl: string | null; at: Date };

function RequestRow({ person, state, testId }: { person: Person; state: "received" | "sent"; testId: string }) {
  return (
    <Box component="li" data-testid={testId} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, borderTop: 1, borderColor: "divider", flexWrap: "wrap", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
      <AppLink href={`/users/${person.id}`} aria-label={person.displayName}>
        <UserAvatar id={person.id} displayName={person.displayName} avatarUrl={person.avatarUrl} size={40} />
      </AppLink>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <AppLink href={`/users/${person.id}`} underline="hover" sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>
          {person.displayName}
        </AppLink>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {person.handle ? `@${person.handle} · ` : ""}
          {formatRelativeTime(person.at.toISOString())}
        </Typography>
      </Box>
      <FriendButton userId={person.id} initial={state} compact />
    </Box>
  );
}

/** Amigos (como no Orkut): pedidos recebidos para aceitar ou recusar, pedidos enviados e os amigos. Exige conta. */
export default async function FriendsHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/amigos"));
  const [{ received, sent }, friends] = await Promise.all([friendRequests(user.id), listFriends(user.id, user.id, 12)]);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="友達 / AMIGOS" title="Amigos" subtitle="Amizade é um pedido aceito. Amigos escrevem depoimentos e avaliam o perfil um do outro; seguir continua separado." />
        <AppLink href={`/users/${user.id}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Meu perfil
        </AppLink>
        <ProfileSection id="pedidos" title="pedidos recebidos" count={received.length} testId="friend-requests-received">
          {received.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum pedido esperando.</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
              {received.map((p) => (
                <RequestRow key={p.id} person={p} state="received" testId={`friend-request-${p.id}`} />
              ))}
            </Box>
          )}
        </ProfileSection>
        {sent.length > 0 && (
          <ProfileSection id="enviados" title="pedidos enviados" count={sent.length} testId="friend-requests-sent">
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
              {sent.map((p) => (
                <RequestRow key={p.id} person={p} state="sent" testId={`friend-sent-${p.id}`} />
              ))}
            </Box>
          </ProfileSection>
        )}
        <ProfileSection id="amigos" title="meus amigos" count={friends.total} testId="my-friends" more={friends.total > friends.rows.length ? { href: `/users/${user.id}/amigos`, label: "ver todos" } : undefined}>
          {friends.rows.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ainda nenhum amigo. Abra um perfil e use “Adicionar como amigo”.</Typography>
          ) : (
            <Box sx={{ maxWidth: 560 }}>
              <PeopleGrid people={friends.rows} size={64} />
            </Box>
          )}
        </ProfileSection>
      </PageContainer>
    </Box>
  );
}

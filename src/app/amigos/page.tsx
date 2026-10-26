import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { FriendButton } from "@/components/profile/ProfileOrkut";
import { PeopleGrid, ProfileSection } from "@/components/profile/ProfileSections";
import { getCurrentUser } from "@/lib/auth/session";
import { friendRequests, friendSuggestions, listFriends, searchPeople, type PersonCard } from "@/lib/friends";
import { formatRelativeTime } from "@/lib/relativeTime";
import { loginHref } from "@/lib/safeRedirect";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Amigos · Anime Hub" };

type Person = { id: string; displayName: string; handle: string | null; avatarUrl: string | null };

/** Uma pessoa com o botão de amizade no estado certo; `detail` vai abaixo do nome (quando, ou o que há em comum). */
function PersonRow({ person, state, detail, testId }: { person: Person; state: PersonCard["state"]; detail: string | null; testId: string }) {
  return (
    <Box component="li" data-testid={testId} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, borderTop: 1, borderColor: "divider", flexWrap: "wrap", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
      <AppLink href={`/users/${person.id}`} aria-label={person.displayName}>
        <UserAvatar id={person.id} displayName={person.displayName} avatarUrl={person.avatarUrl} size={40} />
      </AppLink>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <AppLink href={`/users/${person.id}`} underline="hover" sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>
          {person.displayName}
        </AppLink>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{[person.handle ? `@${person.handle}` : null, detail].filter(Boolean).join(" · ")}</Typography>
      </Box>
      <FriendButton userId={person.id} initial={state} compact />
    </Box>
  );
}

/**
 * Amigos (como no Orkut): encontrar pessoas (busca por nome ou @identificador), pedidos recebidos para aceitar ou
 * recusar, sugestões (comunidades e animes em comum), pedidos enviados e os amigos. Exige conta.
 */
export default async function FriendsHomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/amigos"));
  const query = ((await searchParams).q ?? "").trim().slice(0, 60);
  const [{ received, sent }, friends, results, suggestions] = await Promise.all([
    friendRequests(user.id),
    listFriends(user.id, user.id, 12),
    query ? searchPeople(user.id, query) : Promise.resolve(null),
    friendSuggestions(user.id),
  ]);

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="友達 / AMIGOS" title="Amigos" subtitle="Amizade é um pedido aceito. Amigos escrevem depoimentos e avaliam o perfil um do outro; seguir continua separado." />
        <AppLink href={`/users/${user.id}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Meu perfil
        </AppLink>
        <Box component="form" method="get" action="/amigos" role="search" aria-label="Encontrar pessoas" sx={{ display: "flex", gap: 1, alignItems: "center", maxWidth: 560 }}>
          <TextField name="q" defaultValue={query} size="small" fullWidth placeholder="Encontrar pessoas por nome ou @identificador" slotProps={{ htmlInput: { "aria-label": "Encontrar pessoas", maxLength: 60, "data-testid": "people-search-input" } }} />
          <Button type="submit" variant="contained" data-testid="people-search-submit">
            Buscar
          </Button>
        </Box>
        {results && (
          <ProfileSection id="busca" title={`resultados para “${query}”`} count={results.length} testId="people-results" more={{ href: "/amigos", label: "limpar" }}>
            {results.length === 0 ? (
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{query.replace(/^@/, "").length < 2 ? "Digite pelo menos 2 letras." : "Ninguém encontrado com esse nome ou identificador."}</Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                {results.map((p) => (
                  <PersonRow key={p.id} person={p} state={p.state} detail={null} testId={`person-${p.id}`} />
                ))}
              </Box>
            )}
          </ProfileSection>
        )}
        <ProfileSection id="pedidos" title="pedidos recebidos" count={received.length} testId="friend-requests-received">
          {received.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum pedido esperando.</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
              {received.map((p) => (
                <PersonRow key={p.id} person={p} state="received" detail={formatRelativeTime(p.at.toISOString())} testId={`friend-request-${p.id}`} />
              ))}
            </Box>
          )}
        </ProfileSection>
        <ProfileSection id="sugestoes" title="sugestões" count={suggestions.length} testId="friend-suggestions">
          {suggestions.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
              As sugestões vêm de quem participa das mesmas comunidades e acompanha os mesmos animes. <AppLink href="/comunidades">Entre numa comunidade</AppLink> para começar.
            </Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
              {suggestions.map((p) => (
                <PersonRow key={p.id} person={p} state={p.state} detail={p.detail} testId={`suggestion-${p.id}`} />
              ))}
            </Box>
          )}
        </ProfileSection>
        {sent.length > 0 && (
          <ProfileSection id="enviados" title="pedidos enviados" count={sent.length} testId="friend-requests-sent">
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
              {sent.map((p) => (
                <PersonRow key={p.id} person={p} state="sent" detail={formatRelativeTime(p.at.toISOString())} testId={`friend-sent-${p.id}`} />
              ))}
            </Box>
          </ProfileSection>
        )}
        <ProfileSection id="amigos" title="meus amigos" count={friends.total} testId="my-friends" more={friends.total > friends.rows.length ? { href: `/users/${user.id}/amigos`, label: "ver todos" } : undefined}>
          {friends.rows.length === 0 ? (
            <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ainda nenhum amigo. Busque pessoas acima ou veja as sugestões.</Typography>
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

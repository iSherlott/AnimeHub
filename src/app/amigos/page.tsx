import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { UserAvatar } from "@/components/UserAvatar";
import { FriendButton } from "@/components/profile/ProfileActions";
import { PeopleGrid, ProfileSection } from "@/components/profile/ProfileSections";
import { Pager } from "@/components/community/CommunityParts";
import { getCurrentUser } from "@/lib/auth/session";
import { friendRequests, friendSuggestions, listFriends, networkPeople, searchPeople, type PersonCard } from "@/lib/friends";
import { formatRelativeTime } from "@/lib/relativeTime";
import { formatBirthday, friendsBirthdays } from "@/lib/birthdays";
import { resolveTimeZone } from "@/lib/timeZone";
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

/** Lista de pessoas (busca, rede, pedidos, sugestões). */
function PeopleList({ people, testPrefix, fallbackState }: { people: Array<Person & { state?: PersonCard["state"]; detail?: string | null; at?: Date }>; testPrefix: string; fallbackState?: PersonCard["state"] }) {
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
      {people.map((p) => (
        <PersonRow key={p.id} person={p} state={p.state ?? fallbackState ?? "none"} detail={p.detail ?? (p.at ? formatRelativeTime(p.at.toISOString()) : null)} testId={`${testPrefix}-${p.id}`} />
      ))}
    </Box>
  );
}

/**
 * Amigos: encontrar pessoas da rede (busca por nome ou @identificador, ou a lista de quem está no AnimeHub, com os
 * amigos em comum), os seus amigos e, na lateral, pedidos recebidos, aniversários, sugestões (amigos de amigos,
 * comunidades e animes em comum) e pedidos enviados. Exige conta.
 */
export default async function FriendsHomePage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/amigos"));
  const sp = await searchParams;
  const query = (sp.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(sp.pagina) || 1) - 1;
  const [{ received, sent }, friends, results, network, suggestions, birthdays] = await Promise.all([
    friendRequests(user.id),
    listFriends(user.id, user.id, 24),
    query ? searchPeople(user.id, query) : Promise.resolve(null),
    query ? Promise.resolve(null) : networkPeople(user.id, page),
    friendSuggestions(user.id),
    friendsBirthdays(user.id, resolveTimeZone(user.timeZone)),
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
        {/* Duas colunas no computador: encontrar e ver os amigos à esquerda; o que pede ação (pedidos, aniversários, sugestões) à direita. */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) 360px" }, gap: 3, alignItems: "start" }}>
          <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            {results && (
              <ProfileSection id="busca" title={`resultados para “${query}”`} count={results.length} testId="people-results" more={{ href: "/amigos", label: "limpar" }}>
                {results.length === 0 ? (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{query.replace(/^@/, "").length < 2 ? "Digite pelo menos 2 letras." : "Ninguém encontrado com esse nome ou identificador."}</Typography>
                ) : (
                  <PeopleList people={results} testPrefix="person" />
                )}
              </ProfileSection>
            )}
            <ProfileSection id="amigos" title="meus amigos" count={friends.total} testId="my-friends" more={friends.total > friends.rows.length ? { href: `/users/${user.id}/amigos`, label: "ver todos" } : undefined}>
              {friends.rows.length === 0 ? (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ainda nenhum amigo. Veja quem está na rede abaixo ou as sugestões.</Typography>
              ) : (
                <PeopleGrid people={friends.rows} size={64} />
              )}
            </ProfileSection>
            {network && (
              <ProfileSection id="rede" title="pessoas na rede" count={network.total} testId="network-people">
                <Typography sx={{ fontSize: 13, color: "text.secondary", mt: -1 }}>Todo mundo que está no AnimeHub, de quem chegou por último para quem chegou primeiro.</Typography>
                {network.rows.length === 0 ? (
                  <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Ainda não há mais ninguém por aqui.</Typography>
                ) : (
                  <PeopleList people={network.rows} testPrefix="network" />
                )}
                <Pager basePath="/amigos" page={network.page + 1} pages={network.pages} />
              </ProfileSection>
            )}
          </Box>
          <Box component="aside" aria-label="Pedidos e sugestões" sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <ProfileSection id="pedidos" title="pedidos recebidos" count={received.length} testId="friend-requests-received">
              {received.length === 0 ? <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum pedido esperando.</Typography> : <PeopleList people={received} testPrefix="friend-request" fallbackState="received" />}
            </ProfileSection>
            {birthdays.length > 0 && (
              <ProfileSection id="aniversarios" title="aniversários" count={birthdays.length} testId="friend-birthdays">
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                  {birthdays.map((b) => (
                    <Box component="li" key={b.id} data-testid={`birthday-${b.id}`} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, borderTop: 1, borderColor: "divider", flexWrap: "wrap", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
                      <AppLink href={`/users/${b.id}`} aria-label={b.displayName}>
                        <UserAvatar id={b.id} displayName={b.displayName} avatarUrl={b.avatarUrl} size={40} />
                      </AppLink>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <AppLink href={`/users/${b.id}`} underline="hover" sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>
                          {b.displayName}
                        </AppLink>
                        <Typography sx={{ fontSize: 12, color: b.inDays === 0 ? "primary.main" : "text.secondary", fontWeight: b.inDays === 0 ? 700 : 400 }}>
                          {b.inDays === 0 ? "🎂 Hoje!" : b.inDays === 1 ? "Amanhã" : `Em ${b.inDays} dias`} · {formatBirthday(b.birthDay, b.birthMonth)}
                        </Typography>
                      </Box>
                      {b.inDays === 0 && (
                        <AppLink href={`/users/${b.id}#recados`} underline="hover" sx={{ fontSize: 13, fontWeight: 700 }} data-testid={`birthday-scrap-${b.id}`}>
                          Deixar um recado
                        </AppLink>
                      )}
                    </Box>
                  ))}
                </Box>
              </ProfileSection>
            )}
            <ProfileSection id="sugestoes" title="sugestões" count={suggestions.length} testId="friend-suggestions">
              {suggestions.length === 0 ? (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                  As sugestões vêm de amigos dos seus amigos e de quem participa das mesmas comunidades e acompanha os mesmos animes. <AppLink href="/comunidades">Entre numa comunidade</AppLink> para começar.
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
                <PeopleList people={sent} testPrefix="friend-sent" fallbackState="sent" />
              </ProfileSection>
            )}
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}

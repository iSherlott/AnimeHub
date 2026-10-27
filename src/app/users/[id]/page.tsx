import { notFound } from "next/navigation";
import { Box, Chip, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { ProfileHeader } from "@/components/ProfileHeader";
import { ProfileTabs } from "@/components/ProfileTabs";
import { AppLink } from "@/components/AppLink";
import { UserAvatar } from "@/components/UserAvatar";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { SideBox } from "@/components/SideBox";
import { FanButton, FriendButton, ProfileReportButton, RatingBox, ScrapForm, TestimonialDecision, TestimonialForm, DeleteButton } from "@/components/profile/ProfileActions";
import { AlbumGrid, CommunityGrid, NoteItem, PeopleGrid, ProfileSection, ScrapList } from "@/components/profile/ProfileSections";
import { NewAlbumButton } from "@/components/profile/ProfileAlbums";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { blockRelation } from "@/lib/blocks";
import { BlockedProfileNotice } from "@/components/BlockedProfileNotice";
import { equippedTitleNames } from "@/lib/quiz";
import { loadProfileAnimeList } from "@/lib/profileAnimeList";
import { listFans, listScraps, listTestimonials, ratingSummary } from "@/lib/profileSocial";
import { friendState, friendSuggestions, listFriends, pendingReceivedCount } from "@/lib/friends";
import { memberCommunities } from "@/lib/community";
import { dailyFortune } from "@/lib/dailyFortune";
import { formatBirthday } from "@/lib/birthdays";
import { recentVisitors, recordVisit } from "@/lib/profileVisits";
import { profileAlbums } from "@/lib/profileAlbums";
import { formatRelativeTime } from "@/lib/relativeTime";
import { resolveTimeZone } from "@/lib/timeZone";
import { loginHref } from "@/lib/safeRedirect";

type Params = { params: Promise<{ id: string }> };

const SCRAPS_ON_PROFILE = 5;

/** Uma linha do "quem sou eu" (rótulo à esquerda, valor à direita). */
function AboutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box component="div" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "180px minmax(0,1fr)" }, gap: { xs: 0.25, sm: 2 }, py: 1, borderTop: 1, borderColor: "divider" }}>
      <Typography component="dt" sx={{ fontSize: 13, color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: 15, overflowWrap: "anywhere" }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * Perfil social do Anime Hub: à esquerda o menu, os fãs e as avaliações; no centro o cabeçalho,
 * a sorte do dia (só para a dona do perfil), o "quem sou eu", os recados, os depoimentos e as publicações; à direita os
 * amigos (pedido de amizade aceito), as comunidades e as conquistas.
 */
export default async function UserProfilePage({ params }: Params) {
  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, handle: true, avatarUrl: true, bannerUrl: true, bio: true, favoriteAnime: true, favoriteCharacter: true, favoriteGenres: true, birthDay: true, birthMonth: true, createdAt: true },
  });
  if (!target) notFound();

  const viewer = await getCurrentUser();

  // Bloqueio (Figma 13:43571): sem bio, posts nem listas por trás do bloqueio.
  // Quem foi bloqueado recebe a mesma mensagem neutra de "indisponível"
  // (404), sem revelar quem bloqueou quem nem por quê.
  const relation = await blockRelation(viewer?.id ?? null, id);
  if (relation === "blocked-me") notFound();
  if (relation === "blocked-by-me") {
    return (
      <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
        <Header />
        <PageContainer>
          <BlockedProfileNotice userId={id} displayName={target.displayName} />
        </PageContainer>
      </Box>
    );
  }

  const viewerId = viewer?.id ?? null;
  const isOwnProfile = viewerId === id;
  // Visitas: registra a de quem tem conta; a dona do perfil vê as recentes (se registra as dela).
  await recordVisit(viewer, id);
  const visitors = isOwnProfile && viewer?.recordVisits ? await recentVisitors(id) : null;
  const [followerCount, followingCount, postCount, isFollowedByMe, titles, equippedTitles, animeList, friends, communities, fans, isFan, ratings, scraps, testimonials, friendRel, myTestimonial, pendingRequests] =
    await Promise.all([
      prisma.follow.count({ where: { followingId: id } }),
      prisma.follow.count({ where: { followerId: id } }),
      prisma.post.count({ where: { userId: id, deletedAt: null } }),
      viewerId ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: id } } }).then((f) => f !== null) : Promise.resolve(false),
      prisma.userTitle.findMany({ where: { userId: id }, orderBy: { awardedAt: "desc" }, select: { id: true, quiz: { select: { titleReward: true } } } }),
      equippedTitleNames([id]),
      loadProfileAnimeList(id, viewerId),
      listFriends(id, viewerId),
      memberCommunities(id),
      listFans(id, viewerId, 0).then((f) => f.total),
      viewerId && !isOwnProfile ? prisma.fan.findUnique({ where: { fanId_targetId: { fanId: viewerId, targetId: id } } }).then((f) => f !== null) : Promise.resolve(false),
      ratingSummary(id, viewerId),
      listScraps(id, 0, viewerId, SCRAPS_ON_PROFILE),
      listTestimonials(id, viewerId),
      viewerId ? friendState(viewerId, id) : Promise.resolve(null),
      viewerId && !isOwnProfile ? prisma.testimonial.findUnique({ where: { profileId_authorId: { profileId: id, authorId: viewerId } }, select: { body: true, status: true } }) : Promise.resolve(null),
      isOwnProfile ? pendingReceivedCount(id) : Promise.resolve(0),
    ]);
  const friendOfViewer = friendRel === "friends";
  // Álbuns (coletâneas de animes): seguem "Mostrar meus animes"; null = escondidos para quem vê. A lista de animes
  // já montada acima serve à contagem da aba e aos álbuns.
  const albums = await profileAlbums(id, viewerId, animeList);
  const animeCount = animeList.kind === "ok" ? animeList.list.total : null;
  const albumCards = albums ? [...albums.auto, ...albums.custom] : [];
  // Perfil próprio ainda sem amigos: a caixa de amigos mostra quem a pessoa talvez conheça.
  const peopleYouMayKnow = isOwnProfile && friends.total === 0 ? await friendSuggestions(id, 3) : [];

  const pending = testimonials.filter((t) => t.status === "PENDING");
  const approved = testimonials.filter((t) => t.status === "APPROVED");
  const canModerate = can(viewer?.role, "moderation");
  const fortune = isOwnProfile ? dailyFortune(id, new Date(), resolveTimeZone(viewer?.timeZone)) : null;
  const firstName = target.displayName.split(" ")[0];

  const menu = [
    { href: "#quem-sou-eu", label: "Quem sou eu", count: null },
    ...(albums ? [{ href: "#albuns", label: "Álbuns", count: albumCards.length }] : []),
    { href: "#recados", label: "Recados", count: scraps.total },
    { href: "#depoimentos", label: "Depoimentos", count: approved.length },
    { href: "#amigos", label: "Amigos", count: friends.total },
    { href: "#comunidades", label: "Comunidades", count: communities.total },
    { href: "#conquistas", label: "Conquistas", count: titles.length },
    { href: "#publicacoes", label: "Publicações", count: postCount },
  ];

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer wide>
        <PageIntro
          kicker="プロフィール / PERFIL"
          title={isOwnProfile ? "Meu perfil" : target.displayName}
          subtitle={isOwnProfile ? "Seu espaço público: recados, depoimentos, amigos e comunidades. Sua organização pessoal continua privada." : target.handle ? `@${target.handle}` : "Perfil público"}
        />
        <AppLink href="/" underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          ← Feed
        </AppLink>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "220px minmax(0,1fr)", lg: "220px minmax(0,1fr) 280px" }, gap: 3, alignItems: "start" }}>
          {/* Esquerda: menu, fãs e avaliações */}
          {/* No celular o centro (cabeçalho, quem sou eu, recados) vem primeiro; o menu, os fãs e as avaliações depois (no tablet, lado a lado). */}
          <Box component="aside" aria-label="Menu do perfil" sx={{ display: { xs: "flex", sm: "grid", md: "flex" }, gridTemplateColumns: { sm: "repeat(2, minmax(0,1fr))" }, alignItems: { sm: "start", md: "stretch" }, flexDirection: "column", gap: 2, order: { xs: 2, md: 0 } }}>
            {/* O menu de âncoras só faz sentido com as colunas lado a lado (no celular tudo já está em sequência). */}
            <Box component="nav" aria-label="Seções do perfil" data-testid="profile-menu" sx={{ display: { xs: "none", md: "flex" }, flexDirection: "column", gap: 0.5 }}>
              {menu.map((m) => (
                <Box
                  key={m.href}
                  component="a"
                  href={m.href}
                  sx={{ display: "flex", justifyContent: "space-between", gap: 1, px: 1.5, py: 0.75, borderRadius: "8px", fontSize: 14, textDecoration: "none", color: "text.secondary", "&:hover": { bgcolor: "#171820", color: "text.primary" } }}
                >
                  <span>{m.label}</span>
                  {m.count !== null && <span style={{ fontVariantNumeric: "tabular-nums" }}>{m.count}</span>}
                </Box>
              ))}
            </Box>
            <SideBox title="fãs" testId="profile-fans" more={fans > 0 ? { href: `/users/${id}/fas`, label: "ver fãs" } : undefined}>
              <FanButton userId={id} initialFan={isFan} initialFans={fans} canFan={Boolean(viewer) && !isOwnProfile} />
            </SideBox>
            <SideBox title="avaliações">
              <RatingBox userId={id} initialAverage={ratings.average} initialVotes={ratings.votes} initialMine={ratings.mine} canRate={friendOfViewer} />
              {viewer && !isOwnProfile && !friendOfViewer && (
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Só amigos avaliam.</Typography>
              )}
            </SideBox>
          </Box>

          {/* Centro */}
          <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3, order: { xs: 1, md: 0 } }}>
            <ProfileHeader
              userId={id}
              displayName={target.displayName}
              handle={target.handle}
              avatarUrl={target.avatarUrl}
              bannerUrl={target.bannerUrl}
              bio={null}
              postCount={postCount}
              initialFollowerCount={followerCount}
              followingCount={followingCount}
              title={equippedTitles.get(id) ?? null}
              isOwnProfile={isOwnProfile}
              viewerLoggedIn={Boolean(viewer)}
              initialFollowing={isFollowedByMe}
              friendAction={
                friendRel && friendRel !== "self" ? (
                  <FriendButton userId={id} initial={friendRel} inline />
                ) : !viewer ? (
                  <LinkButton href={loginHref(`/users/${id}`)} variant="contained" data-testid="friend-add-login">
                    Adicionar como amigo
                  </LinkButton>
                ) : null
              }
            />

            {fortune && (
              <Box data-testid="profile-fortune" sx={{ display: "flex", flexDirection: "column", gap: 0.5, px: 2.5, py: 2, borderRadius: "12px", border: 1, borderColor: "#5a2235", bgcolor: "#2c111b" }}>
                <Typography lang="ja" sx={{ fontSize: 11, fontWeight: 700, color: "primary.main", letterSpacing: "0.04em" }}>
                  今日の運勢 / SORTE DO DIA
                </Typography>
                <Typography sx={{ fontSize: 15 }}>{fortune}</Typography>
              </Box>
            )}

            <ProfileSection id="quem-sou-eu" title="quem sou eu" testId="profile-about" more={isOwnProfile ? { href: "/perfil/editar", label: "editar" } : undefined}>
              <Typography sx={{ fontSize: 16, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: target.bio ? "text.primary" : "text.secondary" }}>
                {target.bio ?? (isOwnProfile ? "Conte um pouco sobre você em Editar perfil." : `${firstName} ainda não escreveu o quem sou eu.`)}
              </Typography>
              <Box component="dl" sx={{ m: 0 }}>
                {target.favoriteAnime && <AboutRow label="Anime favorito">{target.favoriteAnime}</AboutRow>}
                {target.favoriteCharacter && <AboutRow label="Personagem favorito">{target.favoriteCharacter}</AboutRow>}
                {target.favoriteGenres.length > 0 && (
                  <AboutRow label="Gêneros favoritos">
                    <Box component="span" sx={{ display: "inline-flex", gap: 0.75, flexWrap: "wrap" }}>
                      {target.favoriteGenres.map((g) => (
                        <Chip key={g} label={g} size="small" component="span" />
                      ))}
                    </Box>
                  </AboutRow>
                )}
                {target.birthDay && target.birthMonth && (isOwnProfile || friendOfViewer) && (
                  <AboutRow label="Aniversário">
                    {formatBirthday(target.birthDay, target.birthMonth)}
                    {isOwnProfile && (
                      <Typography component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                        {" "}
                        · só amigos veem
                      </Typography>
                    )}
                  </AboutRow>
                )}
                <AboutRow label="No Anime Hub desde">{target.createdAt.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: resolveTimeZone(viewer?.timeZone) })}</AboutRow>
              </Box>
            </ProfileSection>

            {albums && (
              <ProfileSection id="albuns" title="álbuns" count={albumCards.length} testId="profile-albums">
                {isOwnProfile && (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Os automáticos seguem o andamento de cada anime; monte os seus com obras da sua lista.</Typography>
                    <NewAlbumButton userId={id} />
                  </Box>
                )}
                <AlbumGrid userId={id} albums={albumCards} />
              </ProfileSection>
            )}

            <ProfileSection id="recados" title="recados" count={scraps.total} testId="profile-scraps" more={scraps.total > SCRAPS_ON_PROFILE ? { href: `/users/${id}/recados`, label: "ver todos" } : undefined}>
              {viewer ? (
                <ScrapForm userId={id} />
              ) : (
                <Typography sx={{ fontSize: 14 }}>
                  <AppLink href={loginHref(`/users/${id}`)}>Entre</AppLink> para deixar um recado.
                </Typography>
              )}
              <ScrapList scraps={scraps.rows} viewerId={viewerId} canModerate={canModerate} empty={isOwnProfile ? "Nenhum recado ainda." : `Nenhum recado ainda. Seja a primeira pessoa a escrever para ${firstName}.`} />
            </ProfileSection>

            <ProfileSection id="depoimentos" title="depoimentos" count={approved.length} testId="profile-testimonials">
              {isOwnProfile && pending.length > 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2, borderRadius: "12px", bgcolor: "#171820" }} data-testid="testimonials-pending">
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Esperando a sua aprovação ({pending.length})</Typography>
                  <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                    {pending.map((t) => (
                      <NoteItem key={t.id} author={t.author} when={t.updatedAt} body={t.body} testId={`testimonial-${t.id}`} actions={<TestimonialDecision id={t.id} />} />
                    ))}
                  </Box>
                </Box>
              )}
              {friendOfViewer && <TestimonialForm userId={id} displayName={firstName} initial={myTestimonial?.body ?? ""} status={myTestimonial?.status ?? null} />}
              {viewer && !isOwnProfile && !friendOfViewer && (
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Só amigos escrevem depoimentos.</Typography>
              )}
              {approved.length === 0 ? (
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum depoimento ainda.</Typography>
              ) : (
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                  {approved.map((t) => (
                    <NoteItem
                      key={t.id}
                      author={t.author}
                      when={t.decidedAt ?? t.updatedAt}
                      body={t.body}
                      testId={`testimonial-${t.id}`}
                      actions={
                        viewerId ? (
                          <>
                            {viewerId !== t.authorId && <ProfileReportButton kind="testimonial" id={t.id} />}
                            {(viewerId === id || viewerId === t.authorId) && <DeleteButton url={`/api/testimonials/${t.id}`} testId={`testimonial-delete-${t.id}`} />}
                          </>
                        ) : undefined
                      }
                    />
                  ))}
                </Box>
              )}
            </ProfileSection>

            <Box id="publicacoes" sx={{ scrollMarginTop: 96 }}>
              <ProfileTabs userId={id} isOwnProfile={isOwnProfile} titleCount={titles.length} animeCount={animeCount} />
            </Box>
          </Box>

          {/* Direita: amigos, comunidades e conquistas */}
          <Box component="aside" aria-label="Amigos, comunidades e conquistas" sx={{ display: { xs: "flex", sm: "grid", lg: "flex" }, gridTemplateColumns: { sm: "repeat(2, minmax(0,1fr))" }, alignItems: { sm: "start", lg: "stretch" }, flexDirection: "column", gap: 2, gridColumn: { md: "1 / -1", lg: "auto" }, order: { xs: 3, md: 0 } }}>
            {isOwnProfile && (
              <SideBox title="só você vê">
                <Typography sx={{ fontSize: 13 }}>A aba Animes pode ser ocultada em Configurações. Datas e adiados continuam só seus.</Typography>
                <Box>
                  <LinkButton href="/minha-lista" size="small" sx={{ bgcolor: "#171820", color: "text.primary", "&:hover": { bgcolor: "#1d1e28" } }}>
                    🔒 Abrir Minha Lista privada
                  </LinkButton>
                </Box>
              </SideBox>
            )}
            <SideBox id="amigos" title="amigos" count={friends.total} testId="profile-friends" more={isOwnProfile ? { href: "/amigos", label: "gerenciar" } : friends.total > friends.rows.length ? { href: `/users/${id}/amigos`, label: "ver todos" } : undefined}>
              {isOwnProfile && pendingRequests > 0 && (
                <AppLink href="/amigos" underline="hover" sx={{ fontSize: 13, fontWeight: 700 }} data-testid="profile-friend-requests">
                  {pendingRequests} {pendingRequests === 1 ? "pedido de amizade esperando" : "pedidos de amizade esperando"} →
                </AppLink>
              )}
              {friends.rows.length === 0 && peopleYouMayKnow.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} data-testid="profile-friend-suggestions">
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Ainda nenhum. Talvez você conheça:</Typography>
                  <PeopleGrid people={peopleYouMayKnow} />
                  <AppLink href="/amigos#sugestoes" underline="hover" sx={{ fontSize: 13 }}>
                    ver sugestões
                  </AppLink>
                </Box>
              ) : friends.rows.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{isOwnProfile ? "Ainda nenhum. Abra um perfil e use “Adicionar como amigo”." : "Ainda nenhum amigo."}</Typography>
              ) : (
                <PeopleGrid people={friends.rows} />
              )}
            </SideBox>
            <SideBox id="comunidades" title="comunidades" count={communities.total} testId="profile-communities" more={isOwnProfile ? { href: "/comunidades", label: "ver todas" } : undefined}>
              {communities.rows.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                  {isOwnProfile ? (
                    <>
                      Você ainda não participa de comunidades. <AppLink href="/comunidades">Encontre a do seu anime</AppLink>.
                    </>
                  ) : (
                    "Ainda não participa de comunidades."
                  )}
                </Typography>
              ) : (
                <CommunityGrid communities={communities.rows} />
              )}
            </SideBox>
            {isOwnProfile && (
              <SideBox id="visitas" title="visitas recentes" count={visitors?.total} testId="profile-visitors" more={visitors && visitors.total > visitors.rows.length ? { href: `/users/${id}/visitas`, label: "ver todas" } : undefined}>
                {!visitors ? (
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    Você desligou o registro de visitas: ninguém vê as suas, e você também não vê quem visitou o seu perfil. <AppLink href="/configuracoes">Configurações</AppLink>
                  </Typography>
                ) : visitors.rows.length === 0 ? (
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Ninguém visitou seu perfil nos últimos 90 dias.</Typography>
                ) : (
                  <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 1 }}>
                    {visitors.rows.map((v) => (
                      <Box component="li" key={v.id} data-testid={`visitor-${v.id}`}>
                        <AppLink href={`/users/${v.id}`} underline="hover" sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, color: "text.primary", fontSize: 11, textAlign: "center", overflowWrap: "anywhere" }}>
                          <UserAvatar id={v.id} displayName={v.displayName} avatarUrl={v.avatarUrl} size={48} />
                          {v.displayName}
                          <Typography component="span" sx={{ fontSize: 10, color: "text.secondary" }}>
                            {formatRelativeTime(v.visitedAt.toISOString())}
                          </Typography>
                        </AppLink>
                      </Box>
                    ))}
                  </Box>
                )}
              </SideBox>
            )}
            <SideBox id="conquistas" title="conquistas" count={titles.length} testId="profile-achievements" more={isOwnProfile ? { href: "/conquistas", label: "ver conquistas" } : undefined}>
              {titles.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{isOwnProfile ? "Acerte 10 de 10 num quiz para ganhar um título." : "Nenhum título ainda."}</Typography>
              ) : (
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                  {titles.map((t) => (
                    <Chip key={t.id} label={t.quiz.titleReward} size="small" variant="outlined" color="primary" />
                  ))}
                </Box>
              )}
            </SideBox>
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}

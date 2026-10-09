"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { Avatar, Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { FollowToggle } from "@/components/FollowToggle";
import type { RecommendationData } from "@/components/RecommendationCard";
import { avatarColor, initials } from "@/lib/avatarColor";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { resolveTitleText, useTitlePreference } from "@/lib/titlePreference";
import type { PostDTO } from "@/lib/postDto";

type ThreadSummary = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
  commentCount: number;
  lastCommentAt: string | null;
};

type Suggestion = { id: string; displayName: string };

function ThreadRow({ thread }: { thread: ThreadSummary }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, {
    titleRomaji: thread.titleRomaji,
    titleEnglish: thread.titleEnglish,
  });
  const [coverBroken, setCoverBroken] = useState(false);

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          overflow: "hidden",
          flexShrink: 0,
          bgcolor: "background.default",
        }}
      >
        {thread.coverImage && !coverBroken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thread.coverImage}
            alt=""
            onError={() => setCoverBroken(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <MuiLink
          component={NextLink}
          // Comment é por anilistId, não por linha de Anime do viewer —
          // nem todo mundo que vê a lateral tem esse anime na própria
          // lista (posse é por usuário) — leva pra busca do Descobrir
          // (sempre pública) em vez de /anime/[id] (exige posse).
          href={`/discover?search=${encodeURIComponent(thread.titleRomaji)}`}
          underline="hover"
          sx={{ color: "text.primary", fontSize: 13, fontWeight: 600, display: "block" }}
          noWrap
        >
          {title}
        </MuiLink>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {thread.commentCount} {thread.commentCount === 1 ? "comentário" : "comentários"}
        </Typography>
      </Box>
    </Stack>
  );
}

function RecommendedAnimeRow({ rec }: { rec: RecommendationData }) {
  const { preference } = useTitlePreference();
  const title = resolveTitleText(preference, {
    titleRomaji: rec.titleRomaji,
    titleEnglish: rec.titleEnglish,
  });
  const [coverBroken, setCoverBroken] = useState(false);

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          overflow: "hidden",
          flexShrink: 0,
          bgcolor: "background.default",
        }}
      >
        {rec.coverImage && !coverBroken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rec.coverImage}
            alt=""
            onError={() => setCoverBroken(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </Box>
      <MuiLink
        component={NextLink}
        // Recomendação nunca é um anime que o viewer já tem na lista (por
        // definição) — sem página própria pra linkar internamente, leva
        // pra busca do Descobrir em vez de AniList (site externo), mesmo
        // padrão de ThreadRow logo acima.
        href={`/discover?search=${encodeURIComponent(rec.titleRomaji)}`}
        underline="hover"
        sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, color: "text.primary" }}
      >
        <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 600 }} noWrap>
          {title}
        </Typography>
      </MuiLink>
    </Stack>
  );
}

/** Mesmo avatar 28px (cor determinística + iniciais) usado por
 * `SuggestionRow` e `TrendingPostRow` logo abaixo — extraído só aqui
 * dentro (não pra src/lib/avatarColor.ts) porque é puramente o `sx` de
 * apresentação se repetindo, não o cálculo em si. */
function MiniAvatar({ id, displayName }: { id: string; displayName: string }) {
  return (
    <Avatar sx={{ bgcolor: avatarColor(id), width: 28, height: 28, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
      {initials(displayName)}
    </Avatar>
  );
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
        <MiniAvatar id={suggestion.id} displayName={suggestion.displayName} />
        <MuiLink
          component={NextLink}
          href={`/users/${suggestion.id}`}
          underline="hover"
          sx={{ color: "text.primary", fontSize: 13, fontWeight: 600 }}
          noWrap
        >
          {suggestion.displayName}
        </MuiLink>
      </Stack>
      <FollowToggle userId={suggestion.id} initialFollowing={false} onChange={() => {}} />
    </Stack>
  );
}

function TrendingPostRow({ post }: { post: PostDTO }) {
  return (
    <MuiLink
      component={NextLink}
      // Este app não tem página de post avulso (decisão de escopo do
      // Epic 25) — linka pro perfil do autor, mesmo padrão já usado pelo
      // autor citado numa citação embutida (achado da 22ª rodada, Epic 18).
      href={`/users/${post.author.id}`}
      underline="none"
      sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", color: "inherit" }}
    >
      <MiniAvatar id={post.author.id} displayName={post.author.displayName} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, display: "block" }} noWrap>
          {post.author.displayName}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontSize: 13,
            color: "text.secondary",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.isSpoiler ? "Conteúdo com spoilers" : post.body}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {post.likeCount} {post.likeCount === 1 ? "curtida" : "curtidas"}
        </Typography>
      </Box>
    </MuiLink>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}
      >
        {title}
      </Typography>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {children}
      </Stack>
    </Box>
  );
}

/**
 * Lateral do Feed (Epic 25 → expandida no Epic 26) — 5 seções: 2 públicas
 * "de conteúdo" (posts em alta, threads de anime por comentário — Epic
 * 15), 2 autenticadas "de recomendação pessoal" (animes recomendados,
 * pessoas pra seguir) e 1 pública "de descoberta" (threads mais
 * comentadas hoje). Seções autenticadas simplesmente não buscam nada
 * enquanto deslogado — mesmo padrão já usado pelo fetch de /api/anime em
 * FeedView.tsx — em vez de a lateral inteira exigir login.
 */
export function FeedSidebar() {
  const user = useCurrentUser();

  const [trendingPosts, setTrendingPosts] = useState<PostDTO[]>([]);
  const [recent, setRecent] = useState<ThreadSummary[]>([]);
  const [mostCommentedToday, setMostCommentedToday] = useState<ThreadSummary[]>([]);
  const [recommendedAnimes, setRecommendedAnimes] = useState<RecommendationData[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  // Separado de `loading` (que só cobre as 2 buscas públicas) — sem isso,
  // um usuário logado sem posts em alta/threads no momento via a lateral
  // inteira sumir assim que as buscas públicas terminavam (isEmpty batia
  // com as 2 seções autenticadas ainda vazias, esperando resposta) e
  // reaparecer de repente um instante depois, quando essas 2 chegavam —
  // um pisca-pisca visível (achado real da revisão de código desta
  // entrega). Começa `true` mesmo pra quem nunca vai buscar nada (o
  // efeito abaixo desarma pra quem está deslogado assim que souber disso
  // com certeza — `user === null`, não `undefined`).
  const [authSectionsLoading, setAuthSectionsLoading] = useState(true);

  // Seções públicas — buscadas 1x ao montar, pra quem está vendo a
  // lateral mesmo sem conta (mesma filosofia pública do resto do Feed).
  useEffect(() => {
    let cancelled = false;
    // Meia-noite no fuso do navegador, enviada como timestamp absoluto —
    // mesmo padrão já usado por buildWeekDays/weekStart em
    // src/app/calendar/page.tsx, pra "hoje" não discordar entre o
    // servidor (UTC no Docker Compose) e quem está vendo a lateral
    // (achado real da 22ª rodada de auditoria, Epic 18).
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      fetch("/api/feed/trending-posts").then((res) => res.json()),
      fetch(`/api/anime-threads/trending?todayStart=${Math.floor(todayStart.getTime() / 1000)}`).then((res) =>
        res.json()
      ),
    ])
      .then(([trendingData, threadsData]) => {
        if (cancelled) return;
        setTrendingPosts(trendingData.posts ?? []);
        setRecent(threadsData.recent ?? []);
        setMostCommentedToday(threadsData.mostCommentedToday ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Seções autenticadas — não disparam nada enquanto `user` é falso
  // (deslogado, ou ainda carregando `/api/auth/me`), separadas do efeito
  // acima pra não refazer as 2 buscas públicas de novo só porque o
  // estado de sessão terminou de resolver.
  useEffect(() => {
    // `undefined` = sessão ainda resolvendo — deixa `authSectionsLoading`
    // travado em `true` até saber de verdade (evita o mesmo pisca-pisca
    // que essa correção existe pra evitar, só que na borda deslogado→
    // logado em vez da borda "ainda carregando").
    if (user === undefined) return;
    if (!user) {
      // Só descobrimos que está deslogado depois que `useCurrentUser()`
      // resolve — sem efeito não tem outro jeito de reagir a isso.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthSectionsLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch("/api/feed/recommendations").then((res) => res.json()),
      fetch("/api/users/suggestions").then((res) => res.json()),
    ])
      .then(([recommendationsData, suggestionsData]) => {
        if (cancelled) return;
        setRecommendedAnimes(recommendationsData.animes ?? []);
        setSuggestions(suggestionsData.users ?? []);
      })
      .finally(() => {
        if (!cancelled) setAuthSectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isEmpty =
    trendingPosts.length === 0 &&
    recommendedAnimes.length === 0 &&
    suggestions.length === 0 &&
    recent.length === 0 &&
    mostCommentedToday.length === 0;

  if (loading || authSectionsLoading || isEmpty) return null;

  return (
    <Stack spacing={3} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
      {trendingPosts.length > 0 && (
        <Section title="Posts em alta">
          {trendingPosts.map((post) => (
            <TrendingPostRow key={post.id} post={post} />
          ))}
        </Section>
      )}
      {recommendedAnimes.length > 0 && (
        <Section title="Animes recomendados">
          {recommendedAnimes.map((rec) => (
            <RecommendedAnimeRow key={rec.anilistId} rec={rec} />
          ))}
        </Section>
      )}
      {suggestions.length > 0 && (
        <Section title="Pessoas pra seguir">
          {suggestions.map((s) => (
            <SuggestionRow key={s.id} suggestion={s} />
          ))}
        </Section>
      )}
      {recent.length > 0 && (
        <Section title="Threads recentes">
          {recent.map((t) => (
            <ThreadRow key={t.anilistId} thread={t} />
          ))}
        </Section>
      )}
      {mostCommentedToday.length > 0 && (
        <Section title="Mais comentadas hoje">
          {mostCommentedToday.map((t) => (
            <ThreadRow key={t.anilistId} thread={t} />
          ))}
        </Section>
      )}
    </Stack>
  );
}

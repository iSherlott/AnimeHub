"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { Tab, Tabs } from "@mui/material";
import { ProfileAnimeList } from "@/components/ProfileAnimeList";
import { UserPostList } from "@/components/UserPostList";

type TabValue = "posts" | "discussions" | "animes";

/** A aba aberta fica no endereço (`?aba=animes`): ao voltar da página de uma obra, o perfil reabre na mesma aba. */
const TAB_PARAM: Record<TabValue, string | null> = { posts: null, discussions: "discussoes", animes: "animes" };
const tabFromParam = (value: string | null): TabValue => (value === "animes" ? "animes" : value === "discussoes" ? "discussions" : "posts");

/**
 * Publicações · Discussões iniciadas (PROF-004; a definição de
 * "discussão iniciada" — publicação com obra explícita — é proposta,
 * ver OPEN_DECISIONS) · Animes (a lista de acompanhados, estilo My Anime List,
 * com busca e filtro por gênero; `animeCount` é null quando a pessoa a oculta).
 */
export function ProfileTabs({
  userId,
  isOwnProfile,
  titleCount = 0,
  animeCount = null,
}: {
  userId: string;
  isOwnProfile: boolean;
  titleCount?: number;
  animeCount?: number | null;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabValue>(() => tabFromParam(searchParams.get("aba")));
  function choose(next: TabValue) {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    const value = TAB_PARAM[next];
    if (value) params.set("aba", value);
    else params.delete("aba");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }
  return (
    <>
      <Tabs value={tab} onChange={(_, v) => (v === "posts" || v === "discussions" || v === "animes") && choose(v)} sx={{ mb: 2 }} aria-label="Conteúdo do perfil">
        <Tab label="Publicações" value="posts" />
        <Tab label="Discussões iniciadas" value="discussions" />
        <Tab label={animeCount === null ? "Animes" : `Animes · ${animeCount}`} value="animes" data-testid="tab-animes" />
        {isOwnProfile && <Tab label={`Minhas conquistas · ${titleCount}`} value="achievements" component={NextLink} href="/conquistas" data-testid="tab-achievements" />}
      </Tabs>
      {tab === "animes" ? (
        <ProfileAnimeList userId={userId} isOwnProfile={isOwnProfile} />
      ) : (
        <UserPostList
          key={tab}
          userId={userId}
          timeStyle="clock"
          params={tab === "discussions" ? { kind: "discussions" } : undefined}
          emptyText={
            tab === "discussions"
              ? isOwnProfile
                ? "Você ainda não iniciou discussões. Publique sobre uma obra para começar."
                : "Esta pessoa ainda não iniciou discussões."
              : "Nenhum post ainda."
          }
        />
      )}
    </>
  );
}

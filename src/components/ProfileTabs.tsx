"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tab, Tabs } from "@mui/material";
import { ProfileAnimeList } from "@/components/ProfileAnimeList";
import { UserPostList } from "@/components/UserPostList";

/**
 * A escolha aberta fica no endereço (`?aba=animes`, `?aba=discussoes`): ao voltar da página de uma obra, o perfil
 * reabre no mesmo lugar. As duas seções dividem o parâmetro; cada uma só apaga o valor que é dela.
 */
function setTabParam(value: string | null, owned: string) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set("aba", value);
  else if (params.get("aba") === owned) params.delete("aba");
  const qs = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
}

const tabsSx = { minHeight: 40, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 40, px: { xs: 1.5, sm: 2 } } };

/**
 * Publicações · Discussões iniciadas (PROF-004; a definição de "discussão iniciada" — publicação com obra explícita —
 * é proposta, ver OPEN_DECISIONS).
 */
export function ProfilePostTabs({ userId, isOwnProfile }: { userId: string; isOwnProfile: boolean }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"posts" | "discussions">(() => (searchParams.get("aba") === "discussoes" ? "discussions" : "posts"));
  function choose(next: "posts" | "discussions") {
    setTab(next);
    setTabParam(next === "discussions" ? "discussoes" : null, "discussoes");
  }
  return (
    <>
      <Tabs value={tab} onChange={(_, v) => (v === "posts" || v === "discussions") && choose(v)} sx={tabsSx} aria-label="Publicações do perfil">
        <Tab label="Todas" value="posts" />
        <Tab label="Discussões iniciadas" value="discussions" />
      </Tabs>
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
    </>
  );
}

/**
 * Os álbuns e a lista completa de animes (estilo My Anime List, com busca e filtro por gênero) na mesma seção.
 * `albums` vem pronto do servidor (botão de novo álbum e a grade).
 */
export function ProfileAnimesSwitch({
  userId,
  isOwnProfile,
  albumCount,
  animeCount,
  albums,
}: {
  userId: string;
  isOwnProfile: boolean;
  albumCount: number;
  animeCount: number | null;
  albums: ReactNode;
}) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<"albums" | "animes">(() => (searchParams.get("aba") === "animes" ? "animes" : "albums"));
  function choose(next: "albums" | "animes") {
    setView(next);
    setTabParam(next === "animes" ? "animes" : null, "animes");
  }
  return (
    <>
      <Tabs value={view} onChange={(_, v) => (v === "albums" || v === "animes") && choose(v)} sx={tabsSx} aria-label="Álbuns ou todos os animes">
        <Tab label={`Álbuns · ${albumCount}`} value="albums" data-testid="tab-albums" />
        <Tab label={animeCount === null ? "Todos" : `Todos · ${animeCount}`} value="animes" data-testid="tab-animes" />
      </Tabs>
      {view === "animes" ? <ProfileAnimeList userId={userId} isOwnProfile={isOwnProfile} /> : albums}
    </>
  );
}

"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Tab, Tabs } from "@mui/material";
import { UserPostList } from "@/components/UserPostList";

/**
 * Publicações · Discussões iniciadas (PROF-004; a definição de
 * "discussão iniciada" — publicação com obra explícita — é proposta,
 * ver OPEN_DECISIONS).
 */
export function ProfileTabs({ userId, isOwnProfile, titleCount = 0 }: { userId: string; isOwnProfile: boolean; titleCount?: number }) {
  const [tab, setTab] = useState<"posts" | "discussions">("posts");
  return (
    <>
      <Tabs value={tab} onChange={(_, v) => (v === "posts" || v === "discussions") && setTab(v)} sx={{ mb: 2 }} aria-label="Conteúdo do perfil">
        <Tab label="Publicações" value="posts" />
        <Tab label="Discussões iniciadas" value="discussions" />
        {isOwnProfile && <Tab label={`Minhas conquistas · ${titleCount}`} value="achievements" component={NextLink} href="/conquistas" data-testid="tab-achievements" />}
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

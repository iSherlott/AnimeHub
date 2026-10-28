"use client";

import NextLink from "next/link";
import { Tab, Tabs } from "@mui/material";

/**
 * As "planilhas" da pessoa: Minha Lista (o que acompanha), Para assistir (o que adiou) e Pausados (obras que já
 * terminaram de passar e ela não terminou). Links de navegação comuns — cada uma é uma página.
 */
export function MyListTabs({ active, pendingCount, pausedCount }: { active: "list" | "pending" | "paused"; pendingCount: number; pausedCount: number }) {
  return (
    <Tabs value={active} aria-label="Listas pessoais" variant="scrollable" allowScrollButtonsMobile sx={{ mb: 3 }}>
      <Tab label="Minha Lista" value="list" component={NextLink} href="/minha-lista" data-testid="tab-my-list" />
      <Tab label={`Para assistir · ${pendingCount}`} value="pending" component={NextLink} href="/minha-lista/pendencias" data-testid="tab-pending" />
      <Tab label={`Pausados · ${pausedCount}`} value="paused" component={NextLink} href="/minha-lista/pausados" data-testid="tab-paused" />
    </Tabs>
  );
}

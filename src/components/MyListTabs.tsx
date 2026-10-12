"use client";

import NextLink from "next/link";
import { Tab, Tabs } from "@mui/material";

/**
 * Duas "planilhas" da pessoa: Minha Lista (o que acompanha) e Para assistir (o que adiou).
 * Links de navegação comuns — cada uma é uma página.
 */
export function MyListTabs({ active, pendingCount }: { active: "list" | "pending"; pendingCount: number }) {
  return (
    <Tabs value={active} aria-label="Listas pessoais" sx={{ mb: 3 }}>
      <Tab label="Minha Lista" value="list" component={NextLink} href="/minha-lista" data-testid="tab-my-list" />
      <Tab label={`Para assistir · ${pendingCount}`} value="pending" component={NextLink} href="/minha-lista/pendencias" data-testid="tab-pending" />
    </Tabs>
  );
}

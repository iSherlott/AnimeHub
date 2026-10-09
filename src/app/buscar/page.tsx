import { Suspense } from "react";
import { Box } from "@mui/material";
import { Header } from "@/components/Header";
import { SocialSearchView, type SearchScope } from "@/components/SocialSearchView";

type Props = { searchParams: Promise<{ q?: string; scope?: string }> };

/** Busca social (SOC-004): Publicações · Perfis · Hashtags. Leitura pública. */
export default async function SearchPage({ searchParams }: Props) {
  const { q = "", scope } = await searchParams;
  const parsed: SearchScope = scope === "profiles" ? "profiles" : scope === "hashtags" ? "hashtags" : "posts";
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Header />
      <Box sx={{ maxWidth: 680, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <Suspense>
          <SocialSearchView query={q.slice(0, 80)} scope={parsed} />
        </Suspense>
      </Box>
    </Box>
  );
}

import type { Metadata } from "next";
import { Box, Button, Chip, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import { LinkButton } from "@/components/LinkButton";
import { PageContainer, PageIntro } from "@/components/PageShell";
import { Pager } from "@/components/community/CommunityParts";
import { getCurrentUser } from "@/lib/auth/session";
import { DIRECTORY_SORTS, exploreCommunities, friendsCommunities, isDirectorySort, myCommunities, trackedWorkCommunities, type DirectoryCard, type DirectorySort } from "@/lib/community";
import { favoriteGenreOptions } from "@/lib/genres";
import { formatRelativeTime } from "@/lib/relativeTime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comunidades · Anime Hub" };

type Tab = "minhas" | "explorar";
type Props = { searchParams: Promise<{ aba?: string; q?: string; categoria?: string; ordem?: string; pagina?: string }> };

/** Cartão de comunidade do diretório (capa, nome do anime, membros e tópicos; e o motivo, nas faixas sugeridas). */
function CommunityTile({ c }: { c: DirectoryCard }) {
  return (
    <Box component="li" data-testid={`directory-${c.key}`} sx={{ listStyle: "none" }}>
      <AppLink href={`/comunidades/${c.key}`} underline="none" sx={{ display: "flex", flexDirection: "column", gap: 0.75, color: "text.primary", "&:hover .name": { textDecoration: "underline" } }}>
        <Box sx={{ position: "relative", aspectRatio: "2 / 3", borderRadius: "10px", overflow: "hidden", bgcolor: "#171820" }}>{c.coverImage && <CoverImage src={c.coverImage} sizes="160px" />}</Box>
        <Typography className="name" sx={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>
          <AnimeTitle titles={{ titleRomaji: c.titleRomaji, titleEnglish: c.titleEnglish, titleNative: c.titleNative }} />
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          {c.members} {c.members === 1 ? "membro" : "membros"} · {c.topics} {c.topics === 1 ? "tópico" : "tópicos"}
        </Typography>
        {c.detail && <Typography sx={{ fontSize: 12, color: "primary.main", fontWeight: 600 }}>{c.detail}</Typography>}
      </AppLink>
    </Box>
  );
}

const gridSx = { m: 0, p: 0, display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", sm: "repeat(4, minmax(0,1fr))", lg: "repeat(6, minmax(0,1fr))" }, gap: 2 } as const;

/** Uma faixa sugerida (dos amigos, das obras que a pessoa acompanha). */
function Strip({ title, rows, testId }: { title: string; rows: DirectoryCard[]; testId: string }) {
  if (rows.length === 0) return null;
  return (
    <Box component="section" aria-label={title} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }} data-testid={testId}>
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>
        {title}
      </Typography>
      <Box component="ul" sx={gridSx}>
        {rows.map((c) => (
          <CommunityTile key={c.key} c={c} />
        ))}
      </Box>
    </Box>
  );
}

/**
 * Comunidades: o diretório dos fóruns dos animes, como no Orkut. "Minhas" (com o que teve novidade desde a última
 * visita) e "Explorar", onde populares e busca são a mesma tela: busca pelo nome do anime, categorias (os gêneros das
 * obras), a ordem (mais membros, mais novas, atividade recente) e as páginas. Sem busca nem categoria, aparecem também
 * as comunidades dos seus amigos e as das obras que você acompanha. Cada anime tem a sua comunidade, mesmo antes do
 * primeiro membro.
 */
export default async function CommunitiesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const q = (sp.q ?? "").trim().slice(0, 80);
  const genres = await favoriteGenreOptions();
  const genre = sp.categoria && genres.includes(sp.categoria) ? sp.categoria : "";
  const sort: DirectorySort = isDirectorySort(sp.ordem) ? sp.ordem : "membros";
  const page = Math.max(1, Number(sp.pagina) || 1) - 1;
  const mine = user ? await myCommunities(user.id) : [];
  const filtering = Boolean(q || genre || sp.ordem || sp.pagina);
  // "populares" e "buscar" eram abas separadas; os endereços antigos abrem o Explorar.
  const tab: Tab = sp.aba === "minhas" && !filtering ? "minhas" : sp.aba === "explorar" || sp.aba === "populares" || sp.aba === "buscar" || filtering ? "explorar" : user && mine.length > 0 ? "minhas" : "explorar";
  const showStrips = tab === "explorar" && user && !q && !genre && page === 0;
  const [explore, fromFriends, fromWorks] = await Promise.all([
    tab === "explorar" ? exploreCommunities({ q, genre, sort, page }) : Promise.resolve(null),
    showStrips ? friendsCommunities(user.id) : Promise.resolve([]),
    showStrips ? trackedWorkCommunities(user.id) : Promise.resolve([]),
  ]);
  const now = new Date();
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "minhas", label: `Minhas${user ? ` · ${mine.length}` : ""}` },
    { key: "explorar", label: "Explorar" },
  ];
  // Endereço do Explorar mantendo a busca, a categoria e a ordem (o que mudar substitui).
  const exploreHref = (change: { q?: string; categoria?: string; ordem?: string }) => {
    const params = new URLSearchParams({ aba: "explorar" });
    const next = { q, categoria: genre, ordem: sort === "membros" ? "" : sort, ...change };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    return `/comunidades?${params.toString()}`;
  };
  const pagerParams = Object.fromEntries(Object.entries({ aba: "explorar", q, categoria: genre, ordem: sort === "membros" ? "" : sort }).filter(([, v]) => v));

  return (
    <Box sx={{ minHeight: "100%", bgcolor: "background.default" }}>
      <Header />
      <PageContainer>
        <PageIntro kicker="コミュニティ / COMUNIDADES" title="Comunidades" subtitle="O fórum de cada anime: tópicos, enquetes, eventos e quem curte a mesma obra." />
        <Box component="nav" aria-label="Comunidades" sx={{ display: "flex", gap: 3, borderBottom: 1, borderColor: "divider" }} data-testid="communities-tabs">
          {tabs.map((t) => (
            <AppLink key={t.key} href={`/comunidades?aba=${t.key}`} underline="none" aria-current={tab === t.key ? "page" : undefined} data-testid={`communities-tab-${t.key}`} sx={{ pb: 1.25, fontSize: 14, fontWeight: 700, color: tab === t.key ? "text.primary" : "text.secondary", borderBottom: 2, borderColor: tab === t.key ? "primary.main" : "transparent", mb: "-1px" }}>
              {t.label}
            </AppLink>
          ))}
        </Box>

        {tab === "minhas" &&
          (!user ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
              <Typography sx={{ color: "text.secondary" }}>Entre na sua conta para ver as comunidades de que você participa.</Typography>
              <LinkButton href="/login?next=%2Fcomunidades" variant="contained">
                Entrar
              </LinkButton>
            </Box>
          ) : mine.length === 0 ? (
            <Typography sx={{ color: "text.secondary" }} data-testid="my-communities-empty">
              Você ainda não participa de nenhuma comunidade. <AppLink href="/comunidades?aba=explorar">Explore</AppLink> as populares ou busque o anime que você curte.
            </Typography>
          ) : (
            <Box component="ul" data-testid="my-communities" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0,1fr))" }, gap: 2 }}>
              {mine.map((c) => (
                <Box component="li" key={c.communityId} data-testid={`my-community-${c.key}`} sx={{ display: "flex", gap: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper" }}>
                  <Box sx={{ position: "relative", width: 64, aspectRatio: "2 / 3", borderRadius: "8px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>{c.root.coverImage && <CoverImage src={c.root.coverImage} sizes="64px" />}</Box>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
                    <AppLink href={`/comunidades/${c.key}`} underline="hover" sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", overflowWrap: "anywhere" }}>
                      <AnimeTitle titles={{ titleRomaji: c.root.titleRomaji, titleEnglish: c.root.titleEnglish, titleNative: c.root.titleNative }} />
                    </AppLink>
                    <Typography sx={{ fontSize: 13, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                      {c.members} {c.members === 1 ? "membro" : "membros"} · {c.topics} {c.topics === 1 ? "tópico" : "tópicos"}
                      {c.lastActivityAt ? ` · última atividade ${formatRelativeTime(c.lastActivityAt, now)}` : ""}
                    </Typography>
                    {c.newActivity > 0 && <Chip size="small" color="primary" label={`${c.newActivity} com novidade${c.newActivity === 1 ? "" : "s"}`} sx={{ alignSelf: "flex-start" }} data-testid={`my-community-new-${c.key}`} />}
                  </Box>
                </Box>
              ))}
            </Box>
          ))}

        {tab === "explorar" && explore && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }} data-testid="communities-explore">
            {/* Busca: o mesmo lugar das populares; a categoria e a ordem escolhidas continuam ao buscar. */}
            <Box component="form" action="/comunidades" method="get" role="search" aria-label="Buscar comunidades" sx={{ display: "flex", gap: 1, maxWidth: 640 }}>
              <input type="hidden" name="aba" value="explorar" />
              {genre && <input type="hidden" name="categoria" value={genre} />}
              {sort !== "membros" && <input type="hidden" name="ordem" value={sort} />}
              <Box component="input" name="q" defaultValue={q} placeholder="Nome do anime (romaji, inglês ou japonês)" aria-label="Buscar comunidade pelo nome do anime" data-testid="communities-search" sx={{ flex: 1, minWidth: 0, px: 2, py: 1.25, borderRadius: "10px", border: 1, borderColor: "divider", bgcolor: "#171820", color: "text.primary", fontSize: 15 }} />
              <Button type="submit" variant="contained" data-testid="communities-search-submit">
                Buscar
              </Button>
            </Box>

            <Box role="group" aria-label="Categorias" sx={{ display: "flex", gap: 1, flexWrap: "wrap" }} data-testid="communities-categories">
              <Chip component={AppLink} href={exploreHref({ categoria: "" })} clickable label="Todas" color={genre ? "default" : "primary"} variant={genre ? "outlined" : "filled"} size="small" aria-current={genre ? undefined : "true"} />
              {genres.map((g) => (
                <Chip key={g} component={AppLink} href={exploreHref({ categoria: g })} clickable label={g} color={genre === g ? "primary" : "default"} variant={genre === g ? "filled" : "outlined"} size="small" aria-current={genre === g ? "true" : undefined} data-testid={`communities-category-${g}`} />
              ))}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 14, color: "text.secondary", fontVariantNumeric: "tabular-nums" }} data-testid="communities-total">
                {explore.total} {explore.total === 1 ? "comunidade" : "comunidades"}
                {q ? ` para “${q}”` : ""}
                {genre ? ` em ${genre}` : ""}
                {!q && !genre ? " com membros" : ""}
              </Typography>
              <Box component="nav" aria-label="Ordem" sx={{ display: "flex", gap: 2, fontSize: 13 }} data-testid="communities-sort">
                {DIRECTORY_SORTS.map((s) => (
                  <AppLink key={s.key} href={exploreHref({ ordem: s.key === "membros" ? "" : s.key })} underline="hover" aria-current={sort === s.key ? "true" : undefined} sx={{ fontWeight: sort === s.key ? 700 : 400, color: sort === s.key ? "text.primary" : "text.secondary" }}>
                    {s.label}
                  </AppLink>
                ))}
              </Box>
            </Box>

            {explore.rows.length === 0 ? (
              <Typography sx={{ color: "text.secondary" }}>
                {q && q.length < 2 ? "Digite pelo menos 2 letras." : q || genre ? "Nenhum anime na plataforma com esse filtro." : "Nenhuma comunidade com membros ainda. Busque um anime ou escolha uma categoria e seja a primeira pessoa a participar."}
              </Typography>
            ) : (
              <Box component="ul" sx={gridSx} data-testid="explore-communities">
                {explore.rows.map((c) => (
                  <CommunityTile key={c.key} c={c} />
                ))}
              </Box>
            )}
            <Pager basePath="/comunidades" page={explore.page + 1} pages={explore.pages} params={pagerParams} />

            <Strip title="Dos seus amigos" rows={fromFriends} testId="friends-communities" />
            <Strip title="Das obras que você acompanha" rows={fromWorks} testId="tracked-communities" />
          </Box>
        )}
      </PageContainer>
    </Box>
  );
}

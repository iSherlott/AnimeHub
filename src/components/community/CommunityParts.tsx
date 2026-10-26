import { Box, Chip, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import { UserAvatar } from "@/components/UserAvatar";
import { formatRelativeTime } from "@/lib/relativeTime";
import type { CommunityScope } from "@/lib/community";

/** Cabeçalho da comunidade: capa e nome da franquia, números e a ação (Participar / Sair). */
export function CommunityHeader({ scope, members, topics, action }: { scope: CommunityScope; members: number; topics: number; action: React.ReactNode }) {
  const { root } = scope;
  return (
    <Box component="header" sx={{ display: "flex", gap: 3, alignItems: "flex-end", flexWrap: "wrap" }} data-testid="community-header">
      <Box sx={{ position: "relative", width: 112, aspectRatio: "2 / 3", borderRadius: "10px", overflow: "hidden", bgcolor: "#171820", flexShrink: 0 }}>
        {root.coverImage && <CoverImage src={root.coverImage} sizes="112px" />}
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: "1 1 320px" }}>
        <Typography component="p" lang="ja" sx={{ color: "primary.main", fontSize: 12, fontWeight: 700 }}>
          コミュニティ / COMUNIDADE
        </Typography>
        <Typography component="h1" sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 400, lineHeight: 1.2, overflowWrap: "anywhere" }} data-testid="community-name">
          <AnimeTitle titles={{ titleRomaji: root.titleRomaji, titleEnglish: root.titleEnglish, titleNative: root.titleNative }} />
        </Typography>
        <Typography sx={{ color: "text.secondary", fontSize: 15, fontVariantNumeric: "tabular-nums" }} data-testid="community-stats">
          {members} {members === 1 ? "membro" : "membros"} · {topics} {topics === 1 ? "tópico" : "tópicos"} · {scope.works.length} {scope.works.length === 1 ? "obra" : "obras"} da franquia
        </Typography>
        <AppLink href={`/anime/${root.workKey}`} underline="hover" sx={{ fontSize: 14, color: "text.secondary", alignSelf: "flex-start" }}>
          Ver a página do anime
        </AppLink>
      </Box>
      {action}
    </Box>
  );
}

type TopicRowData = {
  id: string;
  title: string;
  isSpoiler: boolean;
  replyCount: number;
  lastActivityAt: Date;
  author: { id: string; displayName: string; avatarUrl: string | null };
  catalogEntry: { titleRomaji: string; titleNative: string | null } | null;
  poll: { id: string } | null;
};

/** Uma linha da lista de tópicos: título, de que obra fala, enquete/spoiler, autor, respostas e última atividade. */
export function TopicRow({ topic, href, now }: { topic: TopicRowData; href: string; now: Date }) {
  return (
    <Box component="li" data-testid={`topic-row-${topic.id}`} sx={{ listStyle: "none", display: "grid", gridTemplateColumns: { xs: "1fr", sm: "minmax(0,1fr) auto" }, gap: 1, py: 1.5, borderTop: 1, borderColor: "divider" }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
        <AppLink href={href} underline="hover" sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", overflowWrap: "anywhere" }}>
          {topic.title}
        </AppLink>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <UserAvatar id={topic.author.id} displayName={topic.author.displayName} avatarUrl={topic.author.avatarUrl} size={20} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{topic.author.displayName}</Typography>
          {topic.catalogEntry && <Chip size="small" label={`Sobre: ${topic.catalogEntry.titleNative ?? topic.catalogEntry.titleRomaji}`} sx={{ height: 20, fontSize: 11 }} />}
          {topic.poll && <Chip size="small" label="Enquete" sx={{ height: 20, fontSize: 11 }} />}
          {topic.isSpoiler && <Chip size="small" color="warning" label="Spoiler" sx={{ height: 20, fontSize: 11 }} />}
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexDirection: { xs: "row", sm: "column" }, gap: { xs: 1.5, sm: 0.25 }, alignItems: { sm: "flex-end" } }}>
        <Typography sx={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          {topic.replyCount} {topic.replyCount === 1 ? "resposta" : "respostas"}
        </Typography>
        <Typography suppressHydrationWarning sx={{ fontSize: 12, color: "text.secondary" }}>
          {formatRelativeTime(topic.lastActivityAt.toISOString(), now)}
        </Typography>
      </Box>
    </Box>
  );
}

/** Paginação simples (Anterior · página x de y · Próxima), `pagina` começando em 1. */
export function Pager({ basePath, page, pages }: { basePath: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (p: number) => (p <= 1 ? basePath : `${basePath}?pagina=${p}`);
  return (
    <Box component="nav" aria-label="Páginas" sx={{ display: "flex", gap: 2, alignItems: "center", fontSize: 14 }} data-testid="community-pager">
      {page > 1 && <AppLink href={href(page - 1)}>← Anterior</AppLink>}
      <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
        Página {page} de {pages}
      </Typography>
      {page < pages && <AppLink href={href(page + 1)}>Próxima →</AppLink>}
    </Box>
  );
}

/** Rótulo de uma obra da franquia (para "Sobre" e a lista lateral). */
export function workLabel(w: { titleRomaji: string; titleNative: string | null; seasonYear: number | null; kind: string | null }): string {
  const kind = w.kind === "MOVIE" ? "filme" : w.kind === "OVA" ? "OVA" : w.kind === "ODA" ? "ODA" : null;
  return [w.titleNative ?? w.titleRomaji, [kind, w.seasonYear].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

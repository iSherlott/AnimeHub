import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { AnimeTitle } from "@/components/AnimeTitle";
import { CoverImage } from "@/components/CoverImage";
import { UserAvatar } from "@/components/UserAvatar";
import { DeleteButton } from "@/components/profile/ProfileOrkut";
import { formatRelativeTime } from "@/lib/relativeTime";
import type { CommunityLink } from "@/lib/community";

type Person = { id: string; displayName: string; avatarUrl: string | null };
export type ScrapView = { id: string; body: string; createdAt: Date; author: Person; authorId: string; profileId: string };

/** Seção do centro do perfil (recados, depoimentos…): título em minúsculas como no Orkut, contagem e "ver todos". */
export function ProfileSection({ id, title, count, more, testId, children }: { id: string; title: string; count?: number; more?: { href: string; label: string }; testId: string; children: ReactNode }) {
  return (
    <Box component="section" id={id} aria-labelledby={`${id}-title`} data-testid={testId} sx={{ display: "flex", flexDirection: "column", gap: 2, p: { xs: 2, sm: 3 }, borderRadius: "16px", bgcolor: "background.paper", scrollMarginTop: 96 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
        <Typography component="h2" id={`${id}-title`} sx={{ fontSize: 18, fontWeight: 700 }}>
          {title}
          {count !== undefined && (
            <Typography component="span" sx={{ fontSize: 14, color: "text.secondary", fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
              {" "}({count})
            </Typography>
          )}
        </Typography>
        {more && (
          <AppLink href={more.href} underline="hover" sx={{ fontSize: 13 }}>
            {more.label}
          </AppLink>
        )}
      </Box>
      {children}
    </Box>
  );
}

/** Um recado (ou depoimento): avatar e nome de quem escreveu, quando, o texto e as ações. */
export function NoteItem({ author, when, body, actions, testId }: { author: Person; when: Date; body: string; actions?: ReactNode; testId: string }) {
  return (
    <Box component="li" data-testid={testId} sx={{ display: "flex", gap: 1.5, py: 1.5, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0, pt: 0 } }}>
      <AppLink href={`/users/${author.id}`} aria-label={author.displayName} sx={{ flexShrink: 0 }}>
        <UserAvatar id={author.id} displayName={author.displayName} avatarUrl={author.avatarUrl} size={40} />
      </AppLink>
      <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
          <AppLink href={`/users/${author.id}`} underline="hover" sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            {author.displayName}
          </AppLink>
          <Typography component="time" dateTime={when.toISOString()} sx={{ fontSize: 12, color: "text.secondary" }}>
            {formatRelativeTime(when.toISOString())}
          </Typography>
          {actions && <Box sx={{ ml: "auto", display: "flex", gap: 0.5, alignItems: "center" }}>{actions}</Box>}
        </Box>
        <Typography sx={{ fontSize: 15, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body}</Typography>
      </Box>
    </Box>
  );
}

/** Lista de recados; quem recebeu, quem escreveu ou a moderação podem apagar. */
export function ScrapList({ scraps, viewerId, canModerate, empty }: { scraps: ScrapView[]; viewerId: string | null; canModerate: boolean; empty: string }) {
  if (scraps.length === 0) return <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{empty}</Typography>;
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
      {scraps.map((s) => (
        <NoteItem
          key={s.id}
          author={s.author}
          when={s.createdAt}
          body={s.body}
          testId={`scrap-${s.id}`}
          actions={viewerId && (viewerId === s.profileId || viewerId === s.authorId || canModerate) ? <DeleteButton url={`/api/scraps/${s.id}`} testId={`scrap-delete-${s.id}`} /> : undefined}
        />
      ))}
    </Box>
  );
}

/** Grade de pessoas (amigos), 3 por linha como no Orkut. */
export function PeopleGrid({ people, size = 48 }: { people: Person[]; size?: number }) {
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 1 }}>
      {people.map((p) => (
        <Box component="li" key={p.id}>
          <AppLink href={`/users/${p.id}`} underline="hover" sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, color: "text.primary", fontSize: 11, textAlign: "center", overflowWrap: "anywhere" }}>
            <UserAvatar id={p.id} displayName={p.displayName} avatarUrl={p.avatarUrl} size={size} />
            {p.displayName}
          </AppLink>
        </Box>
      ))}
    </Box>
  );
}

/** Grade de comunidades (capas), 3 por linha. */
export function CommunityGrid({ communities }: { communities: CommunityLink[] }) {
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 1 }}>
      {communities.map((c) => (
        <Box component="li" key={c.key}>
          <AppLink href={`/comunidades/${c.key}`} underline="hover" sx={{ display: "flex", flexDirection: "column", gap: 0.5, color: "text.primary", fontSize: 11, overflowWrap: "anywhere" }}>
            <Box sx={{ position: "relative", width: "100%", aspectRatio: "2 / 3", borderRadius: "6px", overflow: "hidden", bgcolor: "#171820" }}>{c.coverImage && <CoverImage src={c.coverImage} sizes="80px" />}</Box>
            <AnimeTitle titles={{ titleRomaji: c.titleRomaji, titleEnglish: c.titleEnglish, titleNative: c.titleNative }} />
            <Typography component="span" sx={{ fontSize: 10, color: "text.secondary" }}>
              ({c.members})
            </Typography>
          </AppLink>
        </Box>
      ))}
    </Box>
  );
}

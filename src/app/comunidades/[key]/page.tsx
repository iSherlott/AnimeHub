import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Panel, TopicRow } from "@/components/community/CommunityParts";
import { DescriptionEditor, EventCard } from "@/components/community/CommunityOrkut";
import { can } from "@/lib/auth/permissions";
import { listEvents, listTopics } from "@/lib/community";
import { prisma } from "@/lib/prisma";
import { htmlToPlainText } from "@/lib/plainText";
import { canonical, getCommunity, getScope, getViewer } from "./data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const scope = await getScope((await params).key);
  return { title: scope ? `Comunidade ${scope.root.titleRomaji} · Anime Hub` : "Comunidade · Anime Hub" };
}

const KIND: Record<string, string> = { EPISODE: "série", OVA: "OVA", ODA: "ODA", MOVIE: "filme", OTHER: "outro" };

/**
 * Início da comunidade (como no Orkut): descrição, informações, os tópicos mais ativos do fórum, as enquetes e os próximos
 * eventos. Qualquer pessoa lê; participar é pelo botão da coluna da esquerda.
 */
export default async function CommunityHome({ params }: Props) {
  const { key } = await params;
  await canonical(key);
  const scope = await getScope(key);
  if (!scope) notFound();
  const [community, { user }] = await Promise.all([getCommunity(key), getViewer(key)]);
  const base = `/comunidades/${scope.key}`;
  const root = await prisma.catalogEntry.findFirst({ where: scope.franchiseKey !== null ? { anilistId: scope.franchiseKey } : { id: scope.catalogEntryId as string }, select: { description: true, descriptionPt: true } });
  const synopsis = htmlToPlainText(root?.descriptionPt ?? root?.description ?? "");
  const description = community?.description ?? synopsis;
  const [topics, polls, events] = community
    ? await Promise.all([listTopics(community.id, 0, user?.id ?? null, { take: 5 }), listTopics(community.id, 0, user?.id ?? null, { pollsOnly: true, take: 3 }), listEvents(community.id, "upcoming", user?.id ?? null, 3)])
    : [{ total: 0, rows: [] }, { total: 0, rows: [] }, []];
  const kinds = [...new Set(scope.works.map((w) => KIND[w.kind ?? ""] ?? null).filter(Boolean))].join(", ");
  const now = new Date();
  const info: Array<[string, string]> = [
    ["categoria", `Anime${kinds ? ` · ${kinds}` : ""}`],
    ["franquia", `${scope.works.length} ${scope.works.length === 1 ? "obra" : "obras"}`],
    ["idioma", "Português"],
    ["tipo", "pública (qualquer pessoa lê; para escrever, participe)"],
    ["criada em", community ? community.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "na primeira participação"],
  ];

  return (
    <>
      <Panel title="Descrição" testId="community-description" action={user && can(user.role, "moderation") ? <DescriptionEditor communityKey={scope.key} initial={community?.description ?? ""} /> : undefined}>
        <Typography sx={{ fontSize: 15, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: description ? "text.primary" : "text.secondary" }}>{description || "Sem descrição ainda."}</Typography>
        <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 2, rowGap: 0.5, fontSize: 13 }} data-testid="community-info">
          {info.map(([k, v]) => (
            <Box key={k} sx={{ display: "contents" }}>
              <Box component="dt" sx={{ color: "text.secondary" }}>{k}:</Box>
              <Box component="dd" sx={{ m: 0 }}>{v}</Box>
            </Box>
          ))}
        </Box>
      </Panel>

      <Panel title="Fórum" more={{ href: `${base}/forum`, label: `ver todos os tópicos (${topics.total})` }} testId="community-forum-preview">
        {topics.rows.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="community-empty">
            Nenhum tópico ainda. Abra o fórum e comece a conversa.
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {topics.rows.map((t) => (
              <TopicRow key={t.id} topic={t} href={`${base}/topicos/${t.id}`} now={now} />
            ))}
          </Box>
        )}
      </Panel>

      <Panel title="Enquetes" more={polls.total > 0 ? { href: `${base}/enquetes`, label: `ver todas (${polls.total})` } : undefined} testId="community-polls-preview">
        {polls.rows.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma enquete. Crie um tópico com enquete no fórum.</Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {polls.rows.map((t) => (
              <TopicRow key={t.id} topic={t} href={`${base}/topicos/${t.id}`} now={now} />
            ))}
          </Box>
        )}
      </Panel>

      <Panel title="Próximos eventos" more={{ href: `${base}/eventos`, label: "ver eventos" }} testId="community-events-preview">
        {events.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhum evento marcado.</Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            {events.map((e) => (
              <EventCard key={e.id} event={e} canRsvp={false} canDelete={false} />
            ))}
          </Box>
        )}
      </Panel>
    </>
  );
}

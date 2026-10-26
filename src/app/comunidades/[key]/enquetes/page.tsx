import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Pager, Panel, TopicRow } from "@/components/community/CommunityParts";
import { listTopics, TOPICS_PAGE } from "@/lib/community";
import { canonical, getCommunity, getScope, getViewer } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ pagina?: string }> };

/** Enquetes da comunidade: os tópicos com enquete. Para criar uma, abra um tópico no fórum e marque "Incluir enquete". */
export default async function CommunityPolls({ params, searchParams }: Props) {
  const { key } = await params;
  await canonical(key, "/enquetes");
  const scope = await getScope(key);
  if (!scope) notFound();
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const [community, { user }] = await Promise.all([getCommunity(key), getViewer(key)]);
  const { total, rows } = community ? await listTopics(community.id, page - 1, user?.id ?? null, { pollsOnly: true }) : { total: 0, rows: [] };
  const base = `/comunidades/${scope.key}`;
  const now = new Date();
  return (
    <Panel title={`Enquetes (${total})`} testId="community-polls">
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>Nenhuma enquete ainda. No fórum, crie um tópico e marque &quot;Incluir enquete&quot;.</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {rows.map((t) => (
            <TopicRow key={t.id} topic={t} href={`${base}/topicos/${t.id}`} now={now} />
          ))}
        </Box>
      )}
      <Pager basePath={`${base}/enquetes`} page={page} pages={Math.max(1, Math.ceil(total / TOPICS_PAGE))} />
    </Panel>
  );
}

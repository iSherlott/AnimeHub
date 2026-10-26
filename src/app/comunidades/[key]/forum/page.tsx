import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Pager, Panel, TopicRow, workLabel } from "@/components/community/CommunityParts";
import { NewTopicForm } from "@/components/community/CommunityClient";
import { listTopics, TOPICS_PAGE } from "@/lib/community";
import { canonical, getCommunity, getScope, getViewer } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ pagina?: string }> };

/** Fórum da comunidade: todos os tópicos (os fixados primeiro, depois a atividade mais recente) e o "Novo tópico". */
export default async function CommunityForum({ params, searchParams }: Props) {
  const { key } = await params;
  await canonical(key, "/forum");
  const scope = await getScope(key);
  if (!scope) notFound();
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const [community, { user, member }] = await Promise.all([getCommunity(key), getViewer(key)]);
  const { total, rows } = community ? await listTopics(community.id, page - 1, user?.id ?? null) : { total: 0, rows: [] };
  const base = `/comunidades/${scope.key}`;
  const now = new Date();
  return (
    <>
      {member ? (
        <NewTopicForm communityKey={scope.key} works={scope.works.map((w) => ({ id: w.id, label: workLabel(w) }))} />
      ) : (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="community-join-hint">
          {user ? "Participe da comunidade para criar tópicos, responder e votar nas enquetes." : "Entre na sua conta e participe da comunidade para criar tópicos e responder."}
        </Typography>
      )}
      <Panel title={`Fórum (${total})`} testId="community-forum">
        {rows.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="community-empty">
            Nenhum tópico ainda. {member ? "Comece a conversa." : "Participe e comece a conversa."}
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, p: 0 }} data-testid="topic-list">
            {rows.map((t) => (
              <TopicRow key={t.id} topic={t} href={`${base}/topicos/${t.id}`} now={now} />
            ))}
          </Box>
        )}
        <Pager basePath={`${base}/forum`} page={page} pages={Math.max(1, Math.ceil(total / TOPICS_PAGE))} />
      </Panel>
    </>
  );
}

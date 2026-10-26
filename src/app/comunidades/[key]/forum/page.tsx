import { notFound } from "next/navigation";
import { Box, Button, TextField, Typography } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { Pager, Panel, TopicRow, workLabel } from "@/components/community/CommunityParts";
import { NewTopicForm } from "@/components/community/CommunityClient";
import { forumSearchWords, listTopics, TOPICS_PAGE } from "@/lib/community";
import { canonical, getCommunity, getScope, getViewer } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ pagina?: string; q?: string }> };

/**
 * Fórum da comunidade: todos os tópicos (os fixados primeiro, depois a atividade mais recente) e o "Novo tópico". `q`
 * busca as palavras (todas) no título, no texto e nas respostas dos tópicos desta comunidade.
 */
export default async function CommunityForum({ params, searchParams }: Props) {
  const { key } = await params;
  await canonical(key, "/forum");
  const scope = await getScope(key);
  if (!scope) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const query = (sp.q ?? "").trim().slice(0, 100);
  const searching = forumSearchWords(query).length > 0;
  const [community, { user, member }] = await Promise.all([getCommunity(key), getViewer(key)]);
  const { total, rows } = community ? await listTopics(community.id, page - 1, user?.id ?? null, searching ? { query } : {}) : { total: 0, rows: [] };
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
      <Box component="form" method="get" action={`${base}/forum`} role="search" aria-label="Buscar no fórum" sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <TextField name="q" defaultValue={query} size="small" placeholder="Buscar nos tópicos e respostas" fullWidth slotProps={{ htmlInput: { "aria-label": "Buscar no fórum", maxLength: 100, "data-testid": "forum-search-input" } }} />
        <Button type="submit" variant="contained" data-testid="forum-search-submit">
          Buscar
        </Button>
      </Box>
      {searching && (
        <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="forum-search-summary">
          {total} {total === 1 ? "tópico encontrado" : "tópicos encontrados"} para “{query}”.{" "}
          <AppLink href={`${base}/forum`}>Limpar busca</AppLink>
        </Typography>
      )}
      <Panel title={searching ? `Resultados (${total})` : `Fórum (${total})`} testId="community-forum">
        {rows.length === 0 && searching ? (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }} data-testid="community-empty">
            Nenhum tópico com essas palavras. Tente outras ou crie um tópico novo.
          </Typography>
        ) : rows.length === 0 ? (
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
        <Pager basePath={`${base}/forum`} page={page} pages={Math.max(1, Math.ceil(total / TOPICS_PAGE))} params={searching ? { q: query } : {}} />
      </Panel>
    </>
  );
}

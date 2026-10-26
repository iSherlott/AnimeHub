# Relatório de implementação — Fases 2 a 10

Este relatório resume as Fases 2 a 10, que vieram depois da auditoria da Fase 1 ([fase-1-diagnostico.md](fase-1-diagnostico.md)). Cada fase segue o mesmo roteiro: diagnóstico, solução, arquivos, banco, API, interface, testes, riscos e próximos passos.

As decisões que a pessoa responsável tomou na Fase 1:

| Decisão | Escolha |
|---|---|
| D1 | O id do catálogo é a identidade da obra. |
| D2 | O episódio global nasce da evolução da agenda. |
| D3 | O catálogo é canônico, e as cópias seguem pelo serviço de propagação. |
| D4 | Gênero vira entidade. |
| D5 | "Adiar a obra" não leva número de episódio. |
| D6 | Novos papéis: Curador e Moderador. |

## Fase 2 — Modelo canônico e integridade (ADR 0008)

- **Diagnóstico.** Tudo se ligava pelo `anilistId`, sem chave estrangeira. Obras só do AniDB ficavam fora de agenda, lista e sino. Não havia histórico por campo.
- **Solução.**
  - `catalogEntryId` com FK RESTRICT em `Production`, `Anime` e `AiringScheduleEntry`, com backfill.
  - `ChangeLog` (histórico por campo) e `manualFields` (campos protegidos).
  - Verificação de integridade com o botão "Ligar ao catálogo".
- **Banco.** `20261025100000_canonical_identity`.
- **API.** `GET/POST /api/admin/integrity`.
- **Testes.** Spec 103, além do ajuste de limpeza em 35 specs (`tests/catalog-cleanup.ts`).
- **Riscos.** Apagar uma obra com dependentes agora falha, como desejado. Quem junta obras precisa repassar os dependentes (`reassignCatalogEntry`).

## Fase 3 — Catálogo e detalhe da obra

- **Solução.**
  - Admin → Catálogo de obras: filtros de qualidade e paginação no servidor.
  - Detalhe da obra: ficha, episódios, franquia, cópias, pendências e histórico.
  - Edição com revisão "antes → depois", proteção dos campos alterados, conflito de versão (409) e devolução de campo à fonte.
  - Publicar e despublicar com o impacto mostrado antes.
  - Propagação das mudanças para as cópias.
  - Admin → Saúde do catálogo.
- **API.** `/api/admin/works`, `/works/[id]` (GET e PATCH), `/works/[id]/visibility`, `/works/[id]/history`.
- **Testes.** Spec 104 e `catalogEdit.test.ts`.

## Fase 4 — Episódios globais (ADR 0009)

- **Diagnóstico.** Os episódios eram copiados por usuário (`Episode`). O admin não tinha onde corrigir um episódio. "Adiar" registrava progresso por episódio.
- **Solução.**
  - A agenda vira o episódio da obra: título, sinopse, imagem, `airDate`, certeza da data, situação, fonte e campos protegidos.
  - `airingAt` aceita nulo: nenhum horário é inventado.
  - Kitsu e AniDB gravam no episódio global, consultados no máximo uma vez por semana.
  - A AniList não apaga um episódio com conteúdo e não muda o que o admin corrigiu; uma mudança de horário vai para o histórico.
  - Admin → Episódios: lista, detalhe e edição com motivo. Corrigir o horário de um episódio da AniList vira override; mudar a data avisa quem acompanha, uma vez só.
  - Resumo de episódios da obra, separando o informado pela fonte do calculado.
  - "Adiar a obra" sem número de episódio.
- **Banco.** `20261026100000_global_episodes` (copia a tabela antiga).
- **Testes.** Spec 105 e unitários de `episodeState`, `episodes`, `refreshAnimeData` e `pending`. Specs adaptadas: 25, 42, 43, 62, 68, 72, 77, 100 e 101.
- **Riscos.** Obras sem AniList ID ainda não recebem episódios. Especiais sem numeração regular ficam como obras próprias.

## Fase 5 — Calendário, conflitos e avisos

- **Solução.**
  - Horário efetivo (override) no calendário público, no sino, no Explorar e na "Minha lista", inclusive quando o override traz o episódio para dentro da semana.
  - "A fonte mudou depois do override" vira conflito; ficar com a fonte tira o override.
  - Admin → Calendário: período, adiados e sem data, o investigador "por que não apareceu?" (obra e, se quiser, a pessoa) e a releitura controlada da agenda (uma a cada 2 min por obra, registrada no log).
  - Rastro de avisos no detalhe do episódio.
- **API.** `POST /api/admin/calendar/diagnose` (a pessoa vai no corpo do pedido, nunca na URL) e `POST /api/admin/calendar/reload`.
- **Testes.** Spec 106 e `airingCacheGlobal.test.ts`.

## Fase 6 — Correspondências e atualização seletiva

- **Solução.**
  - Admin → Correspondências: importação do AniDB e AniDB→AniList lado a lado, com o que coincide e o que diverge.
  - Risco exige motivo; "revisar depois"; exportação em CSV; histórico de decisões.
  - Admin → Atualização seletiva (Cenário F): coleta sem tocar no catálogo, diferenças campo a campo, escolha por grupo com exceções por obra, prévia, confirmação para lotes grandes ou campos protegidos, execução item a item (com conflito quando o valor mudou desde a coleta), resultado e reprocessamento.
  - Documentação das fontes.
- **Banco.** `20261027100000_field_update_items`.
- **Testes.** Spec 107, contra uma AniList falsa.

## Fase 7 — Taxonomia, traduções, pendências e franquias (ADR 0010)

- **Solução.**
  - Gêneros como entidade, com um gatilho que aplica o vocabulário em toda gravação e o índice `CatalogGenre`. Admin → Taxonomia: criar, variações, renomear, mesclar e excluir com transferência ou remoção.
  - Estado da sinopse em português (automática, revisada ou manual), com proteção. Admin → Traduções.
  - Pendências com prioridade configurável, ignorar com justificativa, reabrir e indicadores. Admin → Pendências.
  - Admin → Franquias: ordem manual protegida, prévia e desfazer. A auditoria respeita o que é manual.
- **Banco.** `20261028100000_taxonomy_translations_issues` (funções e gatilhos `animehub_*`).
- **Testes.** Spec 108.

## Fase 8 — Jobs e observabilidade

- **Solução.**
  - Trava de concorrência atômica (`pg_advisory_xact_lock`) com sinal de vida: um job vivo bloqueia outro do mesmo tipo, e um sem sinal é dado como interrompido.
  - Cancelamento cooperativo.
  - Admin → Jobs unificado: tipos, serviços de fundo com a próxima execução prevista, origem, duração, sucessos e falhas, filtro de falhas e CSV.
  - Detalhe genérico: parâmetros não sensíveis, resultado, erro com contexto, logs, alterações gravadas e execuções anteriores.
- **Banco.** `20261029100000_job_heartbeat_cancel`.
- **Testes.** Spec 109.

## Fase 9 — Papéis, quizzes e padrões de interface

- **Solução.**
  - Papéis com menor privilégio:
    - Curador: catálogo.
    - Moderador: denúncias.
    - Administrador: tudo, inclusive papéis.
  - `requireStaff(permission)` nas APIs e `requireAdminPage(permission)` nas páginas; o menu mostra só as áreas do papel.
  - Recusas ficam no log. Na troca de papel, ninguém muda o próprio, e o sistema nunca fica sem administrador.
  - Quizzes: rascunho, publicado e arquivado; resultados agregados; erros de configuração.
  - `error.tsx` da área administrativa e aviso de alterações não salvas.
- **Banco.** `20261030100000_quiz_archive`.
- **Testes.** Spec 110 e `routeAuthorization.test.ts` (rotas administrativas exigem papel; usuários e convites só para administrador).
- **Decisão.** O `loading.tsx` da área administrativa foi testado e retirado. Com streaming, a negação por papel de uma página voltava com status 200 em vez de 404, e o conteúdo aparecia duplicado durante a troca de página. As páginas continuam renderizadas no servidor com os dados, e as operações mostram o próprio indicador de andamento.

## Fase 10 — Validação final

O resultado de cada verificação está em "Resultado dos testes", logo abaixo.

- **Testes executados.** Suíte unitária (Vitest), `tsc` e `eslint`, além da suíte Playwright completa, com as specs novas 103 a 110.
- **Autorização.** `routeAuthorization.test.ts` falha se uma rota nascer sem autenticação, ou se uma rota administrativa não exigir papel.
- **Migrações.** Seis migrações, todas só de acréscimo. A de taxonomia foi aplicada também num banco descartável para conferir os gatilhos.
- **Importações repetidas.** Cobertas por idempotência e conflito de coleta: specs 98 ("a segunda rodada não duplica") e 107 ("mudou desde a coleta").
- **Agenda.** Specs 62, 102, 105 e 106.
- **Acompanhamento por obra.** Nenhuma tela nem API grava progresso por episódio: specs 72 e 77 adaptadas, e `PendingEpisode.fromEpisode` descontinuado.

## Resultado dos testes

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | sem erros |
| `eslint .` | sem erros (3 avisos antigos em specs) |
| Vitest | 662 testes |
| Playwright (completo, 642 testes) | 636 passaram; 2 falharam por clicar antes de a página ficar interativa (specs 105 e 108) e 4 não rodaram por serem a sequência delas. As duas foram tornadas resistentes a isso, e as 16 passaram de novo isoladas |

## O que fica para depois

- **Kitsu e AniDB na atualização seletiva.** Hoje a comparação é só com a AniList.
- **Prioridade das pendências pela tela.** Hoje ela é configurada por variável de ambiente, não pelo painel.
- **Esqueleto de carregamento por seção** (Suspense dentro das páginas), em vez de por rota, para não afetar o status 404 de quem não tem papel.

## Depois da Fase 10: episódios das obras sem AniList ID

- **O que mudou.** As obras só do AniDB passaram a ter episódios, vindos do AniDB com título e dia, sem horário.
  - `anilistId` do episódio ficou opcional, com um índice único (obra do catálogo, número).
  - Admin → Episódios ganhou o lote do AniDB, e o detalhe da obra ganhou "Buscar episódios no AniDB".
  - Ao ligar a obra à AniList, os episódios se juntam sem colidir no número.
- **Banco.** `20261031100000_anidb_only_episodes`.
- **Testes.** Spec 111, com AniDB e AniList falsos.
- **Limitação (resolvida depois).** Essas obras ficavam sem página pública; os episódios apareciam só no admin.

## Depois: extras do AniDB (especiais, créditos, trailers)

- **O que mudou.** Os códigos do AniDB fora da sequência regular (`S1` especial, `C2` abertura/encerramento, `T1` trailer, `P1` paródia, `O1` outro) viram extras da obra.
  - Tabela `EpisodeExtra`, identidade (obra do catálogo, código). Vêm na mesma consulta dos episódios, sem consulta a mais ao AniDB.
  - Página da obra: seção "Extras", minimizada, separada da lista de episódios e agrupada por tipo; o título segue o idioma escolhido.
  - Admin → detalhe da obra: painel "Extras do AniDB" com edição (título, sinopse, dia), versão otimista (409), proteção contra o AniDB e histórico.
  - Não contam como lançados, não entram no calendário, no sino nem no "próximo episódio". Ligar a obra à AniList leva os extras.
- **Banco.** `20261101100000_episode_extras` (só cria a tabela).
- **Testes.** Spec 112, com AniDB e AniList falsos; testes de unidade em `src/lib/episodeExtras.test.ts`.

## Depois: página das obras sem AniList ID

- **O que mudou.** As obras só do AniDB (ou só da Kitsu) que estão na plataforma ganharam página pública em `/anime/anidb-<id>` (ou `/anime/kitsu-<id>`).
  - A página traz ficha, sinopse, episódios (só o dia) e extras, e avisa que ainda não dá para acompanhar nem comentar.
  - O cartão do Explorar, a janela de informações e o botão "Página pública" do admin levam até ela.
  - Quando a obra é ligada à AniList, o endereço redireciona para a página da AniList. Obra fora da plataforma: 404.
- **Banco.** Nenhuma migração.
- **Testes.** Spec 113.
- **Limitação.** Acompanhar, comunidade, quiz e relacionadas continuam dependendo do AniList ID.

## Depois: tabelas descontinuadas arquivadas

- **O que mudou.** `Episode` (cópia por usuário dos episódios) e `WatchProgress` (progresso por episódio) saíram do schema do app e do Prisma.
  - Elas não foram apagadas: foram para o schema `animehub_archive`, sem chave estrangeira e com `anilistId` e `userId` em cada linha.
  - O motivo: os episódios ambíguos (temporadas internas da Kitsu) e o episódio 0 nunca foram copiados para o episódio global e só existem ali.
  - A migração não falha se o arquivo já existir: tabela vazia só sai, e tabela com linhas vai para `animehub_archive_<data_hora>`.
- **Banco.** `20261102100000_archive_episode_watchprogress`. Apagar de vez é `DROP SCHEMA "animehub_archive" CASCADE`, depois de conferir em produção.
- **Testes.** O setup do Playwright também limpa `animehub_archive`. A migração foi conferida com dados: arquivar, arquivar de novo sobre um arquivo existente e apagar o item de lista depois.

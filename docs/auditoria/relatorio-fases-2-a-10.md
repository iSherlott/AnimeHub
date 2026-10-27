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
- **Limitação.** Relacionadas continuam dependendo do AniList ID (acompanhar e comunidade foram resolvidos depois).

## Depois: tabelas descontinuadas arquivadas

- **O que mudou.** `Episode` (cópia por usuário dos episódios) e `WatchProgress` (progresso por episódio) saíram do schema do app e do Prisma.
  - Elas não foram apagadas: foram para o schema `animehub_archive`, sem chave estrangeira e com `anilistId` e `userId` em cada linha.
  - O motivo: os episódios ambíguos (temporadas internas da Kitsu) e o episódio 0 nunca foram copiados para o episódio global e só existem ali.
  - A migração não falha se o arquivo já existir: tabela vazia só sai, e tabela com linhas vai para `animehub_archive_<data_hora>`.
- **Banco.** `20261102100000_archive_episode_watchprogress`. Apagar de vez é `DROP SCHEMA "animehub_archive" CASCADE`, depois de conferir em produção.
- **Testes.** O setup do Playwright também limpa `animehub_archive`. A migração foi conferida com dados: arquivar, arquivar de novo sobre um arquivo existente e apagar o item de lista depois.

## Depois: acompanhar obras sem AniList ID

- **O que mudou.** Dá para acompanhar as obras só do AniDB (ou só da Kitsu), pela página delas ou pelo cartão do Explorar.
  - O item de lista fica sem AniList ID; a identidade é a obra do catálogo, uma vez por pessoa.
  - A página da pessoa é a do catálogo com os controles dela: andamento, nota, favorito, "onde eu assisto" e deixar de acompanhar.
  - A nota entra na nota do site da obra do catálogo. A obra aparece em Minha Lista e no perfil.
  - Sem horário, a obra não entra no calendário nem nos avisos. Comentários e publicações respondem 409 até a obra ser ligada à AniList.
  - Ao ligar a obra à AniList, o item ganha o AniList ID. Se a pessoa já tinha a obra da AniList, fica um item só, com o que ela tinha marcado.
- **Banco.** `20261103100000_follow_catalog_only_works`: `Anime.anilistId` opcional e índice único (pessoa, obra do catálogo). A migração para, com a lista, se encontrar itens repetidos.
- **Testes.** Spec 114.

## Depois: Kitsu e AniDB na atualização seletiva

- **O que mudou.** A atualização seletiva compara também com a Kitsu e com o AniDB. Cada lote usa uma fonte, e Admin → Catálogo de obras tem um botão por fonte, com quantas obras do filtro têm aquele identificador.
  - **Kitsu:** consulta de 20 em 20 obras. Traz títulos, sinopse, formato, situação, episódios, datas, capa e banner.
  - **AniDB:** uma obra por vez, com o intervalo do AniDB, em segundo plano; a revisão mostra o andamento. Traz títulos, sinopse (sem a marcação de links), tipo, episódios, datas e capa. No primeiro sinal de bloqueio para, e o resto fica como falha para reprocessar.
  - O que a fonte não informa não apaga nada. Temporada e ano não são deduzidos da data, e categorias da Kitsu não viram gêneros.
  - Coleta no AniDB e lote de episódios do AniDB não rodam ao mesmo tempo, porque o limite do AniDB é do servidor inteiro.
- **Banco.** `20261104100000_field_update_sources` (só acrescenta `FieldUpdateItem.sourceId`; lotes antigos continuam pelo `anilistId`).
- **Testes.** Spec 115 (Kitsu e AniDB falsos) e `src/lib/fieldUpdate.test.ts`. O setup do Playwright passou a apontar a Kitsu para um servidor local (antes alguns fluxos iam à kitsu.io de verdade).

## Depois: comunidade das obras sem AniList ID

- **O que mudou.** Publicações, discussões, comentários de quem acompanha e quiz passaram a valer também para as obras só do AniDB (ou só da Kitsu), pela obra do catálogo.
  - A página da obra mostra "Discussões sobre esta obra" e "Publicar sobre este anime" (`/publicar?obra=anidb-<id>`). O seletor de obra do editor também acha essas obras, e o post leva à página delas.
  - A página de quem acompanha mostra os comentários. Denunciar um comentário exige acompanhar aquela mesma obra (antes, uma comparação com "AniList ID nulo" casaria com qualquer obra sem ele).
  - Quiz em `/obra/anidb-<id>/quiz`. Na carga do admin, `"anidbId": <id>` ou `"work": "anidb-<id>"` (no CSV, o campo "ID da obra" aceita `anidb-<id>`).
  - Ao ligar a obra à AniList, publicações, comentários e quiz vão junto. Se a obra da AniList já tem quiz, o do AniDB é arquivado, sem perder perguntas, tentativas nem títulos.
  - Os tópicos em alta do feed continuam só com obras da AniList.
- **Banco.** `20261105100000_catalog_only_community` (só acrescenta colunas e índices e relaxa o AniList ID de `Comment` e `Quiz`).
- **Testes.** Spec 116.

## Depois: comunidades dos animes (fórum estilo Orkut)

- **O que mudou.** Cada anime ganhou uma comunidade: o fórum da franquia inteira (temporadas, OVAs e filmes juntos), em `/comunidades/<chave>`. Detalhes no ADR 0011.
  - Ler é público. Para criar tópico, responder e votar, a pessoa clica "Participar".
  - Tópicos com título, mensagem, spoiler e "Sobre" (de qual temporada ou filme falam), com enquete opcional (um voto por pessoa).
  - Editar é só de quem escreveu; apagar, de quem escreveu ou da moderação.
  - "Minhas comunidades" (`/comunidades`, também no topo da página Comunidade) mostra o que teve atividade depois da última visita.
  - A página de cada obra tem o cartão "Comunidade do anime".
  - Obra só do AniDB tem a comunidade dela, que vai junto quando a obra é ligada à AniList.
  - Se a chave da franquia mudar (uma obra mais antiga entra no grupo), a comunidade continua achada e duplicatas viram uma só.
- **Banco.** `20261106100000_communities` (só cria tabelas).
- **Testes.** Spec 117 e `src/lib/community.test.ts`.
- **Fora desta versão.** Denúncia, fixar e trancar tópicos; aviso de resposta.

## Depois: Feed, comunidades no formato do Orkut e correções (26/10)

- **Feed.** A aba "Comunidade" (as publicações) virou "Feed". A lateral ganhou "Em alta agora": as hashtags com mais publicações nos últimos 7 dias.
- **Comunidades.** Novo item no menu. O fórum de cada anime ficou em 3 colunas como no Orkut (comunidade, seção, membros e relacionadas). Detalhes no ADR 0011.
  - Moderação: fixar, trancar, descrição e denúncias resolvidas em Acesso e moderação.
  - Eventos com presença ("Vou"/"Talvez").
  - Diretório com Minhas, Populares e Buscar.
- **Correções.**
  - O sino tem um contador só, mostra as 5 últimas por canal com "Ver mais" e tem "Marcar todas como lidas" no topo.
  - O "Mais filtros" do Explorar ganhou palavras no título, na sinopse e a excluir, faixa de episódios e nota mínima.
  - O atalho de Configurações saiu do cabeçalho, e "Minhas conquistas" saiu do menu do avatar (fica no perfil).
  - O menu do admin ficou agrupado por tipo.
- **Banco.** `20261107100000_community_orkut` (só acrescenta).
- **Testes.** Specs 118 (correções), 119 (Feed) e 120 (Orkut); 117 ajustado.

## Depois: perfil no formato do Orkut (26/10)

- **Perfil em 3 colunas** (ADR 0012):
  - à esquerda, o menu, os fãs e as avaliações;
  - no centro, o cabeçalho, a sorte do dia, o quem sou eu, os recados, os depoimentos e as abas de antes;
  - à direita, os amigos, as comunidades e as conquistas.
- **Amigos** são quem se segue mutuamente.
- **Recados.** Qualquer conta escreve.
- **Depoimentos.** Só amigos escrevem, e o depoimento aparece depois de aprovado.
- **Avaliações.** Só amigos avaliam: Otaku raiz, Gente boa e Sem spoiler, de 0 a 3.
- **Sorte do dia.** Só a dona do perfil vê.
- **Quem sou eu.** Ganhou anime e personagem favoritos e até 5 gêneros, em Editar perfil.
- **Notificações.** O sino avisa de recado, depoimento e fã.
- **Banco.** `20261108100000_profile_orkut` (só acrescenta).
- **Testes.** Spec 121 e `dailyFortune.test.ts`; spec 70 ajustado.

## Depois: avisos das comunidades e busca no fórum (26/10)

- **Sino.**
  - Avisa de respostas nos tópicos em que a pessoa participa (criou ou respondeu). Um aviso por tópico até ser lido.
  - Avisa de eventos novos nas comunidades dela.
  - O aviso leva à resposta ou ao evento.
- **Configurações.** Nova preferência "Comunidades", ativada por padrão.
- **Busca no fórum.** Procura no título, no texto e nas respostas; todas as palavras precisam aparecer.
- **Banco.** `20261109100000_community_notifications` (só acrescenta).
- **Testes.** Spec 122; spec 52 e `community.test.ts` ajustados.

## Depois: amizade separada do seguir (26/10)

- **Pedido de amizade como no Orkut:**
  - "Adicionar como amigo" fica no perfil.
  - A página Amigos (`/amigos`, também no menu da conta) tem os pedidos recebidos e os enviados.
  - Dá para aceitar, recusar, cancelar e desfazer.
  - Se as duas pessoas pedirem, vira amizade direto.
- **O que mudou:** depoimentos, avaliações e a grade de amigos passam a usar a amizade. Seguir continua separado.
- **Sino:** avisa do pedido recebido e do pedido aceito.
- **Bloqueio:** desfaz a amizade.
- **Banco.** `20261110100000_friendships`: quem já se seguia mutuamente vira amigo.
- **Testes.** Spec 123; spec 121 ajustado.

## Depois: revisão de interface e moderação dos perfis (26/10)

- **Revisão de interface** (desktop e celular):
  - o sino fica na barra também no celular;
  - "Adicionar como amigo" fica ao lado de "Seguir perfil";
  - no celular, o perfil abre pelo cabeçalho;
  - no celular, a comunidade tem um cabeçalho compacto;
  - o próprio tópico deixou de contar como novidade;
  - o rótulo da busca virou "Busca no Feed".
- **Moderação dos perfis.**
  - Recados e depoimentos podem ser denunciados, com motivo e confirmação.
  - A fila "Denúncias dos perfis" fica em Acesso e moderação: remover ou manter, e uma decisão fecha todas as
    denúncias do mesmo conteúdo.
- **Banco.** `20261111100000_profile_reports` (só acrescenta).
- **Testes.** Spec 124.

## Depois: encontrar pessoas para amizade (26/10)

- **Busca na página Amigos.** Por nome ou @identificador, com o botão de amizade em cada resultado.
- **Sugestões.** Quem participa das mesmas comunidades ou acompanha os mesmos animes. Anime em comum só conta para quem
  deixa a lista pública.
- **Onde as sugestões também aparecem:**
  - na lateral do Feed ("Pessoas que você talvez conheça");
  - no próprio perfil, enquanto não há amigos;
  - nas sugestões de quem seguir da aba "Seguindo".
- **Banco.** Sem migração.
- **Testes.** Spec 125.

## Depois: recados mais completos (26/10)

- **Responder recado.** A resposta vai para o perfil de quem escreveu, marcada como resposta.
- **Conversa entre duas pessoas.** `/users/<id>/recados/com/<outro>`, nos dois sentidos e em ordem, com o campo para
  escrever.
- **Lista de fãs.** `/users/<id>/fas`.
- **Banco.** `20261112100000_scrap_replies` (só acrescenta).
- **Testes.** Spec 126.

## Depois: aniversários (26/10)

- **Data no perfil.** Aniversário opcional, só com dia e mês, e só amigos veem.
- **Aniversariantes.** Hoje e nos próximos 7 dias, na página Amigos e na lateral do Feed.
- **Sino.** Avisa no dia, com o link para deixar um recado.
- **Banco.** `20261113100000_birthdays` (só acrescenta).
- **Testes.** Spec 127 e `birthdayDates.test.ts`.

## Depois: visitas ao perfil (26/10)

- **Quem visitou.** Só a dona do perfil vê: a caixa no perfil e a página `/users/<id>/visitas`, com os últimos 90
  dias.
- **Configurações.** "Registrar minhas visitas aos perfis". Desligado, as visitas da pessoa somem para todos e ela também
  não vê as dela.
- **Bloqueio.** Não registra a visita e esconde a já registrada.
- **Banco.** `20261114100000_profile_visits` (só acrescenta).
- **Testes.** Spec 128.

## Depois: comunidades no Feed (26/10)

- **Atalho nas publicações.** A publicação sobre uma obra do catálogo ganha "Comunidade →".
- **Lateral do Feed.** A caixa "Nas suas comunidades" mostra os tópicos mais ativos das comunidades da pessoa.
- **Banco.** Sem migração.
- **Testes.** Spec 129.

## Depois: álbuns de animes e avatar só de anime (26/10)

- **Avatar e capa.** Só imagens dos animes acompanhados: o envio de foto própria saiu, e quem tinha foto enviada volta
  às iniciais.
- **Álbuns.** Coletâneas de animes:
  - automáticos: Assistindo, Terminei, Não terminei e Dropei;
  - personalizados, com obras da própria lista.
- **Quem vê os álbuns.** Segue "Mostrar meus animes".
- **Banco.**
  - `20261115100000_profile_albums` (só acrescenta);
  - `20261115110000_avatar_from_anime_only` (zera os avatares enviados).
- **Testes.** Spec 130; spec 46 ajustado.

## Depois: auditoria e decisões (27/10)

- **Auditoria.** Regras de negócio, falhas de lógica, fluxos e as páginas uma a uma, em
  `docs/auditoria/auditoria-regras-e-paginas.md`. As falhas encontradas foram corrigidas (spec 131).
- **Decisões aplicadas:**
  - o bloqueio no Feed vale para todos;
  - o avatar de anime não acompanhado volta ao padrão;
  - o andamento tem um nome só e fica nos álbuns;
  - eventos e álbuns podem ser denunciados;
  - "Seguindo" inclui os amigos;
  - o visitante vê "Adicionar como amigo";
  - as visitas antigas são apagadas;
  - o perfil ficou mais leve (47 → 36 consultas);
  - os aniversários são calculados uma vez por dia.
- **Banco.** `20261116100000_reports_events_albums` (só acrescenta).
- **Testes.** Spec 132; specs 77, 82 e 127 ajustados.

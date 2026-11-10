# Jobs e processos

Este documento cobre a Fase 8 (§15): a política de cada processo automatizado e manual.

## Regras gerais

- **Permissão.** Todo job do painel exige administrador, verificado no servidor (`requireAdmin`). O teste `src/lib/routeAuthorization.test.ts` falha se uma rota nova nascer sem verificação.
- **Concorrência.**
  - CURATION, TIMELINE, TRANSLATION e ANILIST rodam **um por vez**.
  - O início acontece numa transação com trava do Postgres (`pg_advisory_xact_lock` pelo tipo, `src/lib/jobLock.ts`). Pedidos simultâneos são serializados, e o segundo recebe "já há um rodando" (#seq).
  - IMPORT pode ter vários lotes em revisão, mas o commit é único por lote.
  - FIELD_UPDATE pode ter vários lotes em revisão; a execução trava o próprio lote (etapa `APPLY`).
- **Sinal de vida e interrupção.**
  - Os jobs exclusivos gravam `heartbeatAt` a cada passo.
  - Um job em execução sem sinal há mais de 10 minutos (o limite de cada tipo) é dado como interrompido: vira FAILED, com um log `Job stale`, e outro pode começar.
  - Uma interrupção (queda do servidor) nunca deixa a trava presa para sempre.
- **Idempotência e retomada.** Repetir não duplica nem desfaz o que foi feito:
  - **CURATION:** continua das obras que faltam na versão atual.
  - **TRANSLATION:** pula as sinopses traduzidas.
  - **TIMELINE:** recalcula e não mexe na ordem manual.
  - **ANILIST:** grava por upsert.
  - **FIELD_UPDATE:** confere, antes de gravar, se o valor ainda é o da coleta; senão marca conflito.
- **Cancelamento** (CURATION, TIMELINE, TRANSLATION).
  - É cooperativo: Admin → Jobs → Cancelar grava `cancelRequestedAt`, e o job para no próximo passo como CANCELLED.
  - O que já foi gravado fica. Cada item é gravado inteiro, nunca pela metade, e rodar de novo continua dali.
  - A importação cancela pela revisão do lote (antes do commit nada é gravado).
- **Limites.**
  - AniList: lotes de 50 IDs, 40 na agenda, com pausa de 1,5 s; respeita 429 / `Retry-After`.
  - Atualização seletiva: até 150 obras por lote (AniList e Kitsu) e 50 pelo AniDB. A Kitsu é consultada de 20 em 20; o AniDB uma obra por vez, com `ANIDB_REQUEST_GAP_MS` entre elas, em segundo plano, e para no primeiro sinal de bloqueio (o resto do lote fica como falha, para reprocessar). Coleta no AniDB e lote de episódios do AniDB não rodam juntos.
  - Releitura da agenda de uma obra: no máximo uma a cada 2 minutos.
  - Tradução: cota do serviço, com parada limpa quando ela acaba.
- **Timeout e retries.**
  - AniList: até 3 novas tentativas em 429 (até 60 s cada).
  - Curadoria: 3 tentativas por lote; o lote que falha fica para a próxima execução e é contado em `failedBatches`.
  - Coleta da atualização seletiva: falha de rede marca os itens como FAILED, e eles podem ser reprocessados.
- **Antes ou depois de gravar.**
  - Importação: o FAILED na análise acontece antes de qualquer gravação.
  - Atualização seletiva: cada item é uma transação; um item com falha não grava nada dele.
  - Curadoria, tradução e linhas do tempo: gravam item a item, e o resumo diz até onde foi.

## Serviços de fundo

| Serviço | Frequência | Registro |
|---|---|---|
| calendar-loader | 30 min | `IngestionRun` (OK / PARTIAL / ERROR, itens) |
| notifier | 2 min | `IngestionRun` |
| news-fetcher | agenda própria (painel de notícias) | `NewsRun` |
| cache-updater, imagens | diário, 00:00 (America/Sao_Paulo) | `EpisodeImageRun` |

Admin → Jobs mostra, para cada serviço, a última execução, a última com sucesso, a próxima prevista e as falhas nas últimas 24 h. Um serviço "atrasado" é o que já passou de um intervalo inteiro além da próxima execução prevista.

## Logs

- **`AdminLog`** guarda o que aconteceu em cada job (com `jobSeq`): fonte, nível, evento, mensagem, contexto e quem fez.
- **`ChangeLog`** guarda o que mudou em cada campo, com `jobSeq` e `batchId`.
- **Sem segredos.** Nenhum log grava token, senha, cookie ou chave. As credenciais ficam só no ambiente.

## Notícias: o site oficial de cada obra (09/11/2026)

O `news-fetcher` lê três fontes, nesta ordem:

1. **Feed RSS do Anime News Network.** Uma requisição só; cada notícia é ligada às obras pelo título.
2. **Site oficial de cada obra da temporada** (`CatalogEntry.officialSite`), em `src/lib/officialNews.ts`.
3. **Jikan (MyAnimeList).** Uma requisição por obra com `idMal`.

Cada notícia nova vira uma publicação do NewsHub.

### O padrão dos sites oficiais

Pesquisa em 50 sites da temporada de outono de 2026:

- A página inicial liga para uma lista de notícias: `news/`, `news/index.html` ou `news.html`.
- Cada item da lista (`<li>`, `<article>`, `<tr>` ou `<dt>`) traz a data e o link da matéria, dentro do caminho de
  notícias. A data aparece como `2026.11.07`, `2026/11/07`, `2026-11-07` ou `2026年11月7日`.
- Os sistemas por trás variam:
  - WordPress, com o feed das notícias em `news/feed/`;
  - `news/index00350000.html`;
  - `news/?article_id=` ou `news/?id=`;
  - `detail.php?id=`.

  A forma da lista, porém, é sempre essa.

### Como o leitor funciona

- **Ordem:** primeiro o feed (RSS/Atom) do site, se houver; sem feed, a lista de notícias.
- **Feed geral do WordPress:** às vezes só tem o "Hello world!" de exemplo. Por isso só entra o que está no caminho de
  notícias.
- **Data:** é a primeira data do item. Um título pode citar outra ("Blu-ray em 2027年1月27日"), e uma data no futuro não
  é data de publicação.
- **Limites:**
  - O `robots.txt` de cada site é respeitado.
  - Só se leem a página inicial, o feed e a lista. As matérias em si não são abertas.
  - Há uma pausa entre um site e outro, e um teto de 10 minutos por execução.
  - Endereços de rede interna (localhost, 10.x, 192.168.x…) nunca são lidos.

### Resultado na pesquisa

- **35 de 50 sites** deram notícias com data e link certos.
- **6 sites** não deixam ler: 403, robots ou fora do ar.
- **9 sites** montam a lista no navegador com JavaScript. Neles, a API do WordPress responde 403 e o feed vem vazio.
- Essas obras continuam com as notícias do Anime News Network e da MyAnimeList.

### Títulos em japonês

O título sai como o site publica, em japonês. O tradutor do projeto traduz a partir do inglês e protege o texto em
japonês, em vez de traduzi-lo.

### A regra de não ler sites (D-30)

Ela continua valendo para todo o resto. A exceção é só a lista de notícias do próprio site da obra, pedida em 09/11.

# Fontes de dados

Este documento descreve as fontes externas de dados (Fase 6, §11). Ele registra o que cada uma oferece, os limites que o código respeita e como cada valor é atribuído.

A regra geral vale para todas as fontes:

- **Ausência não apaga.** Um campo ausente na resposta, ou uma fonte fora do ar, nunca apaga um dado válido. Na comparação ele aparece como "a fonte não informa".
- **Campo protegido não muda.** Um campo corrigido à mão (`manualFields`) não é sobrescrito sem uma escolha explícita do admin.
- **Toda mudança tem origem.** Cada mudança vai para o `ChangeLog`, com a origem:
  - `IMPORT`: lote de importação, com `jobSeq` e `batchId`;
  - `SOURCE`: a fonte mudou um horário;
  - `CURATION`: a curadoria;
  - `ADMIN`: edição manual.
- **Credenciais ficam no ambiente.** Nenhuma chave vai para os logs nem para arquivos versionados. Elas vivem no ambiente (`.env`, Secret do k8s).

## AniList (GraphQL, `ANILIST_API_URL`)

| Item | Detalhe |
|---|---|
| Identificador | `anilistId` (`Media.id`); `idMal` também vem. |
| Campos | Títulos romaji, inglês e nativo; sinopse (HTML); formato; situação; total de episódios; temporada e ano; datas (*fuzzy date*); gêneros e etiquetas; `isAdult`; capa e banner; links externos (site oficial e streaming); relações; próximo episódio; agenda de episódios (`airingSchedules`, com dia e hora). |
| Limite | Cerca de 90 requisições por minuto. Em resposta 429, o código espera o `Retry-After` ou faz backoff exponencial (até 3 tentativas, no máximo 60 s cada; `src/lib/anilist.ts`). A agenda é lida em lotes de 40 obras, com pausa de 1,5 s entre eles (`anilistImport.loadAiring`). |
| Paginação | `Page(page, perPage ≤ 50)` com `pageInfo.hasNextPage`. |
| Frequência | A agenda é relida a cada 30 min (`calendar-loader`). Os painéis do admin consultam sob demanda (atualização seletiva até 150 obras por lote; releitura da agenda de uma obra no máximo a cada 2 min). |
| Falhas | Uma falha de rede marca os itens do lote como `FAILED`. Nada é gravado, e eles podem ser reprocessados. |
| Incremental | Não por data de alteração. A consulta é por lista de IDs (`id_in`) ou por temporada. |
| Não traz | Título por episódio, sinopse de episódio, horário no streaming (o horário é o da TV; o atraso é configurado por obra, ver ADR 0007), obras sem cadastro na AniList. |
| Atribuição | Campos do catálogo com origem `anilist`. O horário do episódio tem certeza `EXACT`. |

## Kitsu (REST JSON:API)

| Item | Detalhe |
|---|---|
| Identificador | `kitsuId`. O vínculo AniList → Kitsu é guardado em `EpisodeImageSource` e `EpisodeSourceCheck`. |
| Campos | Episódios: número, temporada interna, títulos, sinopse, miniatura e data (só o dia). |
| Limite | Sem limite publicado. O código pagina com 20 itens por página e consulta cada obra no máximo uma vez por semana (`EpisodeSourceCheck`). |
| Não traz | Horário de exibição. Números que reiniciam por temporada interna são ambíguos e ficam de fora do episódio global (ADR 0009). |
| Atribuição | Origem `kitsu` no episódio global. O dia gravado tem certeza `DATE_ONLY`. |

## AniDB (HTTP API + HTML da temporada)

| Item | Detalhe |
|---|---|
| Identificador | `anidbId`. |
| Campos | Títulos em vários idiomas (pt, ja, x-jat, en), sinopse, imagem, episódios (número, títulos, dia), nota, prêmios e recursos. O HTML da temporada é colado pelo admin. |
| Limite | API com cliente registrado, uma requisição a cada 2 s, e uso em "Atualizar dados" de uma obra (`src/lib/anidb.ts`). O HTML colado não faz requisição. |
| Não traz | Sinopse e miniatura por episódio, horário. Especiais têm numeração própria (`S1`, `C2`…) e não entram na sequência regular. |
| Atribuição | Origem `anidb`. As correspondências AniDB ↔ AniList são revisadas em Admin → Correspondências. |

## Jikan, MyMemory/LibreTranslate, notícias

São fontes auxiliares:

- **Jikan:** gêneros, via MAL.
- **MyMemory e LibreTranslate:** tradução de sinopses.
- **RSS:** notícias.

Nenhuma delas é dona de um campo canônico do catálogo; a tradução vai para `descriptionPt`. Os limites e as falhas de cada uma estão no código de cada serviço (`src/lib/translate.ts`, `src/lib/newsRss.ts`).

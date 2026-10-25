# ADR 0010 — Gêneros como entidade, estado das traduções e ciclo das pendências (Fase 7)

Status: aceito em 25/10/2026 (decisão D4 da auditoria).

## Contexto

- **Gêneros.** Os gêneros viviam como texto separado por vírgula em quatro tabelas (`CatalogEntry`, `Production`, `Anime`, `AiringScheduleEntry`). O vocabulário de 18 gêneros estava fixo no código. Não havia como renomear, mesclar ou excluir um gênero com segurança, nem contar obras sem varrer o texto.
- **Traduções.** A tradução automática podia passar por cima de uma sinopse corrigida.
- **Pendências.** Não havia como ignorar uma pendência com justificativa, medir reaberturas ou priorizar pelo impacto.

## Decisão

### Gêneros: tabela `Genre` e índice `CatalogGenre`

- **O banco aplica o vocabulário.** Um gatilho `BEFORE INSERT/UPDATE OF genres` em `CatalogEntry` passa a lista por `animehub_canonical_genres`. Na gravação:
  - variações (`aliases`) viram o gênero;
  - gênero mesclado vira o destino;
  - gênero excluído some;
  - repetições caem.

  Isso vale para qualquer gravação: importação, curadoria, edição ou SQL.
- **O índice acompanha.** Um gatilho `AFTER` mantém o índice obra↔gênero (`CatalogGenre`, com chave estrangeira para `Genre`). Gênero desconhecido entra como "não registrado", para o admin revisar.
- **Uma só fonte de verdade.** `CatalogEntry.genres` continua sendo a forma de gravar e de ler nos filtros. `CatalogGenre` é um índice derivado, mantido pelo banco, nunca escrito pelo código. O vocabulário é a tabela `Genre`; a lista do código (`genreTaxonomy`) é só o ponto de partida das importações.
- **Operações do admin** (`src/lib/genres.ts`, Admin → Taxonomia): criar, editar (rótulo, descrição, variações, +18), renomear (cria o novo e mescla o antigo), mesclar e excluir.
  - Excluir um gênero com obras exige escolher: transferir para outro gênero ou remover das obras. A tela mostra quantas obras serão afetadas antes de confirmar.
  - Cada obra afetada ganha uma linha no `ChangeLog` (lote `genre-…`), e as cópias passam pela mesma função.
- **Validação** da edição da obra usa o vocabulário atual do banco.

### Traduções

- **Estado da sinopse em português.** `CatalogEntry.descriptionPtStatus` vale `AUTO`, `REVIEWED` ou `MANUAL`, com origem e revisor. O estado é derivado assim:
  - sem tradução, com original: **pendente**;
  - sem tradução e sem original: **ausente**.
- **Proteção.** Revisada e manual entram em `manualFields`. A gravação automática (`storeSynopsis`, curadoria) não passa por cima delas.
- **Admin → Traduções:** aprovar, editar, rejeitar (descarta também o cache automático), traduzir de novo (só o que não está protegido) e exportar por estado. Também mostra os títulos e as leituras que faltam.

### Pendências

- **Ciclo de vida.** `CurationIssue` ganhou `resolvedAt`, `reopenCount`, `dismissedReason` e `dismissedBy`.
  - A curadoria mantém ignorada a pendência que o admin ignorou, enquanto a condição for a mesma.
  - Uma pendência resolvida que volta é reaberta, e a recorrência é contada.
- **Prioridade.** `src/lib/curation/priority.ts` define alta, média ou informativa por tipo. A variável `CURATION_PRIORITIES` (JSON) sobrepõe o padrão. A ausência de dado opcional é informativa.
- **Admin → Pendências:**
  - filtros por tipo, prioridade, fonte, estado e data;
  - resolver só quando a condição foi atendida, conferido na obra; tipos que dependem de decisão humana exigem motivo;
  - ignorar com justificativa;
  - reabrir;
  - indicadores: abertas, críticas, resolvidas, tempo médio, recorrentes, taxa de reabertura, por tipo e por fonte.

### Franquias

- **Admin → Franquias:** reordenar, escolher papel e temporada, ver a prévia, salvar e desfazer.
- A ordem salva entra em `manualFields`, e a auditoria das linhas do tempo passou a respeitar esses campos.

## Consequências

- O banco passa a ter funções e gatilhos (`animehub_*`). Eles ficam na migração `20261028100000_taxonomy_translations_issues`.
- Para reverter os gatilhos: `DROP TRIGGER catalog_genres_before ON "CatalogEntry"; DROP TRIGGER catalog_genres_after ON "CatalogEntry";`. Isso não afeta os dados.
- A gravação de gêneros fica um pouco mais cara (uma consulta pequena por gênero). É desprezível no volume atual (cerca de 17 mil obras).
- `""` em `CatalogEntry.genres` passou a ser gravado como nulo.

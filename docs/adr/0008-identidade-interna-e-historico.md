# ADR 0008 — Identidade interna da obra e histórico de alterações (Fase 2)

Status: aceito em 25/10/2026 (decisão D1 da auditoria).

## Contexto

Tudo se ligava pelo `anilistId`, um número externo e sem chave estrangeira. 2.178 obras só do AniDB (13% da plataforma)
não têm esse número e ficavam fora de agenda, lista e sino. A integridade dependia do código, e não havia histórico de
quem mudou o quê.

## Decisão

- **O id do catálogo é a identidade.** `Production`, `Anime` e `AiringScheduleEntry` ganharam `catalogEntryId` com chave
  estrangeira RESTRICT, preenchido na migração pelo `anilistId` e por quem cria as linhas a partir de agora
  (`src/lib/catalogLink.ts`). O `anilistId` continua como identificador externo.
- **Juntar obras repassa os dependentes** (`reassignCatalogEntry`) antes de apagar a que sai.
- **Histórico estruturado** (`ChangeLog`): uma linha por campo, com antes, depois, autor, origem, motivo, job e lote
  (`src/lib/changeLog.ts`).
- **Campos protegidos** (`CatalogEntry.manualFields`): a base para a edição da Fase 3.
- **Verificação de integridade** (`src/lib/integrity.ts`, `GET/POST /api/admin/integrity`).
- **`WatchProgress` descontinuada** (sem uso e sem linhas); a remoção fica para depois da confirmação.

A regra campo a campo está em [docs/arquitetura/fonte-de-verdade.md](../arquitetura/fonte-de-verdade.md).

## Consequências

- A migração só acrescenta e é reversível (SQL no documento acima). Durante a transição, o código antigo continua
  funcionando: as colunas novas aceitam nulo.
- Apagar uma obra do catálogo com dependentes passa a falhar no banco: quem apaga precisa repassar ou tirar os
  dependentes antes.
- Ainda dependem do `anilistId` (a migrar nas fases seguintes): alertas do sino, traduções, reboots e arcos, imagens de
  episódio, notícias, quizzes.

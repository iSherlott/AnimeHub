# Fonte de verdade dos dados das obras

Documento da Fase 2 (ADR 0008), atualizado até a Fase 9. Diz, campo a campo, **de quem é** cada informação, de onde ela
vem, quem pode alterá-la e como ela chega às outras tabelas. Ver também ADR 0009 (episódios globais) e ADR 0010
(gêneros, traduções, pendências).

## As quatro naturezas de dado

| Natureza | Onde mora | Regra |
|---|---|---|
| **Canônico da obra** | `CatalogEntry` | uma linha por obra; é o que vale. Cópias leem daqui. |
| **Cópia da obra** | `Production` (página pública), `Anime` (item da lista), `AiringScheduleEntry` (snapshot para o calendário) | só para compatibilidade e desempenho; nunca é editada à mão; é atualizada pelo serviço de propagação. |
| **Pessoal** | `Anime` (estado do acompanhamento), `PlatformLink`, `AiringAlert`, `PendingEpisode` | é da pessoa; nunca vem de fonte externa nem é propagado. |
| **Episódio da obra** | `AiringScheduleEntry` (o episódio global da obra desde a Fase 4, decisão D2) | global; não depende de ninguém acompanhar a obra. |

A identidade é o **id do catálogo** (`CatalogEntry.id`). `anilistId`, `anidbId`, `kitsuId` e `malId` são identificadores
externos: preservados, nunca inventados, e uma obra pode não ter nenhum deles além do da fonte em que foi encontrada.

## Campo a campo

### Obra (`CatalogEntry`)

| Campo | Origem | Pode ser manual? | Observação |
|---|---|---|---|
| `anilistId`, `anidbId`, `kitsuId`, `malId`, `source` | importação | não | identificadores externos; únicos (exceto `malId`) |
| `titleRomaji`, `titleEnglish`, `titleNative` | AniList / AniDB, curadoria | sim | `titleLocked` = o nome do AniDB vale sobre a AniList |
| `description` | AniList / AniDB, curadoria | sim | texto da fonte (inglês) |
| `descriptionPt`, `descriptionJa` | tradução (`SynopsisTranslation`) | sim | `descriptionPtStatus`: AUTO, REVIEWED ou MANUAL (Fase 7); revisada e manual são protegidas |
| `format`, `kind` | fonte; `kind` derivado do formato | sim | `kind` = Série, OVA, ODA, Filme, Outros |
| `status`, `episodes`, `startDate`, `endDate`, `season`, `seasonYear` | AniList (prioridade), AniDB | sim | `episodes` = **total informado pela fonte**, não lançados |
| `genres` | AniList + tags do AniDB, normalizado na taxonomia | sim | texto separado por vírgula; o banco aplica o vocabulário (`Genre`) em toda gravação e mantém o índice `CatalogGenre` (Fase 7) |
| `coverImage`, `bannerImage`, `officialSite` | fonte | sim | |
| `averageScore`, `popularityRank`, `relationsJson` | AniList | não | dados da fonte, só leitura |
| `nextEpisodeNumber`, `nextEpisodeAt` | AniList (+ atraso do streaming) | não | derivados; a agenda é a referência |
| `franchiseKey`, `timelineOrder`, `timelineRole`, `timelineSeason`, `timelineAt` | auditoria das linhas do tempo | sim (Admin → Franquias, protegido) | derivados das relações; a auditoria não muda o que é manual |
| `siteScore`, `siteScoreVotes` | votos de quem terminou | não | derivados |
| `streamingDelayMinutes`, `streamingSite` | admin | só manual | Epic 50 |
| `onPlatform` | admin (importação, despublicar) | só manual | `false` = cache de busca, invisível |
| `manualFields` | admin | — | lista dos campos protegidos (ver abaixo) |
| `curatedAt`, `curationVersion`, `complementedAt` | processos | não | controle |

### Página pública (`Production` + `Franchise`)

| Campo | Natureza |
|---|---|
| títulos, capa, banner, sinopse, formato, situação, episódios, temporada, ano, gêneros, site oficial | **cópia** do catálogo (a página já completa com o catálogo o que falta — `workFacts`) |
| `franchiseId`, `seasonNumber` | próprios: agrupamento da página e posição na franquia |
| `streamingLinksJson` | próprio: onde assistir (AniList + AniDB) |
| `relationsJson`, `titleLocked`, `anidbId` | da fonte / da importação |
| `catalogEntryId` | identidade (FK, único) |

### Item de lista (`Anime`)

| Campo | Natureza |
|---|---|
| `watchState`, `waiting`/`waitingSince`, `isFavorite`/`favoritedAt`, `userScore`/`scoredAt`, `createdAt` | **pessoal** |
| `titlePortuguese`, `descriptionPortuguese`, `PlatformLink` | **pessoal** (correção/anotação da pessoa) |
| títulos, capa, sinopse, ficha, gêneros, site, trailer, elenco, recomendações, dados do AniDB | **cópia** (a página lê o catálogo primeiro) |
| `catalogEntryId` | identidade (FK) |
| `Episode` (tabela filha) | **arquivada** (schema `animehub_archive`, fora do app): copiada para o episódio global na Fase 4 |
| `WatchProgress` | **arquivada** (schema `animehub_archive`, fora do app): progresso por episódio (proibido) |

### Episódio global (`AiringScheduleEntry`)

| Campo | Natureza |
|---|---|
| `anilistId` + `episode` | identidade do episódio (obra + número); `catalogEntryId` = a obra (FK) |
| `airingAt` | instante (UTC) com dia e hora, da AniList com o atraso do streaming; nulo quando não se sabe a hora |
| `airDate` | só o dia (Kitsu/AniDB), quando não há hora — nunca vira um horário inventado |
| `dateCertainty` | EXACT, DATE_ONLY ou UNKNOWN |
| `status` | ACTIVE, POSTPONED ou CANCELLED (fonte ou admin); "exibido" é derivado da data |
| `episodeTitle*`, `synopsis`, `thumbnail` | do episódio (Kitsu, AniDB, admin) |
| `source`, `manualFields`, `updatedAt` | origem do registro, campos protegidos, versão otimista |
| `titleRomaji`… `description`, `coverImage`, `genres` | cópia da obra para o calendário |

Horário corrigido pelo admin num episódio que a fonte informa vira `CatalogOverride` (o original fica guardado). Se a
fonte mudar depois, abre um conflito em Admin → Conflitos ("a fonte mudou depois do override").

## Precedência

1. **Valor manual protegido** (`manualFields` na obra, `CatalogOverride` no horário de um episódio): nenhuma importação o
   sobrescreve; uma diferença vinda da fonte vira conflito para revisão.
2. **Curadoria** (correções automáticas da curadoria e da auditoria das linhas do tempo).
3. **Fonte**, por campo: AniList para situação, datas, episódios, agenda e relações; AniDB para o nome (quando fixado),
   gêneros complementares e obras que a AniList não tem; Kitsu para miniaturas e títulos de episódio.

Uma fonte indisponível ou um campo ausente na resposta **nunca** apaga o valor existente.

## Propagação

Quem altera um campo canônico (edição do admin, atualização seletiva, taxonomia) grava a obra, registra o histórico
(`ChangeLog`, com lote e job) e chama `propagateWork`, que atualiza as cópias **dos campos que elas copiam** (lista
acima), nunca os pessoais. As operações de taxonomia passam as cópias pela mesma função do vocabulário.

## Integridade

- `Production`, `Anime` e `AiringScheduleEntry` têm `catalogEntryId` com chave estrangeira **RESTRICT**: o banco não
  aceita vínculo com obra inexistente nem apagar uma obra que ainda tem dependentes.
- Juntar duas obras (religar AniDB → AniList, duplicata) passa os dependentes para a obra que fica antes de apagar a outra
  (`reassignCatalogEntry`).
- `runIntegrityChecks` (Admin → integridade) acha o que a chave não cobre: linha sem vínculo, vínculo que diverge do
  `anilistId`, órfão pelo identificador externo, duplicidade.

## Reverter a Fase 2

A migração `20261025100000_canonical_identity` só acrescenta. Para desfazer:

```sql
ALTER TABLE "Production" DROP CONSTRAINT "Production_catalogEntryId_fkey", DROP COLUMN "catalogEntryId";
ALTER TABLE "Anime" DROP CONSTRAINT "Anime_catalogEntryId_fkey", DROP COLUMN "catalogEntryId";
ALTER TABLE "AiringScheduleEntry" DROP CONSTRAINT "AiringScheduleEntry_catalogEntryId_fkey", DROP COLUMN "catalogEntryId";
ALTER TABLE "CatalogEntry" DROP COLUMN "manualFields";
DROP TABLE "ChangeLog";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261025100000_canonical_identity';
```

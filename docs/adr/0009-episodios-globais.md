# ADR 0009 — Episódios globais e "Adiar a obra" (Fase 4)

Status: aceito em 25/10/2026 (decisões D2 e D5 da auditoria).

## Contexto

Havia dois "episódios": a linha da agenda (`AiringScheduleEntry`, global, só data e hora da AniList) e uma cópia **por
usuário** (`Episode`, com título, sinopse e imagem da Kitsu/AniDB), refeita para cada pessoa que acompanhava a obra. A
mesma obra tinha tantas cópias quanto seguidores, o admin não tinha onde corrigir um episódio e a regra "o
acompanhamento é por obra" era violada pelo "Adiar" ("parei no EP02", "2 episódios para ver").

## Decisão

- **O episódio é a linha da agenda** (D2). `AiringScheduleEntry` ganhou `episodeTitle`, `episodeTitleEn`,
  `episodeTitleJa`, `synopsis`, `thumbnail`, `airDate` (só o dia), `dateCertainty`, `status`, `source`, `manualFields` e
  `updatedAt`. A identidade continua sendo (obra, número).
- **Três dimensões separadas** (`src/lib/episodeState.ts`):
  - certeza da data — `EXACT` (dia e hora), `DATE_ONLY` (só o dia), `UNKNOWN`;
  - situação informada — `ACTIVE`, `POSTPONED`, `CANCELLED` (fonte ou admin);
  - exibido — **derivado** da data, nunca guardado. Só com o dia, conta como exibido depois do dia.
- **`airingAt` passou a aceitar nulo.** Horário nunca é inventado: episódio só com o dia não entra no calendário nem
  gera aviso.
- **Fontes** (`src/lib/globalEpisodes.ts`): AniList grava dia e hora; Kitsu e AniDB completam título, sinopse, imagem e
  o dia quando não há hora. Número repetido na mesma resposta (temporadas internas da Kitsu, especiais da AniDB) é
  ambíguo e fica de fora. Campo em `manualFields` não muda. Consulta à Kitsu fica registrada em `EpisodeSourceCheck`
  (uma por semana por obra, no máximo).
- **A fonte deixar de listar não apaga** episódio com conteúdo ou corrigido: ele perde só a data (vira "data
  desconhecida"). Mudança de horário vinda da fonte fica no `ChangeLog` (origem `SOURCE`).
- **Edição pelo admin** (`src/lib/episodeEdit.ts`, `/admin/episodios`):
  - número, obra, situação e data exigem motivo;
  - versão otimista (409);
  - número repetido na obra é recusado (409);
  - corrigir a hora de um episódio que a fonte informou vira **override** (`CatalogOverride`): o original continua lá e a
    fonte segue atualizando por baixo;
  - sem hora da fonte, a data vai para o próprio episódio, protegida;
  - mudança de data avisa quem acompanha uma vez (o aviso é único por episódio; repetir o mesmo valor não gera nada).
- **`Episode` descontinuada**: copiada na migração (a cópia mais completa por obra, sem números ambíguos) e sem novas
  gravações. A remoção fica para depois da confirmação.
- **"Adiar a obra"** (D5): `PendingEpisode.fromEpisode` ficou opcional e não é mais gravado. "Para assistir" mostra
  quando a obra foi adiada e os fatos globais dela (até onde saiu, o próximo), nunca o que a pessoa viu.

## Consequências

- Toda leitura de `airingAt` precisa tratar o nulo; calendário, avisos, Explorar e "Minha lista" usam `timed()` e
  `status: "ACTIVE"`.
- Obras sem AniList ID ainda não recebem episódios (a identidade do episódio usa o `anilistId`). Fica para quando
  houver fonte de episódios para elas.
- Especiais sem numeração regular não entram na sequência; ficam como obras próprias (OVA/ODA/filme) na linha do tempo.
- Reverter: as colunas novas podem ser ignoradas; `airingAt` volta a NOT NULL só depois de apagar ou datar as linhas sem
  hora (`DELETE FROM "AiringScheduleEntry" WHERE "airingAt" IS NULL`), o que perde os episódios copiados da tabela antiga.

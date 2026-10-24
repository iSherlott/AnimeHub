# Fase 1 — Auditoria e diagnóstico (24/10/2026)

Base: o código do repositório (`master` + o Epic 50 ainda não commitado), o banco do notebook (`datatrade`, schema
`animehub`) lido hoje e os testes rodados nesta sessão. Nenhuma alteração de dado foi feita nesta fase.

> O projeto é **Next.js 16 (App Router) + React 19 + MUI 9 + Prisma/PostgreSQL**, com 5 serviços Node à parte. O pedido
> menciona "componente Angular": não há Angular aqui; o equivalente são os componentes React e as rotas `src/app/api`.

## 1. Fotografia do banco

| Tabela | Linhas | Papel |
|---|---:|---|
| `CatalogEntry` | 16.982 (15.121 na plataforma; 2.178 sem AniList ID, todas na plataforma) | catálogo canônico |
| `Production` / `Franchise` | 7.952 / 5.439 | página pública e agrupamento |
| `Anime` | 800 (1 fora da plataforma) | lista pessoal (cópia da obra + estado) |
| `Episode` | 642, de 43 obras da lista | episódios **por item de lista**, não globais |
| `AiringScheduleEntry` | 41.929 (1.166 futuros; 3.412 obras) | agenda de exibição |
| `AiringAlert` | 6 | sino de lançamento por pessoa |
| `CatalogOverride` / `CatalogConflict` | 0 / 0 | horário manual / divergência entre fontes |
| `CurationIssue` | 24.807 (24.663 abertas, 10 tipos) | pendências |
| `AnidbCandidate` | 1.253 (232 apontam obra que não está no catálogo) | correspondências AniDB→AniList pendentes |
| `AdminJob` / `ImportRecord` / `AdminLog` | 134 / 10.398 / 1.064 | cargas, registros de carga, trilha |
| `IngestionRun` / `NewsRun` / `EpisodeImageRun` | 3.506 / 14 / 14 | execuções dos serviços |
| `SynopsisTranslation` / `TitleReading` | 12.371 / 6.365 | traduções e leituras em kana |
| `StoryLink` / `StoryArc` / `StoryReview` / `WorkLink` | 114 / 273 / 561 / 7 | reboots, arcos, continuações manuais |
| `WatchProgress`, `PendingEpisode`, `Quiz`, `Comment` | 0 | ver inventário |
| `User` | 2 (1 ADMIN, 1 MEMBER) | papéis: só ADMIN/MEMBER |

Pendências abertas por tipo: OFFICIAL_SITE_MISSING 9.788 · TITLE_EN_MISSING 7.796 · NO_GENRE 3.464 · TITLE_JA_MISSING
2.180 · SYNOPSIS_EN_MISSING 1.281 · ADULT_REMOVED 49 · KIND_UNKNOWN 42 · TIMELINE_CONFLICT 34 · DUPLICATE_SUSPECT 24 ·
NAME_INVALID 5. Jobs: 134, todos SUCCESS (nenhum RUNNING ou FAILED).

### Integridade (relações implícitas por `anilistId`)

| Verificação | Resultado |
|---|---|
| Agenda, alertas, produções, lista, traduções, imagens, notícias, pendências, WorkLink sem obra no catálogo | **0 órfãos** |
| Agenda de obra fora da plataforma | 0 |
| Item de lista cuja obra saiu da plataforma | 1 (Rescue ME!) |
| `AnidbCandidate` apontando AniList ID que não está no catálogo | 232 (esperado: candidato pode ser obra ainda não trazida) |
| Duplicidade título + ano + formato na plataforma | 1 grupo (além das 24 DUPLICATE_SUSPECT) |
| Obras sem AniList ID | 2.178 — ficam fora de agenda, lista, sino, traduções por obra, reboots (tudo é chaveado por `anilistId`) |

A integridade hoje é mantida **pelo código**, não pelo banco: não há chave estrangeira entre o catálogo e as tabelas-satélite.
Os únicos FKs relevantes são `Production → Franchise`, `Episode/PlatformLink/WatchProgress → Anime`, `AiringAlert →
User`, `ImportRecord/CatalogConflict/AdminLog → AdminJob`.

## 2. Testes antes de mudar

| Suíte | Resultado |
|---|---|
| Unitários (Vitest) | 646/646 (inclui os novos do Epic 50) |
| E2E (Playwright), última completa (23/10) | 583/585; as 2 falhas (specs 65 e 76) passaram ao rodar de novo — coincidiram com o reinício do ambiente |
| E2E do Epic 50 e do calendário/sino/Explorar (hoje) | 53/53 + spec 102 7/7 |
| `tsc` / ESLint | sem erros (3 avisos antigos de variável sem uso em testes) |

## 3. Inventário funcional

Classificação: **F** = implementado e funcional · **P** = parcial · **UI** = só interface · **BE** = só backend · **DB** =
existe no banco sem uso · **L** = legado/candidato a descontinuar · **X** = inexistente · **V** = precisa de validação manual.

| # | Funcionalidade (seção do pedido) | Estado | Onde | Tabelas | Problemas | Risco | Proposta |
|---|---|---|---|---|---|---|---|
| 1 | Acompanhamento por obra (§2.1) | **F** | `src/app/api/anime/*`, `Anime.watchState/waiting/isFavorite/userScore` | Anime | nenhum registro por episódio é gravado | baixo | manter; teste do Cenário A |
| 2 | Progresso por episódio (proibido) | **DB / L** | só no schema (`WatchProgress`), 0 linhas, **nenhum consumidor** no código | WatchProgress | — | baixo | descontinuar (Fase 2), com migração que remove a tabela só depois de confirmada |
| 3 | Episódios globais (§2.2, §7) | **P** | `Episode` é filha de `Anime` (cópia **por pessoa**, Kitsu/AniDB, 43 obras); o global é a agenda | Episode, AiringScheduleEntry | episódio depende de alguém ter a obra na lista; título/sinopse do episódio não existem fora da lista; 2 obras com episódios além do total (Kitsu) | **alto** | episódio global por obra (Fase 2/4) |
| 4 | Contagem: informado × lançado × próximo (§2.2, Cenário B) | **P** | `episodes` (fonte), `nextEpisodeNumber/At`, agenda | CatalogEntry, AiringScheduleEntry | "lançados" não é calculado em lugar nenhum; a página mistura total da fonte com a agenda | médio | resumo calculado (Fase 4) |
| 5 | Estados de data (§8) | **P** | `delayed` calculado na leitura; `offGrid` (dated/undated/postponed); `ImportRecord.airsAtHasTime` | AiringScheduleEntry | a agenda não tem grau de certeza (só instante); não há "cancelado"/"adiado" por episódio; sem histórico de mudança de data (só o alerta "Data alterada") | médio | separar estado da obra, do episódio e certeza da data (Fase 5) |
| 6 | Calendário público e por obra | **F** | `src/app/calendar`, `/api/calendar`, `calendar-loader` | AiringScheduleEntry, CatalogOverride | horário da TV × streaming resolvido no Epic 50 (não commitado) | baixo | — |
| 7 | Sino de lançamento (§8 Notificações) | **F / V** | `services/notifier`, `rescheduleAlerts`, `AiringAlert @@unique(user, obra, episódio)` | AiringAlert | idempotente por chave única; sem trilha de "por que não avisou" | médio | log de decisão (Fase 5) |
| 8 | Dashboard admin / saúde (§5) | **P** | `src/app/admin/page.tsx` | AdminJob, CatalogConflict, ImportRecord | mostra lote, conflitos, jobs; não mostra qualidade do catálogo nem leva a listas filtradas | médio | painel de saúde (Fase 3) |
| 9 | Catálogo admin (§6) | **P (só leitura)** | `/admin/catalogo`, `/api/admin/catalog(/rows)` | CatalogEntry, Production, Franchise | sem detalhe, sem edição, sem divergências, sem histórico | **alto** | detalhe + edição canônica (Fase 3) |
| 10 | Fonte de verdade / cópias (§20) | **P** | `workFacts` (leitura cai no catálogo); curadoria propaga gêneros e site | CatalogEntry, Production, Anime | a ficha existe 3 vezes; 1.056 produções sem ano, 798 itens de lista sem formato | **alto** | serviço único de propagação (Fase 2/3) |
| 11 | Episódios admin (§7) | **X** | — | — | — | — | Fase 4 |
| 12 | Calendário admin / investigação (§8) | **X** | — | — | "por que a obra não apareceu" não tem tela | médio | Fase 5 |
| 13 | Conflitos (§16) | **F (só horário)** | `/admin/conflitos`, `/api/admin/conflicts/[id]` | CatalogConflict | só campo `airingAt`; 0 registros hoje | baixo | estender a outros campos quando a importação comparar (Fase 6) |
| 14 | Overrides (§16) | **F (só horário)** + atraso do streaming | `/admin/overrides` | CatalogOverride, CatalogEntry.streaming* | override só de horário; demais campos editados direto | médio | override por campo (Fase 3) |
| 15 | Correspondências (§9) | **F** | `/admin/matching`, `/admin/match-name`, `AnidbOnlyPanel`, `DuplicatesPanel` | ImportRecord, AnidbCandidate, WorkLink, CurationIssue | telas separadas; sem "decisões anteriores" consolidadas; sem exportação | médio | reunir numa aba (Fase 6) |
| 16 | Obras sem AniList ID (§9) | **P** | catálogo aceita `anidbId` | CatalogEntry | 2.178 obras sem agenda/lista/sino | **alto** | identidade interna (Fase 2) |
| 17 | Franquias e linha do tempo (§10) | **F** | auditoria `timelineAudit`, `WorkLink`, `Story*`, `/admin/curadoria` | CatalogEntry.franchiseKey…, StoryLink/Arc | edição de ordem/relação só por lote JSON; sem tela de franquia | médio | tela de franquia (Fase 7) |
| 18 | Importação (§11) | **F (AniDB HTML, AniList temporada/anos/complemento)** | `/admin/importacoes`, `/api/admin/anilist/*`, `adminImport/*` | AdminJob, ImportRecord | "complementar" só preenche vazios ou sobrescreve tudo; **não há escolha por campo nem prévia de diferenças** | **alto** | fluxo em etapas com seleção de campos (Fase 6) |
| 19 | Taxonomia (§12) | **P** | lista fechada em código (`genreTaxonomy.ts`, 18 + Hentai), gêneros como texto | CatalogEntry/Production/Anime/Agenda.genres | sem tela; renomear exige código; texto repetido em 4 tabelas | médio | tabela de gênero + junção (Fase 7) |
| 20 | Títulos, leituras, traduções (§13) | **P** | `TitleReading`, `SynopsisTranslation(source)`, `descriptionPt`, `Anime.titlePortuguese/descriptionPortuguese` | — | não distingue "automática" de "revisada"; tradução manual por pessoa (na lista), não da obra | médio | Fase 7 |
| 21 | Pendências de curadoria (§14) | **F** | `/admin/curadoria` (painéis), `/api/admin/curation/*` | CurationIssue | sem prioridade/gravidade; 70% são informativas (site oficial, título EN) | médio | prioridade configurável (Fase 7) |
| 22 | Jobs e monitoramento (§15) | **P** | `/admin/jobs`, `/admin/logs`, `/admin/scrapers` | AdminJob, AdminLog, IngestionRun, NewsRun, EpisodeImageRun | três tabelas de execução diferentes; logs em texto livre; serviços em segundo plano só aparecem por `/health` | médio | Fase 8 |
| 23 | Histórico de alterações (§16 Auditoria) | **P** | `AdminLog` (texto) | AdminLog | sem antes/depois estruturado por campo | **alto** (pré-requisito da edição) | tabela de alterações (Fase 2) |
| 24 | Quizzes (§17) | **F** | `/admin/quizzes` | Quiz, QuizQuestion, UserTitle | 0 quizzes cadastrados | baixo | Fase 9 |
| 25 | Acesso e moderação (§18) | **F (papel binário)** | `/admin/acesso`, `requireAdmin` em todas as rotas `/api/admin` | User.role, reports | só ADMIN/MEMBER; sem permissões finas | médio | Fase 9 |
| 26 | Comentários por anime | **L** | substituídos por posts da Comunidade | Comment (0) | — | baixo | avaliar descontinuação |
| 27 | Adiar episódio | **F** | `PendingEpisode` (0 linhas) | — | guarda "parei no episódio N" — **é marcação pessoal por episódio**, contra o §2.1 | médio | **decisão do produto** (ver D5) |

## 4. Principais achados

1. **Episódio não é global.** Título, sinopse e miniatura de episódio só existem na cópia de quem tem a obra na lista
   (`Episode → Anime`). A agenda (`AiringScheduleEntry`) é o único registro global, e só tem número e instante. É a
   maior distância entre o código e a regra do §2.2.
2. **A ficha está em três lugares** (catálogo, produção, lista) sem um serviço único de propagação; a leitura já cai no
   catálogo (`workFacts`), mas a gravação não.
3. **A identidade depende da AniList.** 2.178 obras (13% da plataforma) sem AniList ID não participam de agenda, lista,
   sino, traduções nem reboots.
4. **Edição administrativa praticamente não existe fora de horário e linha do tempo:** catálogo é só leitura; correções
   entram por carga ou por script.
5. **Não há histórico estruturado** (quem, o quê, antes, depois). `AdminLog` é texto livre. Sem isso, edição, override e
   "desfazer" não ficam auditáveis.
6. **A importação não compara campo a campo** antes de gravar.
7. O "Adiar" (PendingEpisode) guarda o episódio em que a pessoa parou: isso é progresso pessoal por episódio, que o §2.1
   proíbe.

## 5. Decisões que dependem de você

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Identidade canônica da obra | (a) `CatalogEntry.id` vira a chave interna; satélites ganham `catalogEntryId` com FK, `anilistId` vira só identificador externo · (b) manter `anilistId` e pôr FK só onde existe · (c) tabela nova `Work` | **(a)**: aproveita o catálogo que já é a fonte de verdade e destrava as 2.178 obras sem AniList |
| D2 | Episódio global | (a) evoluir `AiringScheduleEntry` para "episódio da obra" (título, sinopse, estado, certeza da data, fonte, FK para a obra) e aposentar `Episode` por pessoa · (b) tabela nova de episódio + agenda como eventos | **(a)**: menos migração; agenda e episódio já são 1:1 |
| D3 | Cópias da ficha | (a) catálogo canônico, cópias só para compatibilidade, atualizadas por um serviço único e verificadas pela varredura · (b) remover colunas duplicadas de `Production`/`Anime` | **(a)** agora, (b) depois que as telas lerem do catálogo |
| D4 | Gêneros | (a) tabela própria + junção, com backfill, mantendo a lista fechada · (b) manter texto e só criar tela | **(a)** na Fase 7 (renomear/mesclar sem código) |
| D5 | "Adiar" (PendingEpisode) | (a) manter como está · (b) trocar por "Adiar a obra" (sem número de episódio) · (c) remover | **(b)**: mantém a função sem progresso por episódio |
| D6 | Permissões | (a) manter ADMIN/MEMBER · (b) papéis CURATOR e MODERATOR além de ADMIN | (b) só na Fase 9 |

### Respostas (24/10/2026)

D1 = ID interno do catálogo · D2 = evoluir a agenda para episódio da obra · D5 = "Adiar a obra", sem número de episódio ·
D3, D4 e D6 seguem a recomendação e serão confirmados nas fases correspondentes.

## 6. Plano priorizado

A ordem do pedido foi mantida, com duas mudanças: o **histórico de alterações** sobe para a Fase 2 (sem ele a edição da
Fase 3 não é auditável) e **episódios** vêm junto da integridade, porque dependem da decisão D2.

| Fase | Entrega | Depende de |
|---|---|---|
| 2 — Modelo canônico e integridade | doc da fonte de verdade por campo; `catalogEntryId` + FKs com backfill (D1); tabela `ChangeLog` (antes/depois por campo); descontinuação planejada de `WatchProgress`; testes de integridade (Cenário J) | D1, D3 |
| 3 — Catálogo e detalhe | listagem com filtros de qualidade; detalhe por seções; edição com prévia, marcação manual × importado, serviço único de propagação; painel de saúde do §5 | Fase 2 |
| 4 — Episódios e cronologia | episódio global (D2) com backfill da agenda e dos `Episode`; resumo informado × cadastrado × lançado × próximo; aba de episódios | D2, Fase 2 |
| 5 — Calendário, conflitos, overrides | estado do episódio × certeza da data; histórico de mudança de data; investigação "por que não apareceu"; trilha do sino | Fase 4 |
| 6 — Correspondências e importação | aba única de correspondência; importação em etapas com diferença por campo e seleção (Cenário F) | Fases 2–3 |
| 7 — Taxonomia, traduções, curadoria | gêneros normalizados (D4); estados de tradução; prioridade das pendências; tela de franquia | Fase 3 |
| 8 — Jobs | visão única das execuções (AdminJob + serviços), logs estruturados, reprocessar com trava | — |
| 9 — Moderação, quizzes, permissões | D6, quizzes, revisão de carregamento e acessibilidade | — |
| 10 — Validação final | suíte completa, migrações, autorização, importação repetida, relatório | todas |

## 7. Pendente de antes desta fase

O Epic 50 (atraso do streaming) está pronto e testado, mas **não commitado**; o cluster roda a versão anterior. A coluna
nova já existe no banco.

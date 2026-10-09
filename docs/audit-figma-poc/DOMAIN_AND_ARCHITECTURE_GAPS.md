# DOMAIN_AND_ARCHITECTURE_GAPS — Domínio, modelagem, persistência, segurança, acoplamento e lacunas (rev.2)

> Auditoria de 2026-10-08, **revisão 2** (o Figma completo foi inspecionado; as lacunas GAP-V-01…03 da rev.1 — "páginas inacessíveis", "sem componentes", "sem estilo CJK" — eram **falsas** e foram substituídas por lacunas reais do Figma). Baseada em leitura de código (HEAD `e86c04d` + working tree **(WT)**) e em duas verificações
> ao vivo somente-leitura (consulta `SELECT` na tabela de agenda e `GET /api/calendar`). Nenhum fluxo foi executado em
> navegador. Itens sem prova estão marcados **Não verificado**. As lacunas de **produto** (F) estão em `OPEN_DECISIONS.md`.

## 1. Domínio de anime (roteiro §8.1)

### 1.1 O que o modelo precisa separar × o que existe

| Conceito do roteiro | Entidade na PoC | Situação |
| --- | --- | --- |
| Franquia (Figma: `Franchise #101`, `8:3603`) | `Anime.seriesKey` (String por usuário, derivada por regex do `titleRomaji`) | **Implementado de outra forma** — não é entidade |
| Produção (Figma: `Production #501/#502`; "o sufixo de temporada pertence à produção") | `anilistId` inteiro solto em `Anime`, `CatalogEntry`, `AiringScheduleEntry`, `Post`, `Comment`, `AiringAlert` | **Ausente** como tabela; só existe a chave |
| Temporada / continuação | `Anime.seasonNumber` (por usuário) + `Anime.season/seasonYear` (estação de exibição) + `Episode.seasonNumber` (cour interna da Kitsu) | **Três conceitos diferentes com nome parecido** |
| Programação de lançamento | `AiringScheduleEntry` (global, UTC, `@@unique(anilistId, episode)`) | Implementado; cache sem FK |
| Episódio / evento de lançamento | `Episode` (metadado Kitsu/AniDB por **linha de usuário**, `airDate` só data) + `AiringScheduleEntry` | Duas fontes de "quando sai o ep. N", sem reconciliação |
| Fonte de dados (Figma: AniDB, "Site oficial", "Curadoria" + parserVersion, jobID, captura) | `CatalogEntry.source` ("anilist"/"kitsu"); nada em `Anime`/`AiringScheduleEntry` | **Sem proveniência por campo** |
| Relação de acompanhamento do usuário | A própria linha `Anime` (+ `WatchProgress`, `isFavorite`, `PlatformLink`) | Misturada ao catálogo |

### 1.2 Problemas comprovados

| # | Problema | Evidência | Impacto |
| --- | --- | --- | --- |
| DA-1 | **Catálogo e entrada do usuário não são separados.** `Anime` é uma linha por (usuário, anilistId) com metadados, overrides manuais e estado pessoal. N usuários = N cópias dos metadados e N refreshes externos. | `schema.prisma` (Anime, `@@unique([userId, anilistId])`); `refreshAnimeData` é por linha | Divergência entre usuários; a página da obra só existe para quem a tem (`anime/[id]/page.tsx:35,43`) |
| DA-2 | **Franquia duplicada quando surge nova temporada.** Executei uma **cópia** de `deriveSeriesInfo` (repo intocado): "Attack on Titan" → franquia `attack on titan`/1; "…Season 2" → mesma/2; **"Attack on Titan: The Final Season" → franquia nova `attack on titan: the final season`/1**; "Sword Art Online: Alicization", "Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen" e "Kaguya-sama wa Kokurasetai: Ultra Romantic" também viram franquias próprias. Não há teste de `series.ts`. | `src/lib/series.ts:deriveSeriesInfo`; notes B §1.3 | Relacionamentos entre produções não confiáveis |
| DA-3 | **A fonte autoritativa de franquia é ignorada:** a AniList expõe `relations` (PREQUEL/SEQUEL), mas `anilist.ts` nunca as consulta (grep `relations` = 0). | `anilist.ts` | Correção só manual, por usuário, sem trilha (`PATCH /api/anime/[id]/series`) |
| DA-4 | **Identidade/unicidade fracas:** `@@unique([userId, anilistId])` com `userId` NULL permite duplicatas legadas; `@@unique([userId, kitsuId])` gerou bug real, tratado por `kitsuIdAvailable` com check-then-update **não atômico**. | `episodes.ts:14-21`; schema | Colisões intermitentes |
| DA-5 | **Integridade referencial inexistente** entre obra e post/comentário/alerta (inteiros soltos): thread de comentário sem nenhuma linha `Anime` é descartada no trending; o admin cai para "AniList #id". | `anime-threads/trending/route.ts:319-325`; `admin/comment-reports/route.ts:69` | Órfãos |
| DA-6 | **Data inventada:** `fuzzyDateToISO` preenche mês e dia ausentes com 1 e grava em `CatalogEntry.startDate/endDate`; o filtro de ano do Descobrir lê o ano no fuso local (01/jan UTC → dez do ano anterior no Brasil). | `anilist.ts:82-87`; `catalogCache.ts:6-24`; `discover/page.tsx:42` | Viola "nunca inventar datas" |
| DA-7 | **Agenda sem reconciliação:** reagendamento atualiza no lugar; **cancelado, renumerado ou removido nunca é detectado nem apagado** (grep: único `delete` é `scripts/clear-cache.cjs`). `fetchedAt` só é gravado no create, então não serve de indicador de frescor. | `airingCache.ts:5-24`; notes B §6.1 | Fantasmas no calendário e nos alertas |
| DA-8 | **Janela de ingestão não alcança o presente (P0 em runtime).** `getAiringSchedule` parte de `now − 8 semanas`, ordena crescente e para em `MAX_PAGES = 10` (≈500 itens) sem registrar truncamento. **Verificado ao vivo:** 346 linhas, `min=2026-08-13`, `max=2026-09-09`, hoje `2026-10-08`; semanas: `08-10:53 · 08-17:92 · 08-24:87 · 08-31:94 · 09-07:20 · depois: 0`; `GET /api/calendar?weekOffset=0` → `{"results":[]}`; o loader loga "refreshed 343 entries" e o container está "healthy" (health estático). O E2E que cobre o calendário semeia a agenda manualmente e por isso não pega o defeito. | `anilist.ts:373-413`; `calendar-loader/src/index.ts:9-32`; `tests/43-epic27-calendar-batch2.spec.ts:41-44` | Calendário central e notifier sem dados; nada alerta |
| DA-9 | **Atualização/frescor:** `titleFurigana` não é invalidado quando `titleNative` muda; `lastRefreshedAt` é atualizado mesmo se todas as fontes falharam; `Episode.airDate` vem da Kitsu/AniDB (00:00 UTC) e não da AniList. | `refreshAnimeData.ts:63,276`; `episodes.ts:69` | Dado velho com aparência de fresco |
| DA-10 | **Matching entre fontes por 1º resultado de busca textual** (`titlesLikelyMatch`: contenção por palavra ou ≥60% de tokens), com regravação de `malId/shikimoriId/kitsuId` a cada refresh e sem score, fila ou confirmação: "Attack on Titan" casa com "…Final Season" por contenção. | `identityResolution.ts:83-114`; `refreshAnimeData.ts:107,136` | IDs de temporada errada, silenciosamente |

### 1.3 Derivado × persistido
- **Derivado na leitura (bom):** `inMyList`, `animeId`, `isAiringNow`, contadores de seguidores/curtidas.
- **Persistido derivado (risco):** `seriesKey/seasonNumber` (heurística gravada, nunca recalculada), `genres` (CSV normalizado), `titleFurigana`, `accentColor`.
- **Colunas sem uso:** `Anime.format` (nunca escrita), `CatalogEntry.kitsuId` (só o seed). **Strings livres** em vez de enum/CHECK: `role`, `WatchProgress.status`, `PlatformLink.platform`, `CatalogEntry.source`.

## 2. Domínio social (roteiro §8.2)

Legenda: **P** = persistido · **D** = derivado na leitura · **T** = temporário (só cliente).

| Conceito | Representação na PoC | Tipo | Situação |
| --- | --- | --- | --- |
| Publicação | `Post` (soft delete, `imageUrls[]`, `quotedPostId`, `repostOfId`) | P | Implementado; sem título, spoiler, temporada nem `editedAt` |
| Resposta | `PostComment` (plano, sem `parentId`) e, separado, `Comment` por `anilistId` | P | **Dois sistemas** sem ligação |
| Hashtag | Texto dentro de `Post.body`; relação com a obra = `Post.anilistId` derivada no cliente | D/T | **Sem tabela, sem índice, sem busca** |
| Associação com anime | `Post.anilistId` obrigatório (sai da lista do autor) + snapshot de título/capa | P | Implícita; servidor não valida a hashtag |
| Associação opcional com temporada | — | — | **Ausente** |
| Curtida | `PostLike @@unique([postId, userId])` | P | Implementado (contador por `count`) |
| Relação de seguidor | `Follow @@unique([followerId, followingId])` | P | Implementado; auto-follow só na rota (sem CHECK) |
| Bloqueio | — | — | **Ausente** |
| Denúncia | `PostReport`, `CommentReport` (`@@unique`, `resolvedAt/By`) | P | Parcial: sem motivo; `PostComment` e perfil sem denúncia |
| Preferência de spoiler | — | — | **Ausente** |
| Notificação social | — | — | **Ausente** |
| Exclusão / indisponibilidade | `deletedAt` em `Post`, `PostComment`, `Comment` | P | Protege o conteúdo; **sem placeholder** na UI |
| Rascunho | `useState` no cliente | T | Não persiste |

## 3. Regras críticas (roteiro §8.3) — estado real, sem assumir solução

| Regra | Como está hoje | Risco | Proposta (não aprovada) |
| --- | --- | --- | --- |
| Impedir curtida/seguir duplicados | Unique no banco + `upsert`/`deleteMany` idempotentes. Sob corrida o `upsert` pode lançar `P2002` (500) — **Não verificado** em runtime | Baixo | Tratar `P2002` como sucesso idempotente; teste concorrente |
| Só o autor autorizado edita/exclui | Exclusão: autor-only com 404 uniforme (post, resposta, comentário). **Edição não existe.** Admin só remove via fila de denúncia (não remove conteúdo não denunciado); moderador não-admin não existe | Médio | Definir papel de moderação (D-16) e rota de remoção direta |
| Aplicar bloqueios de forma consistente | Inexistente; feeds filtram só `userId`/`deletedAt` | Alto p/ release social | Filtro server-side central reutilizado por todos os feeds (D-10) |
| Evitar notificações duplicadas | `AiringAlert @@unique([userId, anilistId, episode])`; loop `findUnique → update/create` não atômico (1 réplica ok; réplica extra geraria `P2002` que aborta o tick) | Baixo hoje | `upsert` atômico; um `try/catch` por alerta |
| Preservar referência a post removido sem expor conteúdo | `toPostDto` zera `quotedPost` apagado; repost de original apagado é omitido; **não há marcador**, a UI some com o item | Médio | Tombstone com id e estado, sem corpo (D-16) |
| Privacidade da lista pessoal | Rotas/DTOs filtram por `userId`; **exceção:** `author.completed` em `GET /api/anime/[id]/comments` expõe a terceiros que o autor marcou COMPLETED | Médio | Remover o campo (D-02) |
| Spoilers em notificações e prévias | Não há spoiler; hoje o alerta não carrega texto de usuário, mas a lateral pública mostra 2 linhas do corpo a anônimos | Alto p/ release social | Placeholder em todas as superfícies (D-09) |
| Dados de lançamento desconhecidos/alterados | `airingAt` obrigatório (não inventa); sem estado "a confirmar"; alteração = update no lugar; cancelamento não detectado | Médio | Estados explícitos e reconciliação (D-25) |
| Integridade anime↔temporada↔publicação | Inteiros soltos sem FK; temporada = string livre editável (`seriesKey`) com colisão checada só em aplicação | Médio | Entidades canônicas e FKs (D-18) |

## 4. Arquitetura e dependências (roteiro §8.4)

| Dimensão | Achado | Evidência |
| --- | --- | --- |
| Separação de responsabilidades | Microsserviços reais, mas **compartilham `src/lib` por import relativo/COPY** ("monorepo falso"): versões podem divergir se só um container for rebuildado | `services/*/src` → `../../../src/lib/*` |
| Acoplamento tela↔serviço | Cinco rotas repetem `callInternalService(...) ?? local`; o timeout de 2 s faz o `web` rodar o **mesmo trabalho local** enquanto o serviço continua → dois `deleteMany`+`createMany` concorrentes no mesmo `animeId` (inferido do código, não reproduzido) | `serviceDelegate.ts:307`; `anime/[id]/page.tsx:62-66`; `episodes.ts:58-71` |
| Duplicação de regras | Dedupe de título (`catalogCache` × `identityResolution`), taxonomia de gêneros copiada à mão em `seed-catalog-cache.cjs`, `serverWeekStart` em duas rotas, janela ±8 semanas em loader e rota, validações repetidas por rota | notes B §8 |
| Serviço majoritariamente decorativo | `name-resolver`: `/furigana` sem chamador; `title`/`dedupeCandidates` de `/resolve-identity` sem chamador | notes B §3 |
| Dependências circulares | **Não verificado** (nenhuma ferramenta de análise foi executada) | — |
| Persistência e consistência | `$transaction` só em signup, reset de senha, resolução de denúncias e delete de `Anime`; **fora de transação:** episódios (delete+create), caches (loops de upsert), `refreshAnimeData` (6+ updates) | notes B §8.4 |
| Autorização no backend | Correta e por handler (ownership 404; sem mass-assignment; sem escalada). **Sem proteção central**: não há `middleware`/`proxy`; rota nova nasce pública | notes D §1-2 |
| Processamento assíncrono | Loops `setInterval` simples (30 min / 2 min); sem fila, sem backoff, sem contador de falhas; health estático | `calendar-loader/src/index.ts:28-32`; `notifier/src/index.ts` |
| Cache | Tabelas-cache sem TTL/retention (`CatalogEntry`, `AiringScheduleEntry`); `searchCachedCatalog` carrega tudo e filtra em memória; `/api/catalog` sem paginação; `next:{revalidate}` fora do Next é ignorado (efeito em Next 16 **Não verificado**) | notes B §7 |
| Falhas de integrações | Degradação boa quando a AniList cai (fallback em `CatalogEntry`); **sem timeout/retry/429** em nenhuma fonte; AniDB em HTTP puro; Shikimori "escrito só pela documentação" | notes B §4 |
| Testabilidade | 168 testes vitest só em `src/lib` (parsers/regras puras); rotas só via Playwright com DB real; sem teste de `series.ts`, `airingCache`, `calendar-loader`, `notifier`, `session`, DTOs, `processImageUpload` | notes D §6 |
| Observabilidade | Só `console.log/error`; sem logs estruturados, métricas, tracing ou trilha de auditoria; `web` sem healthcheck | notes B §3, §7 |
| Operação | Scripts destrutivos sem guarda de ambiente (`clear-cache.cjs` com `updateMany` sem `where`; `seed-community.cjs` apaga contas por e-mail); containers como root; serviços internos sem autenticação; segredos fora do git (`.env` ignorado; `tests/test-db.ts` tem senha de dev versionada) | notes B §5.1, notes D §2.7 |

**Nenhuma reescrita total é recomendada.** Os pontos que justificam refatoração localizada são: (1) o modelo `Anime` por usuário (DA-1/DA-2); (2) a janela/paginação do loader e seu health (DA-8); (3) a camada de consumo (`WatchProgress`) conforme D-02; (4) a ausência de proteção central de autorização; (5) a ausência de reconciliação da agenda.

## 5. Lacunas consolidadas

Colunas: **ID · Descrição · Evidência · Consequência de não resolver · Prio · Dependências · Proposta · Pergunta (se houver)**.
IDs referenciados por `FIGMA_POC_TRACEABILITY.md`. Lacunas de decisão de produto (F) → `OPEN_DECISIONS.md`.

### A. Lacunas funcionais (GAP-F)

| ID | Descrição | Evidência | Consequência | Prio | Dep. | Proposta | Pergunta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAP-F-01 | Detalhe público de obra inexistente | `anime/[id]/page.tsx:35,43`; `tests/05:52-53` | Visitante não abre detalhe; loop Descobrir→Acompanhar e "ler antes de acompanhar" quebrados | P0 | D-03, D-18 | Rota pública por obra/temporada canônica | D-03 |
| GAP-F-02 | Remover da lista sem UI | `api/anime/[id]/route.ts:24-49`; grep `method: "DELETE"` | Usuário não deixa de acompanhar pela interface | P1 | — | Botão + confirmação; atualizar calendário/lista | — |
| GAP-F-03 | Vocabulário "Acompanhar" ausente | grep `acompanh` = 0 | Linguagem diferente do contrato | P2 | D-02 | Renomear após D-02 | — |
| GAP-F-04 | Destino não preservado após login | `login/page.tsx:41` | Perda de contexto | P1 | D-04 | `returnTo` relativo validado | D-04 |
| GAP-F-05 | Não existe o **Dashboard** "Seu dia, em anime" (`8:2442`, acesso pelo logo); a home não responde "o que sai hoje?" | `app/page.tsx:7-19`; `Header.tsx:73-116` | Meta de ≤2 s inatingível | P1 | D-05, GAP-T-01 | Dashboard (logo → Dashboard) | D-05 |
| GAP-F-06 | Hashtag não navegável nem pesquisável | `PostCard.tsx:304,316-320`; sem tabela | Sem descoberta social | P2 | D-13, D-12 | Entidade/índice de hashtag + página | D-13 |
| GAP-F-07 | Feeds "Recentes" ausente e "Para você" sem personalização | `FeedView.tsx:505-508`; `feedRanking.ts` | Feeds não correspondem aos nomes | P2 | D-12 | Definir e implementar regras | D-12 |
| GAP-F-08 | Sem área/menu "Comunidade" | `Header.tsx:73-116` | Feed vira a entrada do produto | P2 | D-05 | Item de menu/rota | D-05 |
| GAP-F-09 | Bloqueio ausente | notes C §6 | Sem defesa contra assédio | P1 | D-10 | Modelo `Block` + filtro central | D-10 |
| GAP-F-10 | Spoiler ausente em todas as superfícies | grep spoiler = 0 | Princípio 12 violado | P1 | D-09 | Flag + placeholder + revelar | D-09 |
| GAP-F-11 | Notificações sociais e preferências ausentes | `schema.prisma:356-368` | Princípio 13 não atendido | P2 | D-11, D-26 | Modelo de eventos + preferências | D-11 |
| GAP-F-12 | Discussão por obra/temporada só para quem tem a obra | `comments/route.ts:19-26` | Impede ler antes de acompanhar | P1 | D-23, D-27 | Discussão pública vinculada à obra | D-27 |
| GAP-F-13 | Admin de dados (Figma `8:3436…8:5077`: Catálogo · Importações · Matching · Scrapers · Jobs · Conflitos · Overrides · Logs) ausente; o Admin da PoC é outro (convites/usuários/denúncias) | notes B §5 | Contrato Admin não atendido; ingestão sem barreira | P1 (auditar, confirmar) / P2 (demais) | D-17, D-30 | `IngestionRun`, staging, fila de matching | D-17 |
| GAP-F-14 | Hierarquia japonês→kana→inglês não implementada; padrão é inglês | `titlePreference.tsx:29-32` | Título principal ≠ especificado | P1 | D-06 | Campo/lógica de kana + padrão JP | D-06 |
| GAP-F-15 | Fuso padrão/seletor/rótulo ausentes | grep `America/Sao_Paulo` = 0 | Horários sem contexto | P1 | D-07 | Fuso na conta + rótulo | D-07 |
| GAP-F-16 | Moderação limitada (sem motivo, PostComment, perfil, suspensão, apelação) | notes C §7 | Moderação insuficiente p/ release | P1 | D-16 | Ampliar modelo de denúncia | D-16 |
| GAP-F-17 | Sem tombstone de conteúdo removido; erro de fetch vira "vazio" | `postDto.ts:210-219`; `FeedView.tsx:192-216` | Perda de contexto/diagnóstico | P2 | D-16 | Estados explícitos | — |
| GAP-F-18 | Sem "a confirmar", "adiado" nem aviso antecipado | `airingCache.ts`; `airingWindow.ts` | Informação de lançamento incompleta | P2 | D-25, D-26 | Estados + lembrete | D-25 |
| GAP-F-19 | Avatar/bio incompletos (propagação), displayName sem handle | notes C §10 | Identidade fraca | P3 | D-24 | Propagar `UserAvatar`; handle | D-24 |
| GAP-F-20 | Rascunhos não persistem | `FeedView.tsx:73` | — | P3 | D-14 | Decidir | D-14 |
| GAP-F-21 | Sem listas de seguidores/seguindo | `users/[id]/page.tsx:20-29` | — | P3 | D-24 | Endpoint + tela | D-24 |
| GAP-F-22 | **Sem página de Configurações** (formato dos títulos, timezone, tema, notificações — `8:3333`, `13:42966`); preferência de título só em `localStorage` | `AccountMenu.tsx`; `titlePreference.tsx` | Fuso, formato e notificações não configuráveis por conta | P2 | D-06, D-07, D-26 | Página + colunas de preferência em `User` | D-26 |
| GAP-F-23 | **Busca na Comunidade** (publicações, perfis, hashtags + filtro de anime) ausente | `discover/page.tsx`; `api/posts/route.ts` | Descoberta social impossível | P2 | D-13 | Índice de texto + endpoints | D-13 |
| GAP-F-24 | **Estados do compositor** do Figma ausentes: descartar rascunho, deduplicação de envio, falha com rascunho preservado, validação inline (`13:43375`) | `FeedView.tsx:73,406-420` | Perda de texto; posts duplicados | P2 | D-14 | Estados + chave de idempotência | D-14 |
| GAP-F-25 | **Publicar sem anime** e **seletor explícito de produção** ausentes; a obra vem da hashtag no texto (`13:41840`, `13:41925`) | `FeedView.tsx:346`; `animeHashtag.ts:44-54` | Contradiz "mencionar um nome não cria associação" | P1 | D-13, D-27 | Seletor de produção opcional | D-27 |
| GAP-F-26 | **Página de temporada** e filtros **Tipo** e **Disponibilidade de previsão** ausentes (`8:1733`, `8:5720`) | `discover/page.tsx:476,520-536` | Descoberta por temporada incompleta | P2 | D-18 | Rota de temporada + filtros | — |
| GAP-F-27 | Notificação **"Data alterada"** (com horário anterior) ausente (`8:3123`) | `notifier/src/index.ts` | Mudança de data não avisa | P1 | D-26, GAP-T-04 | Tipo de evento + horário anterior | D-26 |
| GAP-F-28 | **Contexto não preservado** ao voltar (aba, query, filtros, scroll — `13:41169`) | `FeedView.tsx` | Perda de lugar em todos os fluxos de leitura | P2 | — | Estado em URL/sessão | — |
| GAP-F-29 | **ShareAction** sem fluxo no Figma; a PoC tem repost puro + citação (`13:42257`, `13:43571`) | `api/posts/[postId]/repost/route.ts` | Semântica e tombstone indefinidos | P2 | D-28 | Decidir | D-28 |

### B. Lacunas visuais (GAP-V)

| ID | Descrição | Evidência | Consequência | Prio | Dep. | Proposta |
| --- | --- | --- | --- | --- | --- | --- |
| GAP-V-01 | **Spoiler no Figma**: a prévia de resposta no feed e as hashtags ficam **fora** do bloco oculto; sem variante para busca, citação e bio (FV-06) | `13:41181`, `13:41155` | Vazamento de spoiler por desenho | P1 | D-09 | Definir no Figma antes de implementar |
| GAP-V-02 | **Frames ausentes no Figma** (FV-07): menu "···" aberto; visitante nas telas sociais; aba "Em alta"; aba "Discussões iniciadas"; resultados da busca social; "Saiba como"; lista de bloqueados; tombstone de comentário | `13:42068`, `13:42598`, `13:43738` | Implementação sem referência | P2 | D-12, D-10 | Completar os frames |
| GAP-V-03 | Filtro "Status" de Minha Lista sem opções desenhadas (FV-08) e escolha obra×temporada sem frame (lacuna em P-11) | `8:2608`; `13:43963` nota | Risco de reintroduzir status de consumo | P2 | D-02 | Definir opções ou remover o filtro |
| GAP-V-04 | Tokens divergentes entre Figma e PoC (cores, Anton, escala) | notes A §5 | Identidade diferente | P2 | D-20 | Fonte única de tokens |
| GAP-V-05 | Estados sem ícone; sem `error.tsx`/`loading.tsx`; skeletons em 3 arquivos | notes A §10 | Regra "texto e ícone" não cumprida | P2 | — | Biblioteca de estados |
| GAP-V-06 | Alvos < 44 px | notes A §5.3 | Acessibilidade | P2 | — | Revisar tamanhos |
| GAP-V-07 | Preview do calendário só por hover; foco global só em `ButtonBase` | `CalendarEntryCard.tsx`; `muiTheme.ts:49-58` | Teclado/leitor sem acesso | P2 | — | Preview acessível |
| GAP-V-08 | PoC responsivo × Figma desktop-only; sem centralização em 1920 | `Header.tsx:240-276` | Escopo de dispositivo indefinido | P2 | D-19 | Decidir |
| GAP-V-09 | Acento `#e4002b` como texto 4,06:1 (PoC); branco sobre `#ff164f` 3,43:1 (Figma) | cálculos | Falha AA em um dos usos | P2 | D-20 | Texto escuro no botão cheio |
| GAP-V-10 | Contorno `border` 1,2–1,4:1 | cálculo | Abaixo de 3:1 como único limite de componente | P3 | — | Usar contorno mais forte em campos |
| GAP-V-11 | `<header>` dentro de `<main>`, sem skip-link, sem `lang="ja"`, busca só com placeholder | `layout.tsx:43-49` | Navegação assistiva | P2 | — | Ajustar landmarks |
| GAP-V-12 | Arquivo assina 9 bibliotecas (iOS/watchOS/visionOS/macOS/Material 3) sem uso | `get_libraries` | Ruído/risco de inconsistência | P3 | — | Limpar assinaturas |
| GAP-V-13 | **1280 e 1920 "não validados"** pelo próprio Figma (FV-12); sem telas nessas larguras | `13:41166`, `13:41169` | Contrato de implementação sem verificação | P2 | D-19 | Validar ou declarar escopo |
| GAP-V-14 | **Telas de conta ausentes**: cadastro por convite e recuperação de senha (só o login é desenhado) | `8:2371` | Fluxo de entrada incompleto no design | P2 | D-31 | Desenhar |
| GAP-V-15 | Admin: fonte "**Site oficial**" não identificada (FV-09) e contradição "HTML colado" × "Executar"/HTTP 500 | `8:4597`, `8:3894`, `8:4919` | Impossível especificar a ingestão | P2 | D-30 | Esclarecer no Figma |
| GAP-V-16 | **Sem mapeamento Figma→código** (55 componentes vs MUI customizado; sem Code Connect) | `FIGMA_INVENTORY.md` §5 | Divergência visual crescente | P2 | D-20 | Catálogo de equivalências |
| GAP-V-17 | Inconsistências internas do Figma de baixo impacto: "+ Acompanhar" neutro × accent (FV-02); Dashboard "02:00 · EP05" + "sem horário definido" (FV-03); "Entre para criar sua agenda" com header autenticado (FV-04); formatos de tempo diversos (FV-05) | `8:691`/`8:1361`, `8:2442`, `13:42397` | Ambiguidade na implementação | P3 | — | Corrigir no Figma |

### C. Lacunas técnicas (GAP-T)

| ID | Descrição | Evidência | Consequência | Prio | Dep. | Proposta |
| --- | --- | --- | --- | --- | --- | --- |
| GAP-T-01 | Calendário atual vazio (janela/paginação do loader) | DA-8 | Tela central e notifier sem dados | P0 | GAP-T-08, GAP-Q-06 | Janela que alcance o presente; log de truncamento |
| GAP-T-02 | `Anime` por usuário sem Obra/Franquia/Temporada | DA-1/DA-2 | Duplicação e dados divergentes | P0 | D-18 | Entidades canônicas + migração |
| GAP-T-03 | Camada de consumo (`WatchProgress`) | notes B §9 | Conflito de produto | P0 | D-02 | Conforme decisão |
| GAP-T-04 | Linhas de agenda nunca removidas/validadas | DA-7 | Fantasmas | P1 | D-25 | Reconciliação por janela |
| GAP-T-05 | `fuzzyDateToISO` inventa mês/dia | DA-6 | Datas falsas | P2 | — | Preservar precisão da data |
| GAP-T-06 | Matching por 1º resultado e regravação de IDs | DA-10 | IDs trocados | P2 | D-17 | Score + confirmação |
| GAP-T-07 | Integrações sem timeout/retry/429; AniDB em HTTP | notes B §4 | Travamento/ban | P2 | — | Cliente HTTP comum |
| GAP-T-08 | Health estático, logs só console | `calendar-loader/src/index.ts:28-32` | Falhas silenciosas | P1 | — | Health baseado no último sucesso |
| GAP-T-09 | Concorrência/atomicidade (episódios, fallback paralelo, `series`, notifier N+1) | notes B §8 | 500/estado misto | P2 | — | `$transaction`/`upsert` atômico |
| GAP-T-10 | `request.json()` sem try/catch em 4 rotas (`title`, `description`, `series`, `users/me`) | notes B §2 | 500 em JSON inválido | P3 | — | Helper de parse |
| GAP-T-11 | Scripts destrutivos sem guarda | notes B §5.1 | Perda de dados | P2 | — | Guarda de ambiente/confirmação |
| GAP-T-12 | Uploads sem coleta de órfãos; URL absoluta com origin da requisição | notes D §2.3 | Disco e links quebráveis | P2 | D-15, D-22 | URL relativa + GC |
| GAP-T-13 | Sem paginação em `/api/catalog`, `/api/anime`, respostas, listas admin | notes D §5 | Custo cresce | P3 | — | Paginar |
| GAP-T-14 | `name-resolver` subutilizado; regras duplicadas | notes B §3, §8 | Divergência futura | P3 | — | Consolidar |
| GAP-T-15 | Colunas mortas, strings livres, sem proveniência por campo | notes B §1.3 | Dívida de modelo | P3 | D-18 | Enum/CHECK; proveniência |
| GAP-T-16 | FKs soltas por `anilistId` | DA-5 | Órfãos | P2 | D-18 | FKs após modelo canônico |
| GAP-T-17 | README boilerplate; sem CI; Node 24 local × 20 nas imagens; `.env.example` incompleto | notes D §6-7 | Onboarding e regressão | P2 | — | Documentar; pipeline mínimo |
| GAP-T-18 | Sessões expiradas e caches sem purga/retention | notes D §1 | Crescimento | P3 | D-22 | Jobs de limpeza |
| GAP-T-19 | Dois sistemas de comentário (`Comment` × `PostComment`) | notes C §3 | Experiência fragmentada | P2 | D-23 | Unificar |
| GAP-T-20 | Epic 28/29 incompletos (propagação do avatar, `repostedBy` tipado sem `avatarUrl`, `GET /api/users/[id]` divergente) **(WT)** | notes C §10 | Entrega parcial | P3 | — | Completar e testar |
| GAP-T-21 | **`User` sem preferências** (timezone, formato de título, notificações Lançamentos/Social) | `schema.prisma` (User) | CFG-001 impossível | P2 | D-06, D-07, D-26 | Colunas/tabela de preferências |
| GAP-T-22 | **Modelo de ingestão ausente** (job, execução, conflito, override global, log de auditoria) exigido pelo Admin do Figma | `schema.prisma`; notes B §5 | TR-110…119 sem base | P2 | D-17, D-30 | Modelos de ingestão/jobs/conflitos/overrides/auditoria |
| GAP-T-23 | **Sem entidades de comunidade**: Hashtag (ID canônico, tipo), Block, flag de spoiler, notificação social | `schema.prisma:379-483` | HASH/PROF-003/SPOIL/NOTIF-002 impossíveis | P1 | D-09, D-10, D-11, D-13 | Modelos + migração conjunta |

### D. Lacunas de segurança e privacidade (GAP-S)

| ID | Descrição | Evidência | Consequência (cenário) | Prio | Dep. | Proposta |
| --- | --- | --- | --- | --- | --- | --- |
| GAP-S-01 | 1ª conta sem convite vira ADMIN; checagem não atômica | `auth/signup/route.ts` (`isFirstEverUser`) | O 1º anônimo a se cadastrar num deploy novo vira administrador; 2 signups simultâneos podem ambos virar ADMIN | P1 | D-21 | Admin por CLI/env; atomicidade |
| GAP-S-02 | Sem rate limit/lockout em nenhuma rota | grep = 0 | Força bruta de senha; amplificação contra APIs externas via `/refresh` e `/anilist/search` | P1 | D-22 | Limites por IP/conta |
| GAP-S-03 | Enumeração de e-mails no cadastro (409 antes do convite); sem limite de tamanho de campos | `signup/route.ts:35-38` | Descoberta de contas | P2 | D-22 | Resposta neutra; limites |
| GAP-S-04 | `author.completed` expõe progresso pessoal | `comments/route.ts:65-90` | B vê que A concluiu a obra | P1 | D-02 | Remover campo |
| GAP-S-05 | 5 `dangerouslySetInnerHTML` sem sanitização, 2 em páginas públicas (incl. `CalendarEntryPreview` WT) | notes D §2.2 | XSS armazenado se AniList/cache for comprometido | P2 | — | Sanitizar (allowlist) ou texto |
| GAP-S-06 | `imageUrls` aceita qualquer host http(s) | `anime/[id]/posts/route.ts:58-80` | Leitores vazam IP/UA; troca de imagem após moderação | P2 | D-15 | Só uploads próprios ou proxy |
| GAP-S-07 | Sem CSP/X-Frame-Options/nosniff/Referrer-Policy; serviços internos sem autenticação; containers como root | `next.config.ts`; notes B §3 | Contenção fraca de XSS; mutação via rede do compose | P2 | — | Headers; token entre serviços |
| GAP-S-08 | Feed e lateral públicos a anônimos (corpo dos posts) | notes C §10 | Exposição por design — confirmar | P3 | D-09 | Decidir |
| GAP-S-09 | Admin reseta senha de qualquer usuário (inclusive outro admin) sem auditoria | `admin/users/[id]/reset-password/route.ts` | Ação sem rastro | P3 | D-17 | Log de auditoria |
| GAP-S-10 | Token de sessão em claro no banco; scrypt com defaults do Node; sem logout-all | `session.ts`; `password.ts` | Vazamento de backup = sequestro de sessões | P3 | — | Hash do token; parâmetros OWASP |
| GAP-S-11 | CSRF depende só de `SameSite=Lax` | notes D §2.6 | Defesa em profundidade ausente | P3 | — | Checar `Origin` |
| GAP-S-12 | Senha de desenvolvimento versionada em `tests/test-db.ts` | notes D §2.7 | Senha fraca pública se o compose for reutilizado | P3 | — | Ler de variável de ambiente |
| GAP-S-13 | Upload: `Content-Length` ausente (chunked) contorna o corte pré-parse; sem `limitInputPixels` | notes D §2.3 | Consumo de memória | P3 | — | Limite de stream e de pixels |
| GAP-S-14 | Imagens de posts removidos/avatares trocados continuam servidas publicamente | `api/uploads/[...path]/route.ts` | Privacidade pós-remoção | P2 | D-15, D-22 | Retirar arquivo na remoção |
| GAP-S-15 | **Política de scraping**: o Figma especifica Scrapers de HTML (AniDB, "Site oficial") sem robots/termos/rate limit; a regra do projeto é "sem scraping" | `8:4597`, `8:3894` | Risco jurídico e de bloqueio das fontes | P1 | D-30 | Decidir antes de especificar a ingestão |
| GAP-S-16 | **Texto de spoiler não pode existir como camada oculta** (DOM, cache, preview, notificação, resposta da API) — requisito do Figma | `13:41155`, `13:43079` | Vazamento mesmo com UI "oculta" | P1 | D-09 | Servir só o placeholder até a ação explícita |

### E. Lacunas de testes (GAP-Q)

| ID | Descrição | Evidência | Consequência | Prio | Dep. | Proposta |
| --- | --- | --- | --- | --- | --- | --- |
| GAP-Q-01 | Epic 28/29 sem testes (`users/me`, avatar, `processImageUpload`, sinopse do calendário) **(WT)** | grep `users/me` em tests = 0 | Entrega não verificada | P2 | — | Specs e unit |
| GAP-Q-02 | IDOR sem teste para progress/title/description/series/anidb/platform-links/refresh/DELETE/GET de anime e para reset de senha | notes D §6.3 | Regressão de autorização invisível | P2 | — | Matriz parametrizada |
| GAP-Q-03 | Sem teste de expiração de sessão e de login/logout reais | notes D §6.3 | — | P2 | — | E2E de sessão |
| GAP-Q-04 | Sem teste de conversão de fuso (`timezoneId`) | notes D §6.3 | Horários errados passam | P2 | D-07 | Projeto com múltiplos fusos |
| GAP-Q-05 | Sem teste de `calendar-loader`, `notifier` (dedupe/reagendamento) | notes D §6.3 | — | P2 | — | Testes de serviço |
| GAP-Q-06 | Sem teste do teto de paginação nem de dado em "hoje" (E2E semeia manualmente) | `tests/43…:41-44` | O P0 do calendário passou despercebido | P1 | GAP-T-01 | Teste do loader com janela real |
| GAP-Q-07 | Sem auditoria de acessibilidade automatizada | grep `axe` = 0 | Regressões a11y | P2 | — | `@axe-core/playwright` |
| GAP-Q-08 | Só projeto Playwright desktop | `playwright.config.ts:34-39` | Mobile sem cobertura | P3 | D-19 | Projeto mobile, se mantido |
| GAP-Q-09 | `series.ts` sem teste | lista de `*.test.ts` | Heurística de franquia não verificada | P2 | D-18 | Casos "Final Season", "Alicization"… |
| GAP-Q-10 | Sem CI (nem lint/typecheck/test automáticos) | `.github` ausente | — | P2 | — | Pipeline mínimo |
| GAP-Q-11 | Spoilers e bloqueios (quando existirem) | — | — | P1 | D-09, D-10 | Cobrir todas as superfícies |
| GAP-Q-12 | Sem teste de componente React | notes A §12 | — | P3 | — | Testing Library |
| GAP-Q-13 | **Nenhum dos 14 fluxos do Figma (A–H, 01–06) tem teste** ponta a ponta; o E2E existente cobre fluxos da PoC | `UX_FLOW_AUDIT.md` | Aceite dos fluxos não verificável | P2 | — | Um spec por fluxo (ver `VALIDATION_PLAN.md`) |

### F. Decisões de produto
Ver `OPEN_DECISIONS.md` (D-01 … D-31; D-01 resolvida). Cada lacuna acima aponta o D-xx correspondente quando a resolução depende dele.

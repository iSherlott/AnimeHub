# IMPLEMENTATION_ROADMAP — Sequência sugerida por fatias verticais (rev.2)

> Auditoria de 2026-10-08, **revisão 2** (Figma completo inspecionado: D-01 resolvida; novos requisitos e decisões D-28…D-31 incorporados às fatias). **Isto é um plano, não uma autorização para implementar.** Nada aqui deve começar sem a
> aprovação explícita do responsável pelo produto. Toda decisão marcada D-xx está em `OPEN_DECISIONS.md`; requisitos em
> `FUNCTIONAL_SPEC.md`; testes em `VALIDATION_PLAN.md`; evidências em `FIGMA_POC_TRACEABILITY.md`.
> Não há estimativas de esforço: a auditoria não mediu velocidade e não inventa números.

## 1. Como a sequência foi ajustada às dependências reais

O roteiro sugeriu uma ordem hipotética (fundação → auth → catálogo → publicações → hashtags → feed → respostas → perfis → spoilers/denúncias/bloqueios → notificações → visual → testes). As dependências encontradas no projeto mudam isso em cinco pontos:

1. **Primeiro o que já está quebrado** (calendário atual vazio, vazamento de progresso): são P0/P1 sem decisão nova (F1).
2. **Três decisões P0 antes de qualquer fatia de domínio:** D-02 (consumo + plano de migração), D-03 (detalhe público), D-18 (modelo canônico Franquia→Produção). O Figma já toma posição nas três (`OPEN_DECISIONS.md`), então F0 é de *confirmação*, não de descoberta; **D-01 está resolvida**. Elas determinam modelo de dados, telas e testes (F0). Antes de F13 também é preciso **D-30** (política de scraping).
3. **Modelo canônico antes de publicações/discussões/lista:** posts, hashtags e discussões por obra/temporada dependem de Obra/Temporada (F2), senão a PoC repete o `anilistId` solto.
4. **Spoiler, bloqueio e moderação *antes* de qualquer superfície pública de descoberta** (hashtags, "Recentes", "Em alta"): o princípio 12 e o gate de release social (F7 antes de F9/F10). O campo de spoiler entra **já na primeira migração de publicações** para evitar duas migrações.
5. **Calendário e títulos antes da camada social**, porque são o núcleo do produto (P-1, P-4, P-6) e a comunidade deve complementá-los (P-10).

## 2. Visão geral e dependências

| Fatia | Nome | Depende de | Pode ocorrer em paralelo com | Prioridade |
| --- | --- | --- | --- | --- |
| F0 | Alinhamento: confirmar as decisões P0 e as posições do Figma | — | — | **P0** |
| F1 | Estabilização sem decisão nova | — | F0 | **P0** |
| F2 | Fundação de domínio e detalhe público de obra | F0 (D-02/03/18) | F3 | **P0** |
| F3 | Autenticação, permissões e privacidade | — (D-04, D-21, D-22) | F2 | P1 |
| F4 | Acompanhar e Minha Lista | F2, D-02 | F5, F6 | P1 |
| F5 | Calendário, fuso e "Hoje" | F1, F2 (D-05/07/08/25) | F4, F6 | P1 |
| F6 | Hierarquia de título e tipografia japonesa | F0 (D-06, D-20) | F4, F5 | P1 |
| F7 | Spoiler, moderação e bloqueio (gate de release social) | F2, F3 | — | P1 |
| F8 | Publicações e discussões ligadas a obra/temporada | F2, F7 (D-13/15/23/27) | — | P1/P2 |
| F9 | Hashtags e descoberta | F8, F7 (D-13) | F10 | P2 |
| F10 | Feeds e área Comunidade | F8, F7 (D-05, D-12) | F9 | P2 |
| F11 | Perfis e relações sociais | F7 (D-24) | F9, F10, F12 | P2 |
| F12 | Notificações (lançamento e sociais) | F5, F8 (D-11, D-26) | F11 | P1/P2 |
| F13 | Admin de dados: catálogo, logs, importação, matching, conflitos, overrides (Scrapers só após D-30) | F2 (D-17, D-30) | F11, F12 | P2 |
| F14 | Integração visual e acessibilidade | contínua; fecha após F4–F12 (D-19, D-20) | — | P2 |
| F15 | Regressão e validação de UX | F4–F14 | — | P1 |

## 3. Fatias

### F0 — Alinhamento (status: D-02, D-03, D-18 **aprovadas em 2026-10-09**; restam o plano de migração, D-30 e as demais confirmações)

#### Detalhe de F0: confirmar as decisões P0 e as posições do Figma
- **Objetivo:** transformar "o Figma desenha assim" em decisão aprovada e fechar as pendências do próprio Figma.
- **Pré-requisitos:** nenhum. **Entregas (não são código):** respostas a D-02 (inclui plano de migração), D-03, D-18; confirmação das 22 decisões com posição do Figma; decisões sobre os pontos *sem* posição (D-21, D-28, D-29, D-30, D-31) e sobre as pendências sem número (`13:41172`: limites, rate limits, retenção de rascunho, janela de "Em alta", agregação de notificações); correção dos pontos do Figma listados em `FIGMA_INVENTORY.md` §7 (FV-06/07/08/09/12) antes das fatias que dependem deles.
- **Reaproveitar/Adaptar/Criar:** n/a. **APIs/persistência:** n/a.
- **Aceite:** as três decisões P0 registradas e aprovadas; as decisões dos fluxos de F2–F8 registradas; lista de pendências do Figma aceita por escrito ou corrigida.
- **Riscos:** começar implementação de lista/detalhe/feeds antes disso e refazer (D-02 e D-18 invalidam testes e modelo).
- **Testes:** nenhum.

### F1 — Estabilização sem decisão nova
- **Objetivo:** restaurar a agenda atual, tornar a falha detectável, fechar o vazamento de progresso e o working tree.
- **Base de requisito:** CAL-001/CAL-005 (P-6), AUTH-004 (P-8) — ambos confirmados.
- **Reaproveitar:** `services/calendar-loader`, `getAiringSchedule`, `cacheAiringSchedule`, `GET /api/calendar`, `calendarItem.ts`.
- **Adaptar (PT):** janela do loader que **alcance o presente** (ingerir por faixas semanais, não por uma paginação de 17 semanas com teto de 10 páginas); truncamento registrado em log; `fetchedAt` atualizado no `update`; health baseado no último ciclo bem-sucedido e na cobertura (`max(airingAt)` ≥ hoje); remover `author.completed` de `comments/route.ts` e o ícone de `CommentSection`; `try/catch` em `request.json()` (`title`, `description`, `series`, `users/me`).
- **Criar:** teste do loader com >500 itens e com episódio removido/adiado; limpar "fantasmas" (decisão D-25 para a regra final).
- **APIs/persistência:** sem mudança de schema obrigatória.
- **Fechar o working tree (WT):** escrever testes mínimos de avatar/bio (`users/me*`), `processImageUpload`, sinopse do calendário e `InlineEditField`; só então commitar (ou descartar por decisão).
- **Aceite:** `GET /api/calendar?weekOffset=0` devolve a semana corrente; o health falha/alerta quando a janela não cobre hoje; nenhum DTO social traz `completed`; JSON inválido → 400 em todas as rotas; testes novos passam.
- **Riscos:** limite/ban da AniList ao aumentar chamadas (exige timeout, retry e tratamento de 429 — GAP-T-07).
- **Testes:** VT-F-04, VT-F-07, VT-F-08, VT-I-06, VT-I-01.

### F2 — Fundação de domínio e detalhe público de obra
- **Objetivo:** ter entidades canônicas e uma página pública por obra/temporada.
- **Pré-requisitos:** D-02, D-03, D-18 aprovadas (D-01 resolvida).
- **Reaproveitar:** `CatalogEntry`, `AiringScheduleEntry`, `Episode`, `refreshAnimeData`, `anilist.ts`, conteúdo da página `/anime/[id]` (sinopse, trailer, elenco, site oficial), `AnimeInfoModal`.
- **Adaptar:** `Anime` por usuário → vínculo `UserTracking` (usuário × temporada) sem copiar metadados; `series.ts` substituído pelas `relations` da AniList (PREQUEL/SEQUEL/PARENT); `seasonNumber` e `season`/`seasonYear` renomeados para eliminar a confusão de três "temporadas".
- **Criar:** entidades Franquia → Produção(Temporada) → Agenda com FKs, tipos TV/Movie/OVA/Special e status Finalizado/Em exibição/Adiado/Cancelado/Data desconhecida (`8:3603`), (`Post`, `Comment`, `AiringAlert` passam a referenciá-las); página de temporada (`8:1733`); rota pública de detalhe (404 só para obra inexistente); `IngestionRun` + log mínimo de overrides (ADMIN-003) e proveniência por campo; migração dos dados existentes (hoje o banco dev está sem usuários, mas a produção é desconhecida).
- **APIs/persistência (Proposta):** `GET /obras/{id}` público; `POST/DELETE /acompanhando/{temporadaId}`; migrações com `backfill` e plano de reversão.
- **Aceite:** visitante abre o detalhe de qualquer obra do catálogo; "Attack on Titan: The Final Season" e "SAO: Alicization" caem na franquia certa; N usuários não geram N cópias; nenhuma coluna `anilistId` solta nas tabelas sociais.
- **Riscos:** migração de dados e testes existentes (`05` fixa o 404 do visitante); escopo grande — dividir em sub-fatias (modelo → leitura pública → vínculo → migração).
- **Testes:** VT-F-03, VT-F-13, VT-I-04, VT-I-06; revisar `05`, `42`, `11`, `27`.

### F3 — Autenticação, permissões e privacidade
- **Objetivo:** fechar os gaps de segurança P1/P2 e o destino pós-login.
- **Pré-requisitos:** D-04, D-21, D-22 (podem ser decididas já).
- **Reaproveitar:** `requireUser/requireAdmin`, ownership 404, `toPublicUser`, convite atômico, `processImageUpload`.
- **Adaptar:** `login/page.tsx`/`signup/page.tsx` e todos os botões "Entrar" para `returnTo` relativo validado (`startsWith("/") && !startsWith("//")`); signup com resposta neutra e limites de tamanho; `isFirstEverUser` atômico e/ou admin por CLI; sanitização das 5 superfícies de HTML; `imageUrls` só de uploads próprios (se D-15); remoção do arquivo na troca/remoção.
- **Criar:** rate limit (login, cadastro, upload, refresh, busca, denúncia); headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`); proteção central de rotas (padrão "negado por padrão") ou teste que falha para rota nova sem checagem; purga de sessões; token de sessão em hash; autenticação entre serviços internos; guarda de ambiente em scripts destrutivos.
- **APIs/persistência:** coluna/tabela para hash de token e contadores de limite (Proposta).
- **Aceite:** AUTH-001…004; visitante volta ao ponto de origem após login; matriz de autorização passa para as 50 rotas.
- **Riscos:** limitar demais usuários legítimos; quebrar `tests/05` e as sessões fixas dos E2E.
- **Testes:** VT-S-01…VT-S-09, VT-U-03.

### F4 — Acompanhar e Minha Lista
- **Objetivo:** "Acompanhar/remover" conforme o contrato, sem consumo (conforme D-02).
- **Pré-requisitos:** F2, D-02.
- **Reaproveitar:** `FavoriteToggle`, `DiscoverCard`, `/minha-lista`, `PlatformLinksManager`, rotas de lista.
- **Adaptar:** rótulo "Acompanhar"; remover `ProgressEditor`, `EpisodeGrid.watchedCount`, barra x/y, "Continuar assistindo", `statusColors`; organizar Minha Lista por critérios não-consumo (favoritos, próximos lançamentos); `POST /api/anime` deixa de criar `WatchProgress`.
- **Criar:** botão "Deixar de acompanhar" com confirmação; busca/filtro da própria lista; migração/descarte dos dados de consumo existentes.
- **Aceite:** LIST-001…004; nenhuma tela/API/DTO com progresso de consumo.
- **Riscos:** quatro specs existentes fixam o comportamento atual (`22`, `25`, `42`, `01`).
- **Testes:** VT-F-09, VT-F-10, VT-F-11.

### F5 — Calendário, fuso e "Hoje"
- **Objetivo:** responder "o que sai hoje?" no fuso certo e tratar horários incertos.
- **Pré-requisitos:** F1, F2; D-05, D-07, D-08, D-25.
- **Reaproveitar:** `CalendarDayColumn/EntryCard/EntryPreview`, `airingWindow.ts`, toggle Todos/Minha lista.
- **Adaptar:** semana (D-08); horário antes de "EP"; ordem cronológica global; preview acessível por foco/teclado/toque; selo "NO AR" com ícone.
- **Criar:** **Dashboard "Seu dia, em anime"** (CAL-007/S-11, acesso pelo logo); painéis "Sem horário definido" / "Data não definida" e estado "Atrasado"; preferência de fuso por conta + rótulo; servidor recebe fuso IANA (não depende do `weekStart` do cliente); estados "a confirmar", "adiado", "cancelado"; indicação da idade do dado.
- **Aceite:** CAL-001…007; VT-X-02/03/04; VT-U-01 e VT-U-08.
- **Riscos:** DST/fusos; tela vazia silenciosa se o loader falhar (cobrir com VT-F-08).
- **Testes:** VT-F-04…VT-F-08, VT-F-26, VT-A-07, VT-A-10, VT-U-01, VT-U-08.

### F6 — Hierarquia de título, tipografia japonesa e Configurações
- **Objetivo:** japonês → kana → inglês, romaji como formato alternativo, **página de Configurações** (formato dos títulos, timezone, tema, notificações) com preferência por conta.
- **Pré-requisitos:** D-06, D-20.
- **Reaproveitar:** `titlePreference.tsx`, `TitleLanguageMenu`, `AnimeTitle` (furigana), `ensureFurigana`.
- **Adaptar:** padrão japonês; leitura em kana (fonte conforme D-06); `lang="ja"` nos trechos japoneses; Noto Sans JP conforme o Figma (`8:183`).
- **Criar:** colunas de preferência em `User` (título, timezone, notificações) com fallback local; página de Configurações (S-12) com estados de salvar/falha/sucesso (`8:5448`, `8:5542`).
- **Aceite:** DET-002, CFG-001; matriz formato × campo ausente coberta.
- **Testes:** VT-F-12, VT-F-27, VT-A-06.

### F7 — Spoiler, moderação e bloqueio (gate de release social)
- **Objetivo:** nenhuma superfície pública de descoberta antes destes controles (P-12).
- **Pré-requisitos:** F2, F3; D-09, D-10, D-16.
- **Reaproveitar:** `PostReport/CommentReport`, fila admin, soft delete, `$transaction` de resolução.
- **Adaptar:** DTOs ocultam o corpo quando `spoiler`; `toPostDto` devolve tombstone em vez de omitir; `AdminDashboard` recebe motivo, suspensão e trilha.
- **Criar:** `Post.spoiler` (e em resposta; marca do **autor**, desmarcada por padrão), componente "revelar"/"ocultar novamente" acessível; garantir que o texto de spoiler **não existe** na resposta da API/DOM antes da ação (GAP-S-16); decidir antes (D-09/FV-06) a prévia de resposta e as hashtags do post protegido; `Block` + filtro central server-side; denúncia de `PostComment` e perfil, com motivo; remoção direta por admin; tombstone "removido".
- **Aceite:** SPOIL-001/002, PROF-003, MOD-001/002; nenhuma superfície vaza texto de spoiler; denúncia com os 4 motivos do Figma, diálogo de confirmação e bloqueio com "Perfil indisponível".
- **Riscos:** vazamento por previews/lateral/notificações; filtros de bloqueio esquecidos em um feed.
- **Testes:** VT-F-19…VT-F-22, VT-F-34, VT-X-F, VT-X-G, VT-U-07, VT-U-09.

### F8 — Publicações e discussões ligadas a obra/temporada
- **Objetivo:** publicar e discutir a obra/temporada sem exigir acompanhá-la (D-27).
- **Pré-requisitos:** F2, F7; D-13, D-15, D-23, D-27.
- **Reaproveitar:** `Post`, `PostComment`, `PostCard`, compositor, `LikeToggle`, repost/citação (conforme D-15), uploads (conforme D-15).
- **Adaptar:** contexto de anime **opcional**, por **seletor explícito de produção** validado no servidor (menção/hashtag não associa); estados do compositor do Figma (vazio, validação, publicando/dedup, falha com rascunho, descartar: `13:43375`); curtir com rollback; "Compartilhar internamente" conforme D-28; unificar `Comment` e `PostComment` (D-23); paginar respostas; confirmação ao apagar; limites aprovados.
- **Criar:** vínculo de publicação com obra/temporada canônicas; página da obra lista as publicações com filtro por temporada.
- **Aceite:** POST-001…008, DISC-001; VT-X-B/C/E; VT-U-04, VT-U-05.
- **Testes:** VT-F-15, VT-F-16, VT-F-29, VT-F-30, VT-F-31, VT-I-04.

### F9 — Hashtags e descoberta
- **Pré-requisitos:** F8, F7; D-13. **Reaproveitar:** `animeHashtag.ts` (normalização/autocomplete) como ponto de partida.
- **Adaptar:** Unicode (letras, números, `_`), deduplicação, limite por post. **Criar:** entidade de hashtag com ID canônico e tipo (obra/temporada/gênero/tópico), página da hashtag (Recentes; "Em alta" após D-12), links nos posts.
- **Aceite:** HASH-001/002; VT-F-17, VT-F-32, VT-X-A. **Riscos:** descoberta expõe conteúdo — só após F7.

### F10 — Feeds e área Comunidade
- **Pré-requisitos:** F8, F7; D-05, D-12. **Reaproveitar:** `feedRanking`, `loadFollowingPage`, lateral.
- **Adaptar:** "Para você" com regra explicável; erro distinto de vazio; remover duplicidade original+repost na aba. **Criar:** "Recentes"; rota/menu "Comunidade" (4º destino); busca social com escopos (SOC-004); preservação de contexto ao voltar (SOC-005); estados vazios do Figma (`13:43738`); "Em alta" **somente na hashtag**, com janela e critérios.
- **Aceite:** SOC-001…005; VT-F-14, VT-F-28.

### F11 — Perfis e relações sociais
- **Pré-requisitos:** F7; D-24. **Reaproveitar:** `ProfileHeader`, `FollowToggle`, `BioEditor` e `UserAvatar` (WT, com testes de F1). **Decisão antes:** o **upload de avatar** (`AvatarUploader`, WT) contradiz o Figma (avatar de iniciais) — manter ou remover conforme D-15.
- **Adaptar:** propagar o avatar escolhido ao compositor, lateral e respostas; `GET /api/users/[id]` alinhado à página; atalho "🔒 Minha Lista privada" e "+ Nova publicação" no perfil próprio. **Criar:** @identificador único, edição de nome/identificador/bio, aba "Discussões iniciadas" (se definida), listas de seguidores/seguindo (D-24).
- **Aceite:** PROF-001/002/004; VT-F-18, VT-X-D.

### F12 — Notificações
- **Pré-requisitos:** F5, F8; D-11, D-26. **Reaproveitar:** `notifier`, `AiringAlert`, `NotificationBell`.
- **Adaptar:** escopo (toda obra acompanhada); `upsert` atômico e `try/catch` por alerta; destino = detalhe público + próxima data.
- **Criar:** tipo **"Data alterada"** (com horário anterior); sino único com canais Lançamentos e Social; eventos sociais (resposta à publicação, resposta ao comentário, novo seguidor; curtidas OFF por padrão), preferências (S-12), "Marcar Social como lido", destino com âncora, tombstone.
- **Aceite:** NOTIF-001…003; VT-F-23, VT-F-24, VT-X-H, VT-X-03.

### F13 — Admin de dados (sub-fatias)
- **Pré-requisitos:** F2; D-17; **D-30 antes de qualquer Scraper**. **Reaproveitar:** `/admin`, `requireAdmin`, `IngestionRun` (F2).
- **Sub-fatias propostas (Proposta):** (13a) Logs + registro de execuções/Jobs + Catálogo Franquia→Produção (ADMIN-003/004/006); (13b) Importação por HTML colado → prévia → confirmação (ADMIN-001) — apenas se D-30 aprovar colagem manual; (13c) Matching ponderado e Conflitos A×B (ADMIN-002); (13d) Overrides globais de BroadcastDate/Time com proveniência (ADMIN-007); (13e) Scrapers (ADMIN-005) **somente** após parecer sobre termos/robots/rate limit.
- **Adaptar:** `refreshAnimeData` sem regravar IDs sem confirmação; auditoria de resets de senha.
- **Aceite:** ADMIN-001…007; VT-F-25, VT-X-05, VT-X-06.

### F14 — Integração visual e acessibilidade
- **Pré-requisitos:** D-19, D-20; fecha depois de F4–F12 (mas começa cedo).
- **Reaproveitar:** MUI Menu/Dialog/Popover, anel de foco amarelo, hero com pausa.
- **Adaptar:** tokens do Figma como fonte única; alvos ≥ 44 px; foco global; estados texto+ícone; landmarks e skip-link; contraste do acento; centralização em 1920 (se desktop).
- **Criar:** biblioteca de estados; auditoria `@axe-core/playwright`.
- **Aceite:** VIS-001…005; VT-A-01…VT-A-10; mapeamento Figma→código (GAP-V-16).

### F15 — Regressão e validação de UX
- **Pré-requisitos:** F4–F14. **Entregas:** suíte de regressão (§5 de `VALIDATION_PLAN.md`), pipeline de CI, testes de usabilidade VT-U-01…VT-U-12 e de aceite por fluxo do Figma (VT-X-A…H, VT-X-01…06) com as metas do Figma (≤ 2 s e ≤ 10 s).
- **Aceite:** nenhum teste da lista de regressão falha; metas de UX medidas e registradas (metas, não resultados).

## 4. O que esta sequência deliberadamente NÃO faz
- Não reescreve a aplicação: preserva autorização por handler, upload, convite atômico, soft delete, fallback em cache, taxonomia de gêneros, hero acessível.
- Não promete datas nem esforço.
- Não implementa nada antes de F0.

## 5. Status de implementação (atualizado em 2026-10-09)

Execução autorizada pelo responsável ("todas as fatias F1→F15, em sequência"). **Nada foi commitado nem enviado a remoto.**
Migrações novas (`20261009120000` … `20261009220000` (12 migrações)) são aplicadas automaticamente no banco de testes (`animehub_test`);
no banco de desenvolvimento **ainda não foram aplicadas** (execução bloqueada por permissão — `docker compose run --rm migrate`).

| Fatia | Estado | Evidência |
| --- | --- | --- |
| F1 Estabilização | **Feita** | Loader semanal (429/Retry-After, poda, `/health` real), `author.completed` removido, guardas de `request.json()`; testes 46 + unit |
| F2 Domínio + detalhe público | **Feita** | `Franchise`/`Production`, `/obra/[anilistId]`; teste 47 |
| F3 Auth/permissões/privacidade | **Feita** (parcial) | `?next=`, rate limit, CSP, sanitização; testes 48, 49. **Adiado:** hash de token de sessão, autenticação entre serviços internos, guardas dos scripts |
| F4 Acompanhar / Minha Lista | **Feita** | Sem consumo (D-02); teste 50 |
| F5 Calendário/fuso/Hoje | **Feita** | Segunda→domingo, fuso por conta, `/dashboard`; teste 51 |
| F6 Títulos + Configurações | **Feita** | Padrão japonês (kanji), `/configuracoes`; teste 52. **Pendente:** fonte de kana (D-06) |
| F7 Spoiler/moderação/bloqueio | **Feita** | Spoiler do autor, bloqueio bidirecional, denúncias por motivo; testes 53, 54 |
| F8 Publicações e discussões | **Feita** | Contexto de obra opcional/explícito, Recentes, respostas de um nível, página dedicada; teste 55 |
| F9 Hashtags | **Feita** | Unicode, ID canônico, limite 5 (provisório), página com Recentes/Em alta; teste 56 |
| F10 Feeds/Comunidade | **Feita** (parcial) | Busca social com escopos (`/buscar`), contexto na URL, erro distinto de vazio, "Para você" com regra explicada; teste 57. **Adiado:** deduplicar original+repost na aba; "Em alta" fora da hashtag segue ausente (de propósito) |
| F11 Perfis | **Feita** (parcial) | @identificador único, editar nome/identificador, atalhos no perfil próprio, "Discussões iniciadas" (definição proposta); teste 58. **Adiado:** listas de seguidores/seguindo (D-24), decisão de upload de avatar (D-15 — mantido como está) |
| F12 Notificações | **Feita** | Sino com canais Lançamentos e Social, "Data alterada" com horário anterior (loader detecta reagendamento), eventos sociais sem texto do conteúdo, preferências, "Marcar Social como lido", tombstone; teste 59 |
| F13 Admin de dados | **13a feita**; 13b–13e **bloqueadas** (D-30/D-17) | Execuções (`IngestionRun`) e Catálogo Franquia→Produção, somente leitura; teste 60. Importação por HTML, matching, conflitos, overrides e scrapers **não** iniciados |
| F14 Visual/acessibilidade | **Feita** (parcial) | Skip-link, foco global, alvos ≥ 44 px em ícones, contraste AA (primário claro para texto), `<h1>` na Comunidade, auditoria axe em 11 telas; teste 61. **Adiado:** biblioteca de estados e tokens do Figma como fonte única (GAP-V-16), centralização em 1920 |
| F15 Regressão/CI | **Parcial** | Workflow `.github/workflows/ci.yml` (tipos, lint, unit, Playwright+axe); suíte de regressão = suíte atual. **Não feito:** testes de usabilidade VT-U com pessoas e medição das metas ≤ 2 s / ≤ 10 s (exigem participantes/instrumentação) |

## 6. Redesenho rev.3 do Figma (atualizado em 2026-10-10)

O Figma foi revisado de novo (páginas `10:41`…`10:45`). Esta rodada leva o app às telas novas; **nada foi enviado a remoto** e as migrações novas
(`20261010130000_add_admin_import_pipeline`) são aplicadas no banco de testes, mas **ainda não** no de desenvolvimento.

| Tela / fluxo | Estado | Observações |
| --- | --- | --- |
| Explorar `8:1361`, Busca `8:1606` | **Feita** | Filtros em linha (gênero/temporada/ano) + modal "Mais filtros" com rascunho (Esc/Cancelar não aplica), destaque da temporada, "Em destaque", "Novas histórias, outros tempos" e chips de temporadas; a busca vira "Resultado da busca" com "Seu próximo lançamento". Cartões nunca inventam horário (`exploreGroups.ts`). **Lacuna:** o filtro "Tipo" depende de `format` no catálogo (não existe em `CatalogEntry`). |
| Temporada `8:1733` | **Feita** | `/temporada/[slug]` (`autumn2026`): "Em exibição" × "Estreias e datas a confirmar", filtros de gênero/status, "Todas as temporadas". |
| Calendário `8:2106` + preview `28:1940` | **Feita** | Colunas por dia em ordem de horário (sem eixo de horas), escala ultrawide em `em`, "Previsão atrasada", painéis "Sem horário definido"/"Data não definida" e "Adiado" derivados do catálogo (D-25: dia 1 = data parcial, nunca tratada como exata). |
| Login `8:2371`, Cadastro | **Feita** | Painel de arte + formulário; senha com mostrar/ocultar. A arte é um degradê CSS (o asset do Figma é ilustrativo). |
| Detalhe `8:1953` | **Mantida** (rev.2) | Já segue o Figma 14; a posição das abas ainda difere (abas antes da sinopse). |
| Dashboard `8:2442`, Minha Lista `8:2608` | **Feita** | Contadores, linhas com horário/episódio, "Depois de hoje", "Atualizações da sua lista"; Minha Lista agrupa por data e leva atrasados/adiados/sem horário/sem data a painéis (`myListState.ts`). **Pendente:** "+ Discussões sobre meus animes" (depende de D-23). |
| Estados `10:44` | **Feita** | `StatePanels.tsx`: `EmptyState`, `Notice`/`ErrorNotice`, `ConfirmDialog` (foco em Cancelar, "Efeito da ação", "Confirmando…"); Loading com esqueletos na geometria dos cartões. |
| Admin `10:43` (11 telas) | **Feita** (com limites) | Casca com barra lateral; Dashboard, Catálogo, Importações (HTML colado → prévia), Resultado, Matching (score ponderado), Conflitos, Overrides (aplicados no calendário e na Minha Lista), Scrapers, Jobs, Job Detail, Logs. Pipeline em `src/lib/adminImport/`. A área antiga (convites, usuários, denúncias) foi para `/admin/acesso`. |
| Fundações, Componentes, Padrões, Protótipos (`10:35`…`10:40`, `10:45`, `13:44907`…`13:44911`) | **Conferidas** | São pranchas de especificação, não telas: tokens e componentes já vivem em `muiTheme.ts`/`globals.css` e nos componentes citados acima. |

**Política de coleta (D-30) preservada:** o "Scrapers" do Figma NÃO coleta sites de terceiros. A fonte AniDB é o HTML colado por um administrador
(tratado como texto, com origem, versão do parser e job registrados) e o calendário continua vindo da API pública da AniList via `calendar-loader`.
Não há botão "Executar"; a tela mostra saúde, histórico e a razão.

**Limites conhecidos do Admin:** o commit vincula `Production.anidbId` e cria `CatalogEntry` (fonte `anidb`) para registros novos; não cria `Production`
(exige `anilistId`). Overrides valem por episódio (`airingAt`) e não alcançam o serviço `notifier`.

### 6.1 Ajustes pós-redesenho (2026-10-10)

- **Preview do calendário:** não trava mais a rolagem da página (`disableScrollLock`); "+ Acompanhar" adiciona direto à lista (`POST /api/anime`) e o item da grade passa a contar como da lista.
- **Onde assistir:** `Production.streamingLinksJson` (links `STREAMING` da AniList, só http/https, sem desativados) aparece em `/obra/[id]` e em `/anime/[id]`; produções antigas são reconsultadas uma vez.
- **Imagens dos episódios:** `EpisodeImage` + job diário às 00:00 America/Sao_Paulo no `cache-updater` (recupera o dia se o serviço estava fora do ar) e botão "Executar agora" em Admin → Scrapers. Fonte: API pública da Kitsu pelo mapeamento oficial AniList → Kitsu (não é coleta de site, D-30 segue valendo). Sem imagem do episódio, o calendário mostra a capa do anime. Migração `20261010150000`.

### 6.2 Ajustes de uso real (2026-10-10)

- **Importação da temporada (AniDB):** o parser agora lê a listagem real do AniDB (caixas `g_bubble box`: nome, "25th September", "TV Series, 12 eps", sinopse e ícones de streaming); o ano vem da temporada do lote. O contrato `<article>` continua aceito (ParserVersion 2.0.0). O matching considera as produções **e** o catálogo da temporada (AniList) — obras ainda sem página entram como candidato `ce:<anilistId>` e a `Production` só é criada no commit. O commit leva sinopse e sites de streaming do AniDB (`ImportRecord.description/linksJson/episodes/imageUrl`); os sites sobrevivem à atualização pela AniList (`mergeStreamingLinks`).
- **Catálogo completo:** `getSeasonalAnime` pagina (50 por página, até 400) e inclui TV, curtas, filmes, ONA, OVA e especiais; `idMal` fica em `CatalogEntry.malId`. Admin → Catálogo lista também as obras do catálogo da temporada que ainda não têm produção.
- **Kana/Furigana:** `/api/readings` (kuroshiro, cache `TitleReading`) alimenta `useTitleLines`/`PrimaryTitle` — "kanji + kana" mostra o original e a leitura em kana; "kanji + furigana" mostra `<ruby>`. Antes caía no romaji.
- **Sinopse no idioma da preferência:** `/api/synopsis` traduz uma vez (MyMemory, ou LibreTranslate via `LIBRETRANSLATE_URL`) e guarda em `SynopsisTranslation`. Português segue os títulos em português; inglês mostra o original; com títulos em japonês vale `User.synopsisLanguage` (padrão português; Configurações → "Idioma da sinopse"). Falha de tradução mostra o original e não grava nada.
- **Onde eu assisto:** em `/obra/[id]` quem acompanha a obra cadastra o site onde assiste (`PlatformLinksManager`); o link abre direto no site.
- **Calendário:** "AO VIVO" só para o que está no ar (sem selo para os demais); o destaque vermelho só aparece na aba "Todos".
- **Notificações:** o notificador avisa lançamentos das próximas 24 h (janela `notifyRangeForNow`), e o sino mostra "EP03 vai ao ar · hoje às HH:mm".
- **Navegação:** "Minha lista" do menu virou "Meus animes"; "Administração" saiu do menu (acesso pelo menu do perfil); o painel ganhou "Voltar ao Anime Hub"; botão flutuante "Voltar ao topo".
- **Notícias (serviço secundário):** `services/news-fetcher` (porta 4005, `NEWS_FETCHER_URL`) busca na Jikan (MyAnimeList) as notícias das obras da temporada atual — chamado por Admin → Scrapers → "Buscar notícias" e uma vez por dia. Resultado em `AnimeNews`/`NewsRun`; Comunidade → Notícias (`/noticias`) lista por "Todas", "Que sigo" e busca. Migração `20261010170000`.

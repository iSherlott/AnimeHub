# POC_INVENTORY — Inventário real da PoC

> Auditoria de 2026-10-08 (Fonte B). Tudo abaixo vem de leitura do repositório em `D:\My_Code\Challenge\Crunchyroll`:
> commit `HEAD e86c04d` **mais** o working tree não commitado **(WT)** — 27 entradas em `git status`, listadas em §13.
> Contagens de arquivos foram refeitas por comando nesta auditoria; o restante vem das quatro investigações
> (frontend, backend/dados, social, auth/testes) e foi conferido por amostragem. **Nada foi executado em navegador;
> o banco/containers foram consultados só em leitura** (`docker ps`, `SELECT`, `GET /api/calendar`).
> Para o juízo de cada item (alinhado/divergente), ver `FIGMA_POC_TRACEABILITY.md` e `DOMAIN_AND_ARCHITECTURE_GAPS.md`.

## 1. Stack e versões (confirmadas em `package.json`)

| Camada | Tecnologia | Versão |
| --- | --- | --- |
| Framework web | Next.js (App Router, route handlers; **sem** Server Actions — `grep "use server"` = 0) | 16.3.5 |
| UI | React / MUI (+ `@mui/material-nextjs`, `@mui/icons-material`) / Emotion | 19.2.8 / ^9.4.0 / ^11.14 |
| Estilo | MUI `sx` **convive com** Tailwind v4 (`@tailwindcss/postcss`) | ^4 |
| Linguagem | TypeScript | ^5 |
| Banco / ORM | PostgreSQL 16 (`postgres:16-alpine`) / Prisma | 16 / ^6.19.3 |
| Imagens | sharp | ^0.35.4 |
| Texto japonês | kuroshiro + kuroshiro-analyzer-kuromoji (furigana) | ^1.2.0 / ^1.1.0 |
| XML | fast-xml-parser (resposta da AniDB) | ^5.11.1 |
| Testes | Vitest / Playwright | ^3.2.7 / ^1.63.0 |
| Lint | ESLint + eslint-config-next | ^9 / 16.3.5 |
| Runtime nas imagens | `node:20-slim` (Node local do dev: v24.19.0 — sem `engines`/`.nvmrc`) | 20 vs 24 |

`AGENTS.md` avisa que este Next tem mudanças incompatíveis; a auditoria não escreveu código nem interpretou APIs específicas do Next.

## 2. Estrutura de diretórios

| Caminho | Conteúdo (contagem real) |
| --- | --- |
| `src/app/` | 9 páginas (`page.tsx`), 50 `route.ts` em `src/app/api/**`, `layout.tsx`, `not-found.tsx`, `globals.css`. **Sem** `error.tsx`, `loading.tsx`, `global-error.tsx`, `middleware.ts` nem `proxy.ts` |
| `src/components/` | 51 componentes `.tsx` |
| `src/lib/` | 57 módulos `.ts/.tsx` + `src/lib/auth/` (4) — regras de domínio, fontes externas, DTOs, tema |
| `services/` | 4 microsserviços Node/`tsx`: `calendar-loader`, `cache-updater`, `name-resolver`, `notifier` (importam `src/lib/*` por caminho relativo) |
| `prisma/` | `schema.prisma` (499 linhas, 17 modelos), 15 migrations ativas, `migrations_sqlite_archive/` (histórico pré-Postgres), `dev.db` (legado, ignorado pelo git) |
| `tests/` | 45 specs Playwright + fixtures + `global-setup.ts` |
| `scripts/` | `seed-catalog-cache.cjs`, `seed-community.cjs`, `clear-cache.cjs` |
| `docker/`, `Dockerfile`, `docker-compose.yml` | imagem `web` (3 estágios, standalone), serviços, Postgres, job `migrate` |
| `storage/uploads/` | uploads de imagem (fora de `public/` de propósito — `next start` não serve arquivos criados depois do boot) |
| `docs/audit-figma-poc/` | **esta auditoria** (nova pasta; não existia `docs/`) |

## 3. Frontend

### 3.1 Rotas (as 9 páginas)

| Rota | Arquivo | Tipo | Renderiza | Visitante anônimo |
| --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` | Server shell + `FeedView`/`FeedSidebar` (client) | **Feed público** (abas Recomendado / Seguindo-logado), compositor, lateral (≥lg) | Livre; compositor vira CTA de login |
| `/discover` | `app/discover/page.tsx` (574 l., client) | Client | Busca, "Em alta", filtros, ordenação, grade | Livre; "+" leva a `/login` sem destino |
| `/calendar` | `app/calendar/page.tsx` | Client | Semana Dom→Sáb, 7 colunas, "★ Minha lista" / "Todos os lançamentos" | Livre; força "Todos" |
| `/minha-lista` | `app/minha-lista/page.tsx` | Server | Hero + fileiras por status de consumo + "Todos os animes" | Tela "Faça login…" (HTTP 200) |
| `/anime/[id]` | `app/anime/[id]/page.tsx` | Server | Detalhe completo (banner, títulos, sinopse, `ProgressEditor`, plataformas, trailer, elenco, `EpisodeGrid`, comentários, recomendados) | **404** para anônimo e para quem não é dono da linha `Anime` |
| `/users/[id]` | `app/users/[id]/page.tsx` **(WT)** | Server | `ProfileHeader` (avatar, nome, contadores, bio) + posts | Livre |
| `/login`, `/signup` | `app/login`, `app/signup` | Client | Formulários (cadastro por código de convite, `?invite=`) | Livre; sucesso sempre `router.push("/")` |
| `/admin` | `app/admin/page.tsx` | Server | `AdminDashboard` | 404 para não-admin |

### 3.2 Layout e navegação
- `layout.tsx`: `<html lang="pt-BR">`; provedores `AppRouterCacheProvider → MuiProviders → CurrentUserProvider → TitlePreferenceProvider`; um único `<main>`; cada página injeta o `<Header/>` **dentro** do `<main>`; sem skip-link.
- `Header.tsx` (330 l.): `AppBar` sticky; logo "Anime Hub" → `/`; nav "Minha lista" (logado), "Descobrir", "Calendário", "Administração" (admin); **sem item Feed/Início/Hoje/Comunidade**; abaixo de **1240 px** vira hambúrguer; direita: `NotificationBell` + `AccountMenu` (logado) ou `TitleLanguageMenu` + "Entrar".
- `AccountMenu` **(WT: `UserAvatar`)**: idioma do título, "Meu perfil", "Administração", "Sair" (sem configurações de fuso/notificação).

### 3.3 Componentes por domínio (todos usados; nenhum órfão em `src/components`)
- **Descoberta:** `DiscoverCard`, `DiscoverFilters`, `FilterChipRow`, `AnimeInfoModal` (único "detalhe" do visitante), `Row`, `HeroBanner`/`HeroBannerRotator`, `AnimeCard`.
- **Calendário:** `CalendarDayColumn`, `CalendarEntryCard`, `CalendarEntryPreview` **(WT)**.
- **Detalhe:** `AnimeTitle` (furigana via `<ruby>`), `AnimeDescription`, `OtherTitles`, `CastSection`, `TrailerEmbed`, `RecommendationCard`, `SeasonSwitcher`, `ProgressEditor`, `EpisodeGrid`, `FavoriteToggle`, `PlatformLinksManager`, `RefreshDataButton`, `AnimeMetaEditorsPopover` + editores (`TitleEditor`, `DescriptionEditor`, `AnidbIdEditor`, `SeriesGroupEditor`) sobre `InlineEditField` **(WT)**, `CommentSection`.
- **Social/perfil:** `FeedView` (748 l.), `FeedSidebar` (354 l.), `PostCard` **(WT)**, `PostComments`, `PostImageCarousel`, `ComposerImageAttachments`, `LikeToggle`, `FollowToggle`, `UserPostList`, `ProfileHeader` **(WT)**, `AvatarUploader` **(WT, novo)**, `BioEditor` **(WT, novo)**, `UserAvatar` **(WT, novo)**.
- **Admin/infra:** `AdminDashboard` (517 l.), `Header`, `AccountMenu`, `TitleLanguageMenu`, `NotificationBell`, `MuiProviders`.
- Observações: estilização dupla MUI+Tailwind; 3 componentes >500 linhas com fetch embutido; **nenhum teste de componente React**.

### 3.4 Estado e dados
- Contextos: `CurrentUserProvider` (refaz `/api/auth/me` a cada troca de rota e **monkey-patcha `window.fetch`** para detectar 401), `TitlePreferenceProvider` (`localStorage`, chave `anime-hub:title-preference`).
- Server Components com Prisma direto: `/minha-lista`, `/anime/[id]`, `/users/[id]`, `/admin`. Client com `fetch` em efeito: `/discover`, `/calendar`, `FeedView`, `NotificationBell`, comentários. Sem SWR/React Query; mutações = `fetch` para `/api/**`; sem `use cache`/`revalidate` explícitos.
- `router.refresh()`: `FavoriteToggle`, `ProgressEditor`, `AvatarUploader` **(WT)**, `InlineEditField` **(WT, agora em `startTransition` com timeout de 8 s)**, login/signup/logout.

### 3.5 Título, idioma e tempo
- `titlePreference.tsx:29-32`: padrão `{ language: "en", japaneseScript: "romaji" }`; resolução PT→EN→romaji, EN→romaji, JP+kanji→native‖romaji, JP+romaji/furigana→romaji. **Nenhum campo/lógica de kana.** Preferência só em `localStorage`.
- Fuso: tudo no fuso do navegador (`toLocaleTimeString("pt-BR")` sem `timeZone`); `grep "America/Sao_Paulo|timeZone"` em `src`, `services`, `scripts` = **0**; servidor em UTC (sem `TZ`).
- Calendário: `buildWeekDays` (domingo 00:00 local → sábado), `MAX_WEEK_OFFSET = 8`; o cliente envia `weekStart`; "NO AR" = −5/+30 min.

### 3.6 Tokens e tema
`muiTheme.ts` (`palette.mode: "dark"`; primary `#e4002b`; secondary `#ffd400`; fundo `#0b0b0d`; paper `#18171c`; divider `#2c2b31`; `shape.borderRadius: 6`), `globals.css` (variáveis CSS duplicadas), fontes: Inter, **Anton** (display), Noto Sans JP (`.font-jp`). Comparação com o Figma em `FIGMA_POC_TRACEABILITY.md` (TR-120…TR-128).

### 3.7 Estados, acessibilidade e responsividade
- Estados: `Skeleton` só em Descobrir, Header e `AnimeInfoModal`; `Alert` do MUI para vários erros; vazio/loading em texto; erro de fetch do Feed vira "Nenhum post ainda"; 404 genérico também para "proibido".
- A11y: `aria-current`, `aria-haspopup/controls/expanded`, Menu/Dialog/Popover do MUI (foco preso e restaurado), hero com pausa e `prefers-reduced-motion`; foco global só em `ButtonBase` (anel amarelo `#ffd400`); preview do calendário só por hover.
- Responsivo: breakpoints MUI padrão + `1240 px`; testes mobile existem (`tests/16`, `tests/20`).

## 4. Backend

### 4.1 Módulos e responsabilidades
- **Route handlers** (`src/app/api/**`, 50 `route.ts`): BFF; validação manual (sem Zod); erros `{ error: string }`; sem versionamento; sem rate limit.
- **`src/lib`**: fontes externas (`anilist.ts`, `kitsu.ts`, `jikan.ts`, `shikimori.ts`, `anidb.ts`), identidade/matching (`identityResolution.ts`, `series.ts`, `genreTaxonomy.ts`), caches (`catalogCache.ts`, `airingCache.ts`, `seasonalCatalog.ts`, `searchAnimeCatalog.ts`), DTOs (`postDto.ts`, `postFeedDto.ts`, `calendarItem.ts`, `discoverItem.ts`), feed (`feedRanking.ts`, `feedRecommended.ts`), upload (`processImageUpload.ts` **(WT)**, `uploadValidation.ts`, `uploadStorage.ts`), sessão (`auth/session.ts`, `auth/password.ts`), `airingWindow.ts`, `text.ts`, `url.ts`.
- **Microsserviços** (`services/*`): ver §4.4.

### 4.2 API (50 arquivos `route.ts`, agrupados por domínio)
Legenda de auth: **ANON** sem sessão · **OPT** sessão opcional · **USER** `requireUser` · **ADMIN** `requireAdmin` · **own** posse com 404 uniforme.

| Domínio | Rotas (métodos) | Auth |
| --- | --- | --- |
| Auth | `auth/signup` (POST), `auth/login` (POST), `auth/logout` (POST), `auth/me` (GET) | ANON; `me` OPT |
| Calendário/catálogo | `calendar` (GET), `catalog` (GET, **sem paginação**), `catalog/ranking` (GET), `anilist/search` (GET), `anilist/season` (GET, sem validar `season`/`year`) | ANON/OPT |
| Lista pessoal | `anime` (GET/POST), `anime/[id]` (GET/DELETE), `anime/[id]/progress` (PATCH), `…/favorite` (PATCH), `…/title`, `…/description`, `…/anidb`, `…/series` (PATCH), `…/platform-links` (POST/DELETE), `…/refresh` (POST) | USER + own |
| Comentários por obra | `anime/[id]/comments` (GET/POST), `comments/[commentId]` (DELETE), `comments/[commentId]/report` (POST) | USER (exige ter a obra) |
| Feed/posts | `posts` (GET), `posts/[postId]` (DELETE), `…/like`, `…/repost` (PATCH), `…/report` (POST), `…/comments` (GET/POST), `…/comments/[commentId]` (DELETE), `anime/[id]/posts` (POST), `feed/trending-posts`, `feed/recommendations`, `anime-threads/trending` | mista |
| Usuários | `users/[id]` (GET), `users/[id]/posts` (GET), `users/[id]/follow` (PATCH), `users/suggestions` (GET), **`users/me` (PATCH) (WT)**, **`users/me/avatar` (POST/DELETE) (WT)** | ANON/OPT/USER |
| Upload | `uploads` (POST), `uploads/[...path]` (GET público, cache imutável 1 ano) | USER / ANON |
| Notificações | `notifications` (GET), `notifications/[id]/seen` (POST) | USER + own |
| Admin | `admin/invites` (GET/POST), `admin/users` (GET), `admin/users/[id]/reset-password` (POST), `admin/comment-reports` (+`resolve`), `admin/post-reports` (+`resolve`) | ADMIN |

Matriz completa por rota (50 linhas, com ownership, dados e observações): ver o relatório de segurança resumido em `DOMAIN_AND_ARCHITECTURE_GAPS.md` §3/§5 (GAP-S) e `TR-131`.

### 4.3 Regras de negócio relevantes (observadas)
- **Cadastro:** só por convite (uso único atômico, TTL 7 dias); a primeira conta do sistema vira ADMIN **sem convite** e herda `Anime` órfãos.
- **Lista:** adicionar cria `Anime` (por usuário) + `WatchProgress(PLAN_TO_WATCH, 0)`; `episodeProgress>0` infere WATCHING; "Finalizado" leva o contador ao último episódio.
- **Feed:** "Recomendado" = `(likes+1)/(horas+2)^1.5` sobre os 300 mais recentes; "Seguindo" cronológico por cursor; repost/citação de 1 nível; postar exige ter a obra na própria lista; limites: post 500, resposta/comentário 2000, bio 300, 6 imagens, upload 8 MB.
- **Moderação:** denúncia idempotente (reabre); admin decide manter/remover (soft delete) em `$transaction`.
- **Notificação:** `AiringAlert` por (usuário, anilistId, episódio) para toda obra da lista; janela −30/+5 min; retenção 7 dias; reagendamento >10 min reabre `seenAt`.

### 4.4 Serviços, agendamento e processamento assíncrono

| Serviço | Responsabilidade | Agenda | Escreve | Health |
| --- | --- | --- | --- | --- |
| `calendar-loader` | Baixa a agenda da AniList e faz `upsert` em `AiringScheduleEntry` | 30 min + no boot | `AiringScheduleEntry` | `GET /health` → 200 **estático** |
| `notifier` | Junta agenda × `Anime` e grava `AiringAlert` | 2 min | `AiringAlert` | `GET /health` |
| `cache-updater` | API interna sob demanda (`/search`, `/season`, `/resolve-anime`, `/ensure-episodes`, `/refresh-anime`), **sem autenticação**, porta não publicada | on-demand | `CatalogEntry`, `Anime`, `Episode` | `GET /health` |
| `name-resolver` | Funções puras (`/resolve-identity`, `/furigana`) — majoritariamente sem chamador | on-demand | nada | `GET /health` |
| `web` | Next BFF + UI (porta 3000 em todas as interfaces) | — | tudo | **sem healthcheck** |

`docker ps` (leitura, 2026-10-08): `postgres`, `calendar-loader`, `cache-updater`, `name-resolver`, `notifier` saudáveis; `web` Up sem healthcheck; o job `migrate` já concluiu.

### 4.5 Falhas, logs e observabilidade
`console.log/error` apenas (sem estrutura, níveis, correlação ou métricas); `try/catch` por rodada nos loops; sem backoff; respostas 500 genéricas em produção; **nenhuma trilha de auditoria** de ações administrativas.

## 5. Dados

### 5.1 Modelos (schema real: 17 modelos)

| Modelo | Papel | Observação |
| --- | --- | --- |
| `User` | Conta (`role` string "ADMIN"/"MEMBER"; `avatarUrl`; **`bio` (WT)**) | e-mail único; índice redundante |
| `Invite`, `Session` | Convite e sessão (token em claro, TTL 30 dias) | sessões expiradas nunca purgadas |
| `Anime` | **Linha por usuário**: metadados + overrides (`titlePortuguese`, `descriptionPortuguese`, `anidbId`, `seriesKey`, `seasonNumber`) + estado pessoal | `@@unique([userId, anilistId])` |
| `Episode`, `PlatformLink` | Metadado de episódio (Kitsu/AniDB) e links manuais, por `Anime` | cascade |
| `WatchProgress` | status, `episodeProgress`, `score`, `notes`, `startedAt`, `completedAt` | **conflita com o requisito** (D-02) |
| `Comment`, `CommentReport` | Thread por `anilistId` + denúncia | soft delete |
| `CatalogEntry` | Cache global do Descobrir | sem retention |
| `AiringScheduleEntry` | Cache global da agenda (+ `description` **(WT)**) | sem FK; nunca apaga |
| `AiringAlert` | Alerta "no ar agora" | purga >7 dias |
| `Post`, `PostLike`, `PostComment`, `PostReport`, `Follow` | Camada social | `anilistId` solto; sem `Block`, sem spoiler, sem hashtag |

**15 migrations** (`_prisma_migrations` count = 15 no banco; as duas últimas — `20260922120000_add_user_bio` e `20260922130000_add_airing_schedule_description` — são **(WT)**; segundo o investigador de backend, `_prisma_migrations` mostra as últimas aplicadas em 2026-10-08 15:49 UTC, ou seja, o banco dev já tem as duas colunas novas mesmo sem commit).

### 5.2 Dados simulados, seeds e fixtures
- `tests/fixtures/animes.ts` + `tests/global-setup.ts` (usuários `e2e@test.local` MEMBER e `e2e-admin@test.local` ADMIN, sessões fixas de 1 ano em `tests/test-auth.ts`).
- `scripts/seed-community.cjs`: 10 contas `demoN@animehub.local` com hash fictício, posts/curtidas/comentários/follows **e progresso/nota aleatórios**; começa apagando as contas por e-mail; sem guarda de ambiente.
- `scripts/seed-catalog-cache.cjs`: popula `CatalogEntry` via Kitsu.
- `scripts/clear-cache.cjs`: **destrutivo** (`deleteMany` + `updateMany` sem `where` em todas as linhas `Anime`).
- Estado observado do banco dev em 2026-10-08 (SELECT; só `AiringScheduleEntry` foi reconferida por mim): `User=0`, `Anime=0`, `CatalogEntry=24`, `AiringScheduleEntry=346`, `WatchProgress=0`, `Episode=0`, `AiringAlert=0` → **sem usuários nem comunidade para validar fluxos ponta a ponta**.

## 6. Autenticação e autorização (resumo)
Sem `middleware`/`proxy`: todo gate fica no handler/página. Sessão: token 256 bits, cookie `session_token` httpOnly + `SameSite=Lax` (+ `Secure` em produção), TTL 30 dias; senha: scrypt (defaults do Node), `timingSafeEqual`, dummy hash no login. Ownership 404 uniforme em todos os sub-recursos de `Anime`; sem mass-assignment; nenhuma rota altera `role`. Ausentes: rate limit, redefinição de senha pelo usuário, verificação de e-mail, CSP/headers. Detalhes e achados: `DOMAIN_AND_ARCHITECTURE_GAPS.md` (GAP-S).

## 7. Integrações externas
AniList (GraphQL: busca, temporada, detalhe, agenda), Kitsu (REST JSON:API), Jikan/MAL (REST), Shikimori (REST, nunca testado ao vivo), AniDB (XML por HTTP puro, só com `anidbId` vinculado manualmente). **Nenhum scraping** (grep só acha comentários que dizem "não é scraping"). Sem timeout/retry/429 em nenhuma; degradação para `CatalogEntry` quando a AniList cai.

## 8. Importação e scraping
Não há UI de importação. Ingestão = (a) `calendar-loader` automático, (b) escrita de cache como efeito de buscas e do `cache-updater`, (c) `refreshAnimeData` por linha de usuário, (d) scripts CLI. Matching por título (1º resultado) sem score, fila ou confirmação.

## 9. Tratamento de erros
Padrão `{ error }` consistente; `request.json()` sem `try/catch` em 4 rotas (`title`, `description`, `series`, `users/me` **(WT)**) → 500; falha de fetch do Feed é silenciosa; `refresh` devolve 200 mesmo com fontes "failed"; sem `error.tsx`.

## 10. Testes

| Tipo | Quantidade | Como roda | Observação |
| --- | --- | --- | --- |
| Vitest (`src/**/*.test.ts`) | **18 arquivos / 168 testes** — executado nesta auditoria: **todos passam** | `npm run test:unit` | só `src/lib` (parsers, regras puras, senha, upload) |
| Playwright (`tests/*.spec.ts`) | **45 specs**, ≈214 `test(` (contagem por grep; parametrizações podem somar) — **não executado** | `npm test` (1 worker, 1 projeto chromium desktop) | `global-setup` faz `DROP SCHEMA public CASCADE` no banco `animehub_test` (URL fixa), roda `prisma migrate deploy`, `next build` e `next start --port 3100` |
| Tipagem | `npx tsc --noEmit`: **0 erros** | — | — |
| Lint | `npm run lint`: **6 erros + 1 aviso**, todos preexistentes (`no-require-imports` em 3 `scripts/*.cjs`; variável não usada em `tests/30…`) | — | `src/` limpo |
| CI | **Ausente** | — | sem `.github/` |

Mapa de cobertura por épico e lacunas: `VALIDATION_PLAN.md` e `DOMAIN_AND_ARCHITECTURE_GAPS.md` (GAP-Q).

## 11. Configuração e execução local

| Item | Realidade |
| --- | --- |
| `README.md` | Boilerplate do `create-next-app` — **não** descreve Docker, Postgres, variáveis, migrações, seeds, testes, serviços, papéis nem o primeiro admin |
| Scripts | `dev`, `build`, `start`, `lint`, `test`, `test:external`, `test:ui`, `test:unit`, `test:unit:watch`, `seed:catalog`, `seed:community` (sem `typecheck`, sem scripts `prisma`) |
| Compose | `postgres` (healthcheck, volume, `init-test-db.sh` cria `animehub_test`), `migrate` (job), `web` (:3000, volume de uploads), `calendar-loader` (:4001), `name-resolver` (:4002), `cache-updater` (:4003), `notifier` (:4004) |
| Variáveis | `.env.example` (nomes): `POSTGRES_USER/PASSWORD/DB`, `ANIME_HUB_DATABASE_URL`, `KITSU_API_BASE_URL` (+ comentadas `JIKAN_API_BASE_URL`, `SHIKIMORI_API_BASE_URL`, `ANIDB_CLIENT_NAME/VERSION`, `DISABLE_OTHER_SOURCES`). Usadas e ausentes do exemplo: `CACHE_UPDATER_URL`, `NAME_RESOLVER_URL`, `NEXT_STANDALONE`, `PORT`, `HOSTNAME`. `.env` não é rastreado |
| Rodar do zero (reconstruído do código) | `.env` ← `.env.example` → `docker compose up -d postgres` → `prisma migrate deploy` (ou o job `migrate`) → `npm install` → opcional `seed:catalog`/`seed:community` → `npm run dev` → criar a 1ª conta em `/signup` (vira ADMIN) |

## 12. Limitações técnicas evidentes
Lista resumida (detalhe, evidência e prioridade em `DOMAIN_AND_ARCHITECTURE_GAPS.md`): calendário atual vazio por janela/paginação do loader (**verificado ao vivo**); `Anime` por usuário sem entidade de obra/franquia/temporada; tracker de consumo; linhas de agenda nunca reconciliadas; datas parciais inventadas; ausência de fuso padrão; ausência de rate limit; HTML sem sanitização e sem CSP; serviços internos sem autenticação; health estático; scripts destrutivos sem guarda; README e CI ausentes.

## 13. Estado do working tree (o que NÃO está no commit `e86c04d`)

Modificados: `prisma/schema.prisma`, `src/app/api/anime/[id]/posts/route.ts`, `src/app/api/uploads/route.ts`, `src/app/users/[id]/page.tsx`, `src/components/{AccountMenu, AnidbIdEditor, CalendarEntryPreview, DescriptionEditor, InlineEditField, PostCard, ProfileHeader, SeriesGroupEditor, TitleEditor}.tsx`, `src/lib/{airingCache, anilist, avatarColor, calendarItem, postDto, postFeedDto, uploadImage}.ts`.
Novos (não rastreados): `prisma/migrations/20260922120000_add_user_bio/`, `prisma/migrations/20260922130000_add_airing_schedule_description/`, `src/app/api/users/me/`, `src/components/{AvatarUploader, BioEditor, UserAvatar}.tsx`, `src/lib/processImageUpload.ts`, **`docs/audit-figma-poc/`**.
Correspondem aos Epics 28 (avatar/bio), 29 (sinopse de lançamentos fora da lista) e ao ajuste de `InlineEditField` (espera o `router.refresh()` assentar). **Sem testes e2e/unit** para essas mudanças.

## 14. Não verificado
Dependências circulares (nenhuma ferramenta de análise rodada); efeito real de `next:{revalidate}` em Next 16 fora do Next; origem dos erros "Server Reference ID did not match" nos logs do `web`; usuário root em todos os containers de serviço; comportamento de `avatarUrl`/`imageUrls` (URL absoluta com origin da requisição) atrás de proxy; qualquer fluxo em navegador (nenhum foi executado); corrida de `upsert` (like/follow/repost) sob concorrência real.

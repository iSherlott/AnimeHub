# VALIDATION_PLAN — Plano de validação antes da implementação (rev.2)

> Auditoria de 2026-10-08, **revisão 2** (Figma completo inspecionado: os critérios abaixo agora citam nós reais e há testes de aceite por fluxo do Figma — §3.1). **Nenhum teste "Proposto" abaixo foi executado nem declarado aprovado.** O que de fato rodou
> nesta auditoria está em §1. Requisitos referenciados estão em `FUNCTIONAL_SPEC.md`; lacunas de teste em
> `DOMAIN_AND_ARCHITECTURE_GAPS.md` (GAP-Q-xx). "Existente" = arquivo real no repositório; "Proposto" = a criar.

## 1. O que foi executado nesta auditoria (e o que não foi)

| Verificação | Resultado | Como |
| --- | --- | --- |
| `npm run test:unit` (Vitest) | **18 arquivos / 168 testes, todos passam** | executado pelos investigadores de frontend, social e segurança nesta auditoria; resultado idêntico ao que obtive antes na mesma sessão |
| `npx tsc --noEmit` | **0 erros** | executado pelo investigador de segurança/testes (e por mim antes, na mesma sessão) |
| `npm run lint` | **6 erros + 1 aviso, todos preexistentes** (`no-require-imports` em `scripts/{clear-cache,seed-catalog-cache,seed-community}.cjs`; variável não usada em `tests/30-…`) | executado |
| Consulta read-only da agenda | `AiringScheduleEntry`: 346 linhas, `min=2026-08-13`, `max=2026-09-09`; por semana `08-10:53 · 08-17:92 · 08-24:87 · 08-31:94 · 09-07:20 · depois: 0` | `SELECT` via `docker exec … psql` |
| `GET /api/calendar?weekOffset=0` | `{"results":[]}`; `weekOffset=-5` devolve episódios de 29/08 | `curl` na porta 3000 |
| `docker ps` | 6 containers Up; 4 serviços "healthy"; `web` sem healthcheck | leitura |
| **Playwright (45 specs, ≈214 `test(`)** | **NÃO executado** | `tests/global-setup.ts` faz `DROP SCHEMA public CASCADE` no banco `animehub_test` (URL fixa), roda `prisma migrate deploy`, `next build` e `next start --port 3100`: considerado mutante para uma etapa que proíbe alterar dados/serviços. Também conflita com um `next dev` aberto (`.next/`) |
| Fluxos em navegador | **NÃO executados** | o banco dev tem `User=0`/`Anime=0`; criar contas ou sessões seria escrita. (O Figma foi lido por inspeção de nós e capturas, não por interação — os frames são estáticos.) |

## 2. Pré-requisitos e riscos para executar a validação depois

1. **Isolar o banco de teste:** a suíte só toca `animehub_test`; confirmar que o volume do Postgres tem esse banco (criado por `docker/init-test-db.sh` apenas na 1ª inicialização do volume — volume antigo sem ele quebra o setup).
2. **Porta 3100 livre** e nenhum `next dev` usando `.next/` (a suíte roda `next build`).
3. **Seed realista:** o banco dev está sem usuários; para validar fluxos sociais e a lista é preciso um seed controlado (`seed:community` é destrutivo para as contas `demoN@animehub.local` e deve rodar só em ambiente descartável).
4. **Dados de "hoje":** os E2E do calendário semeiam a agenda manualmente (`tests/43…:41-44`); a validação do loader precisa de um teste que use a janela real (GAP-Q-06).
5. **Working tree não commitado (WT):** Epics 28/29 e `InlineEditField` não têm testes; validar antes de commitar.
6. **Versões:** Node local 24 × imagens 20; rodar o pipeline na versão das imagens.

## 3. Testes funcionais (propostos, por requisito)

| ID | Cenário | Requisito | Tipo | Resultado esperado | Estado |
| --- | --- | --- | --- | --- | --- |
| VT-F-01 | Busca sem login por "naruto" | CAT-001 | E2E | Resultados exibidos; com AniList simulada fora, resultados em cache + aviso | Existente (36) + Proposto (queda simulada) |
| VT-F-02 | Filtro de ano com data parcial ("2026") em fusos America/Sao_Paulo, UTC, Asia/Tokyo | CAT-002 | Unit + E2E | Aparece no filtro 2026 em todos; nenhuma data completada com 01 | Proposto |
| VT-F-03 | Visitante abre o detalhe público de uma obra | CAT-003 | E2E | 200 com título, sinopse, próximo episódio e discussões; botão "Acompanhar" | Proposto (hoje o teste `05` fixa 404) |
| VT-F-04 | Calendário da semana corrente com loader saudável | CAL-001 | Integração | Episódios da semana; "hoje" na primeira dobra | Proposto |
| VT-F-05 | Horário e fuso do calendário (America/Sao_Paulo, UTC, Asia/Tokyo) | CAL-002 | E2E `timezoneId` | Horário muda conforme o fuso; rótulo visível; horário antes de "EP" | Proposto (GAP-Q-04) |
| VT-F-06 | Item sem horário ("a confirmar") | CAL-003 | E2E | Aparece como "a confirmar" com ícone; nunca com hora inventada | Proposto |
| VT-F-07 | Episódio adiado / removido / renumerado na AniList | CAL-004 | Integração do loader | Calendário reflete o novo estado; sem fantasma | Proposto |
| VT-F-08 | Loader com 600+ itens na janela | CAL-005 | Unit/Integração | Nenhuma truncagem silenciosa; health falha se `max(airingAt)` < hoje | Proposto (GAP-Q-06) |
| VT-F-09 | Acompanhar a partir de Descobrir e achar em Minha Lista e no calendário "Minha lista" | LIST-001 | E2E | Vínculo criado, idempotente | Existente parcial (`11`, `27`) |
| VT-F-10 | Deixar de acompanhar pela UI com confirmação | LIST-001 | E2E | Some de Minha Lista e do calendário | Proposto (hoje só via API) |
| VT-F-11 | Nenhum campo de consumo em UI e DTOs | LIST-004 | E2E + Unit de DTO | Ausentes de tela, API e DTO (se D-02 = remover) | Proposto; **rever** `22`, `25`, `42`, `01` |
| VT-F-12 | Título padrão japonês + kana + inglês; romaji só por preferência | DET-002 | E2E + Unit | Padrão e matriz idioma × campo ausente | Existente parcial (`titlePreference.test.ts`) + Proposto |
| VT-F-13 | Franquia: "Attack on Titan: The Final Season" e "SAO: Alicization" na franquia certa | DET-003 | Unit de `series.ts` / relations | Mesma franquia da obra original | Proposto (GAP-Q-09) |
| VT-F-14 | Cada feed (Para você, Seguindo, Recentes) respeita sua regra e paginação | SOC-002 | E2E + Unit | Ordem e cursor corretos; "Recentes" cronológico | Existente parcial (`feedRanking.test.ts`, `14`, `26`) + Proposto |
| VT-F-15 | Publicar com obra explícita; API sem obra → 400 | POST-001 | E2E + API | Obra obrigatória e validada no servidor | Existente parcial (`14`, `40`) + Proposto |
| VT-F-16 | Responder, paginar respostas, apagar a própria | POST-003/004 | E2E | Contador coerente; resposta a post apagado → 404 | Existente parcial (`28`, `09`) |
| VT-F-17 | Hashtag Unicode (`#Pokémon`, `#ナルト`), clique leva à página da hashtag | HASH-001 | Unit + E2E | Reconhecida e navegável; duplicadas colapsam | Existente parcial (`animeHashtag.test.ts`) + Proposto |
| VT-F-18 | Seguir/deixar de seguir duas vezes seguidas | PROF-002 | E2E | Sem duplicata; contagem coerente após recarregar | Existente (`14`, `17`) |
| VT-F-19 | Bloquear: feeds, respostas, reposts, "Em alta" e notificações filtrados | PROF-003 | E2E + API | Nenhuma superfície mostra conteúdo do bloqueado | Proposto (GAP-Q-11) |
| VT-F-20 | Spoiler: placeholder em feed, perfil, citação, repost, lateral, notificação e prévia; revelar por ação explícita | SPOIL-001 | E2E | Texto não vaza em nenhuma superfície | Proposto (GAP-Q-11) |
| VT-F-21 | Denunciar post, resposta e perfil; admin mantém/remove; duplicata não duplica | MOD-001 | E2E | Fila coerente; decisão registrada | Existente parcial (`09`, `38`) + Proposto |
| VT-F-22 | Conteúdo removido deixa tombstone sem expor texto/imagem/autor | MOD-002 | E2E | Citação/repost/notificação mostram "removido" | Proposto |
| VT-F-23 | Notificação de lançamento: geração, dedupe, reagendamento, clique leva ao detalhe público | NOTIF-001 | Integração do notifier + E2E | Um alerta por (usuário, obra, episódio); reabre se >10 min | Existente parcial (`07`, `27`) + Proposto (GAP-Q-05) |
| VT-F-24 | Notificações sociais (curtida, resposta, seguidor, repost) distintas das de lançamento | NOTIF-002 | E2E | Exatamente uma por evento; sem spoiler no texto | Proposto |
| VT-F-25 | Admin: importar, revisar matching, resolver conflito, auditar, confirmar antes de commit | ADMIN-001…003 | E2E | Nenhuma mudança de dado sem confirmação; trilha registrada | Proposto |
| VT-F-26 | Dashboard "Seu dia": hoje, novos episódios, contadores; erro não vira "0" | CAL-007 | E2E | Lançamentos de hoje em ≤ 2 s; `8:5323`/`8:5448` respeitados | Proposto |
| VT-F-27 | Configurações: formato dos títulos, timezone, notificações; falha mantém valores; "Desativar todo o Social" não afeta Lançamentos | CFG-001 | E2E | Persistência por conta; `8:5448` | Proposto |
| VT-F-28 | Busca na Comunidade: escopos, filtro de anime, vazio com recuperação | SOC-004 | E2E | Query preservada ao trocar escopo | Proposto |
| VT-F-29 | Compositor: Publicar desativado vazio; dedup de envio; falha preserva rascunho; descartar com confirmação | POST-005 | E2E | `13:43375` | Proposto |
| VT-F-30 | Publicar sem anime e com produção explícita; menção/hashtag não associa | POST-001 | E2E + API | `13:41840` | Proposto |
| VT-F-31 | Curtir: toggle, aria-pressed, rollback em falha | POST-007 | E2E | `13:43227`, `13:43963` | Proposto |
| VT-F-32 | Página de hashtag: Recentes; ID canônico; tipos | HASH-002 | E2E | `13:42068` | Proposto |
| VT-F-33 | Página de temporada e filtros Tipo/previsão | CAT-002/004 | E2E | `8:1733`, `8:5720` | Proposto |
| VT-F-34 | Spoiler: o texto não existe no DOM nem na resposta da API antes da ação | SPOIL-001/002 | E2E + API | `13:41155` | Proposto |
| VT-F-35 | Remover acompanhamento: diálogo, foco inicial em Cancelar, efeito explicado | LIST-001 | E2E | `8:5802` | Proposto |

### 3.1 Testes de aceite por fluxo do Figma (14 fluxos; cada um deve virar um spec)

Todos os fluxos do Figma são **estáticos** (interações não conectadas); estes testes são a forma de "conectá-los" com critério verificável. Fichas completas em `UX_FLOW_AUDIT.md`.

| ID | Fluxo (nó) | Caminho a provar | Estados a cobrir | Guardas | Estado |
| --- | --- | --- | --- | --- | --- |
| VT-X-A | Social A (`13:44169`) | Para você → hashtag → publicação → resposta → detalhe da produção | carregando/erro; resposta vazio/digitado/enviando/erro; spoiler oculto | leitura pública; resposta exige login com retorno; hashtag não associa anime | Proposto |
| VT-X-B | Social B (`13:44169`) | Detalhe → "Publicar sobre este anime" → editor pré-selecionado → publicar | vazio; validação; publicando; falha com rascunho; sucesso | login recupera produção e rascunho; sem etapa de revisão obrigatória | Proposto |
| VT-X-C | Social C (`13:44169`) | Explorar → detalhe → Discussões → leitura dedicada → detalhe/Acompanhar | zero discussões; removido; erro | ler é público; Acompanhar exige login e refere-se ao anime | Proposto |
| VT-X-D | Social D (`13:44169`) | Feed → perfil → Seguir → voltar → Seguindo | não seguindo/seguindo/foco/enviando/falha | login com retorno ao perfil; lista não exposta | Proposto |
| VT-X-E | Social E (`13:44298`) | Feed → discussão → responder a comentário → enviar → âncora | vazio/digitado/publicando/sucesso/falha | alvo e rascunho preservados; sem indentação infinita | Proposto |
| VT-X-F | Social F (`13:44298`) | Post protegido → revelar → ocultar novamente | oculto/foco/pressionado/revelado; erro sem texto parcial | clicar/abrir/notificar não revela; revelar um não libera outros | Proposto |
| VT-X-G | Social G (`13:44298`) | Menu → denunciar alvo → motivo → confirmar → feedback | motivo não escolhido; enviando; sucesso; erro | privada; sem selo público; não bloqueia | Proposto |
| VT-X-H | Social H (`13:44298`) | Sino → Social → notificação → discussão → comentário ancorado | lida/não lida; vazio/desativado; destino removido | sem trecho de spoiler; marcar lida após persistência | Proposto |
| VT-X-01 | Protótipo 01 (`8:5876`) | Explorar → busca "Kusuriya" → detalhe → "+ Acompanhar" → login | loading skeleton; erro de busca ≠ vazio | não criar vínculo para visitante; destino e intenção preservados | Proposto |
| VT-X-02 | Protótipo 02 (`8:5982`) | Login → busca → Acompanhar → logo → Dashboard | "Entrando…/Acompanhando…"; credenciais inválidas preservam e-mail | não adicionar anime automaticamente; contador 17 → 18 | Proposto |
| VT-X-03 | Protótipo 03 (`8:6088`) | Dashboard → evento → detalhe; sino → notificação → mesmo detalhe | erro "Não foi possível carregar os lançamentos" | sem player; sem alterar consumo; marcar leitura após persistência | Proposto |
| VT-X-04 | Protótipo 04 (`8:6189`) | Calendário → Minha Lista → evento → detalhe; sem horário; data não definida | loading de 7 faixas; vazio; erro preserva período e filtro | visitante: login mantendo a semana; nunca inventar posição; cancelado inativo | Proposto |
| VT-X-05 | Protótipo 05 (`8:6295`) | Importação → colar HTML → analisar → matching → resolver → confirmar → job | job #185 Running; erro #184 preserva HTML | commit bloqueado com pendências; sem execução de script do HTML | Proposto (depende de D-30) |
| VT-X-06 | Protótipo 06 (`8:6421`) | Conflitos → comparar → escolher/definir → resolver → prévia | resolvendo; falha; conflito de versão | justificativa obrigatória; fonte original preservada | Proposto (depende de D-30) |

## 4. Testes de integração

| ID | Integração | O que provar | Estado |
| --- | --- | --- | --- |
| VT-I-01 | Frontend ↔ backend | DTOs sociais não incluem dado da lista pessoal de outro usuário (varredura automática) | Proposto |
| VT-I-02 | Persistência ↔ regras de domínio | Constraints (like/follow/repost/report/alert) sob concorrência: `P2002` tratado como sucesso idempotente | Proposto |
| VT-I-03 | Feed ↔ relações sociais | "Seguindo" reflete follow/unfollow/bloqueio na mesma sessão | Existente parcial (`14`) |
| VT-I-04 | Publicações ↔ catálogo | Publicação referencia obra canônica; excluir obra do vínculo do usuário não apaga a discussão | Proposto (depende de D-18) |
| VT-I-05 | Notificações ↔ eventos | Eventos de like/resposta/follow geram notificação; remoção do conteúdo gera tombstone | Proposto |
| VT-I-06 | Ingestão ↔ catálogo | Janela do loader alcança o presente; reconciliação remove/marca episódios; matching exige confirmação | Proposto |
| VT-I-07 | Serviços internos | `web` ↔ `cache-updater` com timeout: sem trabalho duplicado concorrente | Proposto |
| VT-I-08 | Upload ↔ ciclo de vida | Troca/remoção de avatar e remoção de post retiram o arquivo; URL independe de `request.url.origin` | Proposto |

## 5. Testes de regressão (o que não pode quebrar)

| Área | Proteção existente | Observação |
| --- | --- | --- |
| Explorar | `36`, `11`, `45`; `anilist.test.ts` (24), `genreTaxonomy.test.ts` | manter |
| Calendário | `43`, `07`, `27`, `37`; `airingWindow.test.ts` (9) | `43` semeia dados — não cobre o loader |
| Minha Lista | `01`, `08`, `05`, `12` | **serão invalidados por D-02** |
| Detalhe do anime | `42`, `25`, `22`, `10`, `18`, `23`, `24`; `titlePreference.test.ts` | `05` fixa o 404 do visitante — muda com D-03 |
| Preferências de título e fuso | `titlePreference.test.ts` (7), `19`; fuso: só `37` ("meia-noite do navegador") | fuso sem teste multi-timezone |
| Autenticação e permissões | `05` (8), `06` (10, inclui corrida de convite), `password.test.ts` (7) | sem expiração de sessão nem login/logout reais |
| Social | `14` (29), `28`, `29`, `30`–`35`, `31`, `38`, `39`, `40`, `41`, `44`; `feedRanking.test.ts`, `animeHashtag.test.ts` | refatorações de feed/hashtag exigem reescrever parte |

**Regra proposta:** nenhuma fatia do roadmap (ver `IMPLEMENTATION_ROADMAP.md`) é aceita sem rodar o conjunto acima + os testes novos da fatia, no banco isolado.

## 6. Acessibilidade (propostos)

| ID | Verificação | Critério (Figma `8:62`) | Estado |
| --- | --- | --- | --- |
| VT-A-01 | Auditoria automatizada (`@axe-core/playwright`) nas 9 rotas | Sem violações AA | Proposto (GAP-Q-07) |
| VT-A-02 | Navegação completa por teclado (menu, filtros, calendário, preview, diálogos) | Foco visível; ordem de Tab do Figma (header → busca → abas → autoria → texto/contexto → hashtags → reações → próximo post: `13:43375`); escape + retorno ao invocador | Proposto |
| VT-A-03 | Alvos de ação ≥ 44 px | Medir via Playwright | Proposto |
| VT-A-04 | Todo estado (vazio, carregando, erro, proibido, removido) tem texto **e** ícone | Inspeção por tela | Proposto |
| VT-A-05 | Contraste do tema (PoC: `#e4002b` como texto 4,06:1) | ≥ 4,5:1 para texto normal | Proposto |
| VT-A-06 | Landmarks (`header` fora de `main`), skip-link, `lang="ja"` em conteúdo japonês | WCAG 1.3.1/3.1.2 | Proposto |
| VT-A-07 | Preview do calendário operável por teclado/leitor | Conteúdo e ação acessíveis sem hover | Proposto |
| VT-A-08 | `aria-pressed` na curtida; `aria-expanded` no spoiler; live region **sem** anunciar texto protegido | `13:43375` | Proposto |
| VT-A-09 | Modais: `role=dialog`, `aria-modal`, trap, Esc cancela, scrim não confirma, foco inicial em Cancelar | `8:5720`, `8:5802` | Proposto |
| VT-A-10 | Skeleton com `aria-busy` e sem animação; erro de conexão nunca vira "0"/vazio | `8:5323`, `8:5448` | Proposto |

## 7. Segurança e privacidade (propostos)

| ID | Verificação | Estado |
| --- | --- | --- |
| VT-S-01 | Matriz de autorização parametrizada (anônimo, membro dono, membro alheio, admin) para as 50 rotas | Proposto (GAP-Q-02) |
| VT-S-02 | Rate limit em login/cadastro/refresh/busca/upload/denúncia | Proposto (depende de D-22) |
| VT-S-03 | Cadastro com resposta neutra (sem enumeração) e limites de tamanho | Proposto |
| VT-S-04 | Admin inicial por CLI/variável; signup concorrente não cria 2 admins | Proposto (D-21) |
| VT-S-05 | Sanitização das 5 superfícies com HTML (`<img onerror>` na sinopse não executa) | Proposto |
| VT-S-06 | `Origin`/CSRF e cabeçalhos (CSP, `X-Content-Type-Options`, `Referrer-Policy`) | Proposto |
| VT-S-07 | Upload: traversal em `GET /api/uploads/..`, chunked sem `Content-Length`, bomba de pixels, arquivo removido | Proposto |
| VT-S-08 | Nenhum DTO/rota devolve e-mail, papel, hash, progresso ou lista de outro usuário | Proposto (VT-I-01) |
| VT-S-09 | Expiração de sessão e purga | Proposto (GAP-Q-03) |

## 8. Testes de UX (tarefas observáveis; não declarar aprovados sem executar)

Com 5–8 pessoas, protótipo/PoC no estado definido, medindo sucesso, tempo e erros. Metas do Figma: **≤ 2 s** para "o que sai hoje?" no dashboard e **≤ 10 s** para encontrar e acompanhar um anime após autenticação ("metas, não resultados" — `8:18`).

| ID | Tarefa | Medida | Critério de sucesso |
| --- | --- | --- | --- |
| VT-U-01 | "Descubra o que sai hoje." | tempo até a resposta | ≤ 2 s na primeira dobra do Dashboard (CAL-007) |
| VT-U-02 | "Encontre *<obra>* e passe a acompanhá-la." (já autenticado) | tempo/cliques | ≤ 10 s, sem ajuda |
| VT-U-03 | Visitante tenta acompanhar uma obra | retorno após login | Volta ao mesmo ponto com a obra acompanhada |
| VT-U-04 | "Encontre a discussão sobre *<obra>*." | taxa de sucesso | Chega à discussão sem acompanhar a obra |
| VT-U-05 | "Publique uma opinião sobre *<obra>/<temporada>*." | compreensão da associação | Explica a que obra/temporada o post pertence |
| VT-U-06 | "Siga uma pessoa e acompanhe uma obra: o que mudou em cada um?" | distinção | Distingue seguir de acompanhar |
| VT-U-07 | "Leia esta publicação marcada como spoiler." | reconhecimento e ação | Reconhece o spoiler e revela deliberadamente; não vaza antes |
| VT-U-08 | "Veja quando sai o próximo episódio e a que horas, no seu fuso." | passos | Responde sem abrir várias telas |
| VT-U-09 | "Denuncie esta resposta." | sucesso | Encontra e conclui a denúncia |
| VT-U-10 | "Ache a discussão de uma hashtag e chegue à obra." (fluxo A) | passos / perda de contexto | Chega ao detalhe da produção e volta ao ponto de origem |
| VT-U-11 | "Veja a notificação de resposta e chegue ao comentário." (fluxo H) | sucesso | Abre a discussão ancorada sem ver spoiler |
| VT-U-12 | "Configure seu fuso e formato de título." | sucesso | Altera e vê o efeito no calendário |


> O Figma (`13:41178`, "Aceitação factual e hipóteses de teste") lista as medições previstas: tempo de descoberta de discussão e sucesso por hashtag; publicação iniciada/concluída, erro e abandono; reconhecimento de contexto e spoiler; sucesso ao responder; passos de navegação e perda de contexto; teclado, contraste e distinção seguir/acompanhar. São **hipóteses, não resultados**.

## 9. Mapa de cobertura atual por épico (testes existentes)

| Épico | Playwright (`tests/`) | Vitest (`src/lib`) | Lacunas relevantes |
| --- | --- | --- | --- |
| E1 | `36`, `11`, `45` | `anilist`, `genreTaxonomy` | queda da AniList; data parcial |
| E2 | `43`, `07`, `27`, `37` | `airingWindow` | loader, fuso, "hoje" real |
| E3 | `01`, `08`, `05`, `12` | — | remover pela UI; destino pós-login |
| E4 | `42`, `25`, `22`, `10`, `18`, `23`, `24` | `titlePreference`, `episodes` | `series.ts`; spoiler de episódio |
| E5–E7 | `14`, `28`, `29`, `30`–`35`, `31`, `26`, `37`, `39`–`41`, `44` | `feedRanking`, `animeHashtag`, `uploadValidation` | "Recentes", hashtag Unicode, descoberta |
| E8 | `14`, `17` | — | bloqueio; avatar/bio (WT) |
| E9 | `09`, `38` | — | spoiler; denúncia de resposta/perfil; tombstone |
| E10 | `07`, `27` | `airingWindow` | sociais; dedupe do notifier |
| E11 | `06`, `16`, `20` | `identityResolution`, `refreshAnimeData` | importar, matching, conflitos, auditoria |
| E12 | `13`, `15`, `16`, `17`, `20`, `37` | — | axe; alvos 44 px; mobile |
| E13 | `05`, `06` | `password` | IDOR amplo, expiração, rate limit |

## 10. Critério de aceite desta etapa

O plano está **definido**, não **cumprido**. Nenhum item de §3–§8 marcado "Proposto" foi executado. A validação só começa depois das decisões D-02, D-03 e D-18 (`OPEN_DECISIONS.md`; D-01 foi resolvida na rev.2), porque elas mudam quais testes existentes continuam válidos; os testes `VT-X-05/06` dependem também de D-30.

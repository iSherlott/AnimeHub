# UX_FLOW_AUDIT — Fluxos, destinos, estados, retornos e lacunas de prototipagem (rev.2)

> Auditoria de 2026-10-08, **revisão 2**. Fontes: Figma completo (páginas 12 "Prototypes" e 17 "Social Flows", mais as telas de
> cada passo; ver `FIGMA_INVENTORY.md`), PoC (repositório, HEAD `e86c04d` + working tree não commitado) e requisitos do produto.
> **Correção em relação à rev.1:** a rev.1 não encontrou nenhum fluxo no Figma (conclusão errada, causada pelo conector). Agora
> os **14 fluxos do Figma** (8 sociais A–H em `13:44169` e `13:44298`; 6 protótipos 01–06 em `8:5876…8:6421`) foram lidos e
> usados como referência; os 10 fluxos que a rev.1 usava como "proxy" foram substituídos por eles (ver §0.1).
> **Nenhum fluxo foi executado em navegador nesta auditoria** (o banco dev está sem usuários e a suíte Playwright derruba o
> schema do banco de teste; ver `VALIDATION_PLAN.md`). A "situação na PoC" vem de leitura do código, citada por
> `arquivo:linha`, e dos testes que fixam o comportamento; as exceções verificadas ao vivo estão marcadas.

## 0. Como ler

- **Situação no Figma:** os 14 fluxos são **especificação estática, não conectada** — os próprios frames dizem
  "Especificação estática — interações não conectadas" (`13:44169`, `13:44298`) e "Especificação de fluxo — interações a conectar…
  Não existem links de protótipo, navegação real, handlers ou animações nesta entrega" (páginas 12). Logo, "Documentado, mas não
  conectado" descreve **todos** os fluxos do Figma; a coluna decisiva é a **situação na PoC**.
- **Situação na PoC** (classes): **Completo e conectado** · **Parcialmente conectado** · **Ausente** · **Não verificável**.
  "Documentado mas não conectado" é a situação do Figma, não da PoC.
- Cada ficha traz: origem → passos (cadeia do Figma) → destino → guardas/permissões ("ACESSO / INTENÇÃO") → estados →
  retorno ("VOLTAR / CONTEXTO") → situação PoC (evidência) → prioridade → critérios de teste.
- **Denominador: 18 fluxos** = 14 do Figma + 4 fluxos que existem na PoC/telas mas não são cadeia nomeada do Figma (FL-15…FL-18).

### 0.1 O que mudou desde a rev.1 (fluxos)

| Rev.1 (proxy do roteiro) | Rev.2 (fluxo real do Figma) |
| --- | --- |
| FL-01 Descobrir discussão por hashtag | FL-01 = Social **A** |
| FL-02 Publicar a partir do detalhe | FL-02 = Social **B** |
| FL-03 Ler opiniões antes de acompanhar | FL-03 = Social **C** |
| FL-04 Seguir perfil | FL-04 = Social **D** |
| FL-05 Responder | FL-05 = Social **E** |
| FL-06 Revelar spoiler | FL-06 = Social **F** |
| FL-07 Denunciar | FL-07 = Social **G** |
| FL-08 Abrir notificação social | FL-08 = Social **H** |
| FL-09 Acompanhar e achar na lista | FL-09/FL-10 = Protótipos **01** e **02** |
| FL-10 Consultar lançamento | FL-12 = Protótipo **04** (e FL-11 = **03**) |
| FL-14/FL-15 admin (moderar/importar) | FL-17 (moderar) e FL-13/FL-14 = Protótipos **05**/**06** |

## 1. Fluxos sociais do Figma (A–H, página 17)

### FL-01 — Social A: Descobrir uma conversa e chegar à obra  (`13:44169`)
- **Cadeia do Figma:** Comunidade (Para você) → Hashtag → Publicação → Resposta → Anime (detalhe da produção, com Explorar ativo).
- **Guardas:** leitura pública; enviar resposta exige autenticação com retorno à publicação e ao comentário correto; hashtag não cria associação de anime.
- **Estados:** hashtag Recentes / Em alta; discussão carregando/erro; resposta vazio/digitado/enviando/erro; spoilers continuam ocultos.
- **Retorno:** detalhe → discussão no mesmo ponto; discussão → hashtag com ordenação e scroll; hashtag → feed com aba/query/filtros.
- **Situação PoC: Ausente.** Hashtag é só marcador de anime do autor (`animeHashtag.ts:8`, ASCII-only); sem tabela, página nem rota
  de hashtag; `PostCard.tsx:304,316-320` imprime o corpo cru (hashtag e chip do anime **não são clicáveis**); sem página de discussão
  dedicada nem âncora de resposta; o detalhe da obra é privado (404).
- **Prioridade:** P2 (eixo de descoberta social; depende de D-13/D-12 e do detalhe público TR-003).
- **Critérios de teste:** clicar `#AnimeFall2026` abre a hashtag canônica; clicar no texto abre a discussão inteira; o chip da obra abre o detalhe
  da produção; "Voltar" restaura aba/query/scroll; `#animefall2026` e `#AnimeFall2026` resolvem ao mesmo ID; hashtag com acento (`#DireçãoDeArte`) funciona.

### FL-02 — Social B: Publicar a partir de um anime  (`13:44169`)
- **Cadeia:** Detalhe/Discussões → Editor pré-selecionado ("Publicar sobre este anime") → Texto + associação → Hashtag + spoiler → Publicação criada.
- **Guardas:** login para publicar; recuperar produção e rascunho; confirmar a associação é escolha explícita, **não** passo obrigatório de revisão; pode alterar/remover antes de enviar.
- **Estados:** vazio desativa Publicar; erro de validação inline; publicando deduplica; falha retém tudo; sucesso insere uma vez; preview de spoiler oculto.
- **Retorno:** cancelar vazio → detalhe no scroll de Discussões; cancelar digitado → confirmar descarte; sucesso → discussão nova; voltar → origem do anime.
- **Situação PoC: Parcialmente conectado, por outro caminho.** O compositor existe só na home (`FeedView.tsx`); a obra é escolhida pela **#hashtag no texto** (`FeedView.tsx:346`), não por seleção explícita; o detalhe do anime não tem "Publicar" (só `CommentSection`, sistema paralelo `Comment`); exige ter a obra na lista (`anime/[id]/posts/route.ts:34`); sem "Contém spoilers", sem diálogo de descarte, sem deduplicação de envio.
- **Prioridade:** P1.
- **Critérios de teste:** "Publicar sobre este anime" abre o editor com a produção pré-selecionada e removível; clique duplo em Publicar cria 1 post; falha preserva texto, hashtags, associação e spoiler; cancelar com texto pede confirmação.

### FL-03 — Social C: Ler a discussão sem perder o detalhe  (`13:44169`)
- **Cadeia:** Explorar → Detalhe da obra → Discussões → Leitura dedicada → Detalhe / Acompanhar.
- **Guardas:** ler é público; Acompanhar exige login e refere-se ao anime, não ao autor; sem watchprogress ou publicação automática.
- **Estados:** zero discussões mostra convite exato; post removido usa mensagem neutra; carregamento/erro mantêm a obra; spoiler exige ação própria.
- **Retorno:** detalhe → discussão → detalhe restaura produção e âncora; Explorar recupera busca/filtros/scroll.
- **Situação PoC: Ausente.** Visitante e usuário sem a obra recebem **404** em `/anime/[id]` (`anime/[id]/page.tsx:35,43`; `tests/05-auth-gating.spec.ts:52-53`);
  o "detalhe" público é o `AnimeInfoModal` (sem discussões) ou link externo AniList (`CalendarEntryPreview.tsx:23`); a thread `Comment` exige ter o anime (`comments/route.ts:19-26`).
- **Prioridade:** **P0** (bloqueia o loop Descobrir→Acompanhar e o papel Visitante — TR-003).
- **Critérios de teste:** visitante abre o detalhe da produção e vê sinopse, próximo episódio, informações e discussões; "+ Acompanhar" pede login e **retorna**; sem discussões mostra "Esta obra ainda não tem discussões…".

### FL-04 — Social D: Seguir uma pessoa, não acompanhar uma obra  (`13:44169`)
- **Cadeia:** Feed → Perfil público → "+ Seguir perfil" → Voltar ao feed → Seguindo.
- **Guardas:** seguir exige login com retorno ao perfil; Minha Lista não é exposta; seguir usuário não acompanha animes nem copia interesses.
- **Estados:** não seguindo / seguindo / foco / enviando / falha com rollback; perfil bloqueado/indisponível; Seguindo vazio conduz à busca de pessoas.
- **Retorno:** o perfil guarda origem (aba, query, filtros, post, scroll); voltar não troca Para você por Seguindo automaticamente.
- **Situação PoC: Parcialmente conectado (caminho feliz ok).** `PATCH /api/users/[id]/follow` idempotente; `FollowToggle` otimista; aba "Seguindo" lê `Follow`; seguir **não** cria `Anime` (separação respeitada).
  Lacunas: visitante vê botão desabilitado **sem login com destino**; sem rollback anunciado; sem estado vazio de Seguindo; sem perfil bloqueado/indisponível; sem lista de seguidores; estado do feed não preservado ao voltar.
- **Prioridade:** P2.
- **Critérios de teste:** seguir/desseguir 2× não duplica; self-follow rejeitado no servidor; seguir não altera Minha Lista; falha de rede reverte o botão com mensagem; Seguindo vazio mostra "Você ainda não segue perfis".

### FL-05 — Social E: Responder no lugar certo  (`13:44298`)
- **Cadeia:** Feed → Discussão → "Responder" a comentário → Enviar → Âncora da resposta.
- **Guardas:** autenticar antes de enviar preservando alvo e rascunho; um nível visual (provisório); responder a um filho não indenta indefinidamente.
- **Estados:** vazio desativa; digitado ativa; publicando bloqueia duplo clique; sucesso ancora; falha mantém rascunho e destinatário; comentário spoiler permanece oculto.
- **Retorno:** cancelar volta ao comentário com foco; voltar ao feed recupera contexto; original em resumo ancorado durante scroll longo.
- **Situação PoC: Parcialmente conectado.** `PostComment` plano (sem `parentId`/"Em resposta a"), POST exige login, ≤2000, leitura pública sem paginação (`posts/[postId]/comments/route.ts:112-184`); sem página de discussão dedicada, sem âncora, sem denúncia, sem spoiler, sem notificação ao autor.
- **Prioridade:** P1 (denúncia/spoiler da resposta) / P2 (threading, âncora).
- **Critérios de teste:** responder a um comentário cria resposta com "Em resposta a…" no alvo correto; falha mantém texto e destinatário; resposta a post apagado devolve estado neutro.

### FL-06 — Social F: Revelar spoilers somente com intenção  (`13:44298`)
- **Cadeia:** post protegido (obra/produção visíveis) → aviso → "Revelar conteúdo (spoilers)" → Ler/Ocultar novamente.
- **Guardas:** leitura pública, sem exigir assistir; clicar no card, abrir thread ou receber notificação **não** revela.
- **Estados:** oculto → foco → pressionado → revelado; erro de carregamento não mostra texto parcial; ARIA anuncia sem vazar; notificações sem trecho.
- **Retorno:** revelar não navega nem muda o scroll; foco permanece no controle; revelar um comentário não libera outros.
- **Situação PoC: Ausente em 100% das superfícies.** `grep spoiler|oculto|revelar` só acha um comentário em `AdminDashboard.tsx:497`; sem campo em `Post`/`PostComment`/`Comment`; superfícies expostas: corpo/imagens, citação, repost, resposta, lateral "Posts em alta", thread por anime, perfil, `EpisodeGrid`; (WT) preview do calendário exibe sinopse sem controle.
- **Prioridade:** P1 — **gate de release** da camada social (princípio 12). Observação do Figma: prévia de resposta no feed e hashtags ficam fora do bloco (FV-06) — decidir antes de implementar.
- **Critérios de teste:** post marcado chega oculto em feed, perfil, citação, repost, lateral e notificação; o texto **não existe no DOM** antes da ação; revelar é por item e anunciável (`aria-expanded`); "Ocultar novamente" restabelece.

### FL-07 — Social G: Denunciar com retorno discreto  (`13:44298`)
- **Cadeia:** menu do post/comentário → "Denunciar <alvo>" → motivo → confirmar → feedback privado.
- **Guardas:** login mantém alvo e origem; sem dados pessoais; sem divulgar denunciante; não bloqueia automaticamente; Admin recebe revisão mínima.
- **Estados:** motivo não escolhido desativa avanço; enviando deduplica; sucesso discreto; erro com retry; excluir próprio e bloquear usam outros diálogos.
- **Retorno:** cancelar/Esc volta ao menu com foco no invocador; sucesso volta ao mesmo scroll sem selo público.
- **Situação PoC: Parcialmente conectado.** `PostReport` e `CommentReport` com upsert idempotente e fila admin **Manter/Remover**; lacunas: **sem motivo**, sem diálogo de confirmação, `PostComment` e perfil **sem denúncia**, sem aviso ao denunciante, sem tombstone; exclusão de post sem confirmação (`PostCard.tsx:225-231`).
- **Prioridade:** P1.
- **Critérios de teste:** denunciar 2× o mesmo alvo não duplica; os 4 motivos do Figma existem; denúncia de comentário identifica o comentário; autor não vê quem denunciou; Esc devolve o foco.

### FL-08 — Social H: Da notificação à resposta exata  (`13:44298`)
- **Cadeia:** sino único → canal Social → notificação de resposta → discussão correta → comentário ancorado.
- **Guardas:** conta autenticada; respostas e novos seguidores ON, curtidas OFF por padrão; **sem trecho spoiler**, mesmo lida; marcar lida após persistência.
- **Estados:** lida/não lida com texto e símbolo; vazio/desativado; "Social OFF" preserva Lançamentos; destino removido usa estado neutro; erro mantém origem.
- **Retorno:** voltar restaura página origem, scroll e canal; Esc devolve foco ao sino.
- **Situação PoC: Ausente.** Só existe `AiringAlert` ("no ar agora"); não há modelo/rota/gatilho para resposta, curtida ou seguidor; sino sem canais.
- **Prioridade:** P2 (depende de D-11 e do modelo de discussão).
- **Critérios de teste:** responder gera exatamente 1 notificação ao autor; clicar abre a discussão e ancora a resposta; desligar Social não altera Lançamentos; nenhuma notificação traz texto da resposta.

## 2. Protótipos do Figma (página 12) e fluxos de produto

### FL-09 — Protótipo 01: Visitante descobre  (`8:5876`)
- **Cadeia:** Explorar → Busca ("Kusuriya") → Anime → Detalhes → "+ Acompanhar" → Login com destino e intenção preservados.
- **Guardas:** buscar por kanji/kana/romaji/inglês; não duplicar franquia por Season 1/2; "Data desconhecida não recebe placeholder de horário"; **não criar vínculo para visitante**.
- **Meta:** resposta temporal em ≤ 2 s; debounce de 300 ms.
- **Situação PoC: Parcialmente conectado.** Busca em `/discover` funciona (`searchAnimeCatalog.ts`, fallback `CatalogEntry`); resultados por temporada, sem agrupar franquia; **sem detalhe público** (modal limitado); "+ Acompanhar" do visitante faz `router.push("/login")` **sem destino** (`DiscoverCard.tsx:91`); sem debounce documentado.
- **Prioridade:** P0 (detalhe público, TR-003) / P1 (destino pós-login).
- **Critérios de teste:** buscar "Kusuriya" mostra 1 resultado da franquia; abrir mostra títulos JP/kana/EN e próxima previsão; "+ Acompanhar" leva ao login e retorna ao mesmo detalhe **sem** criar o vínculo.

### FL-10 — Protótipo 02: Visitante acompanha  (`8:5982`)
- **Cadeia:** Login → Busca → Acompanhar → Dashboard (via logo).
- **Guardas:** credenciais válidas, **sem adicionar anime automaticamente**; vínculo único por usuário/produção; dashboard final 17 → 18.
- **Meta:** encontrar e acompanhar em ≤ 10 s após autenticar; feedback imediato.
- **Estados:** "Entrando…/Acompanhando…" com botão desabilitado; erro preserva e-mail; falha de follow mantém "+ Acompanhar".
- **Situação PoC: Parcialmente conectado.** Logado, "+" abre popover de plataforma → `POST /api/anime` (409 em duplicata) → "Já está na sua lista — ver" (`api/anime/route.ts:104-106`); problemas: (1) pós-login vai sempre a `/` (`login/page.tsx:41`); (2) vocabulário "Adicionar à lista" (`grep acompanh` = 0); (3) cria `WatchProgress` (consumo) — conflito com P-3; (4) **não existe Dashboard** (o logo leva ao Feed).
- **Prioridade:** P1.
- **Critérios de teste:** após login o usuário volta ao detalhe de origem, o vínculo ainda **não** existe e só é criado ao confirmar "+ Acompanhar"; toast "Anime adicionado à sua lista."; o logo abre o Dashboard com contador atualizado.
- **Ambiguidade do Figma (decisão D-04):** `8:5876` diz "destino e intenção preservados" e `8:5982` diz "não adicionar anime automaticamente" → o retorno restaura a *intenção* (volta ao anime com o botão disponível), mas **não** executa a ação.

### FL-11 — Protótipo 03: Voltar no novo episódio  (`8:6088`)
- **Cadeia (tabela):** Dashboard (HOJE) → evento "NOVO EPISÓDIO" → Detalhe; Sino (popover, contador 2) → notificação → mesmo detalhe → consultar previsão. *(A cadeia resumida do título omite o caminho do sino — FV-16.)*
- **Guardas:** sem player/streaming; somente eventos da lista pessoal; marcar leitura após persistência; deduplicar por evento; **não alterar progresso** ("tracking não existe").
- **Meta:** "o que sai hoje?" em ≤ 2 s; Esc devolve foco ao sino.
- **Situação PoC: Parcialmente conectado.** Sino lista "No ar agora" e abre `/anime/{id}` (`NotificationBell.tsx:233-240`); **sem Dashboard**, sem "Data alterada", sem aviso antecipado; hoje sem dados no presente (TR-011).
- **Prioridade:** P1.
- **Critérios de teste:** o Dashboard destaca o novo episódio; o item do sino abre o mesmo detalhe e reduz o contador sem "assistido"; Esc devolve foco ao sino.

### FL-12 — Protótipo 04: Agenda pessoal  (`8:6189`)
- **Cadeia:** Calendário → "Minha Lista" → Semana 05–11 out → evento → Detalhe; "Sem horário definido" e "Data não definida" levam ao detalhe que explica a ausência.
- **Guardas:** visitante vai ao login **mantendo a semana**; America/Sao_Paulo; eixo 00–22 a cada 2 h; "Nunca inventar posição na grade"; cancelado não aparece como lançamento ativo.
- **Meta:** ≤ 2 s para localizar o horário do dia.
- **Situação PoC: Parcialmente conectado — e hoje quebrado em runtime.**
  - **P0 de dados (verificado ao vivo):** `GET /api/calendar?weekOffset=0` → `{"results":[]}`; `AiringScheduleEntry`: 346 linhas, `max(airingAt)=2026-09-09` com hoje 2026-10-08. Causa: `getAiringSchedule` pagina ascendente desde `now−8 semanas` com teto silencioso `MAX_PAGES=10` e nunca chega ao presente (`anilist.ts:373`; `services/calendar-loader/src/index.ts`); container "healthy" (health estático).
  - Com dado: semana **domingo→sábado** (`calendar/page.tsx:28-38`) vs segunda→domingo; sem régua de horas; "EP n · hh:mm" (episódio antes do horário); fuso do navegador sem rótulo; sem "Horário não definido"/"Data não definida"/"Adiado"/"Cancelado"; preview só por hover; fora da lista abre a AniList.
- **Prioridade:** **P0** (dados), P1 (fuso, ordem, detalhe), P2 (teclado, estados de data).
- **Critérios de teste:** a semana atual lista episódios reais; o loader alerta quando a janela não alcança hoje; o horário bate com o fuso configurado; item sem horário vai ao painel "Sem horário definido", nunca à grade; cancelado nunca aparece como ativo.

### FL-13 — Protótipo 05: Importar com revisão (Admin)  (`8:6295`)
- **Cadeia:** Importação (AniDB/Autumn2026) → Colar HTML → Analisar (Parse→Normalize→Matching→Prévia) → Matching (Confirmar/Outro/Ignorar) → Resolver pendências → Confirmação → Job (Commit→Broadcast→Notification).
- **Guardas:** fonte/temporada obrigatórias; HTML não vazio, sem executar scripts, sem autosave; confirmação bloqueada com pendências; Commit **nunca** antes da confirmação; dupla confirmação bloqueada.
- **Situação PoC: Ausente.** Não há UI/API de importação, prévia, matching, confirmação, jobs ou logs (notes B §5); a ingestão grava direto nas tabelas finais.
- **Prioridade:** P2 (produto Admin separado; depende de **D-30** — política de scraping — e de D-17/D-18).
- **Critérios de teste (propostos):** analisar não grava nada; pendências > 0 bloqueiam "Confirmar importação"; falha preserva o HTML e mostra JobID/fonte/erro/timestamp/parserVersion; retry cria novo job.

### FL-14 — Protótipo 06: Resolver divergência (Admin)  (`8:6421`)
- **Cadeia:** Conflitos (Kusuriya/Broadcast) → Comparar fontes A×B → Usar A/B ou Definir manualmente → Resolver → Voltar à prévia.
- **Guardas:** provenance visível; "não escolher por score sem revisão"; justificativa obrigatória; fonte original preservada; "DATA ALTERADA só é preparada após commit".
- **Situação PoC: Ausente.** Sem modelo de conflito, override global ou trilha; as correções existentes são overrides **por usuário** (`refreshAnimeData.ts:59-80`).
- **Prioridade:** P2 (depende de D-17/D-30).
- **Critérios de teste (propostos):** resolver registra admin, motivo e timestamp; o override não apaga o valor de origem; conflito de versão exige recarregar.

## 3. Fluxos existentes sem cadeia nomeada no Figma

| ID | Fluxo | Situação PoC | Evidência | Prio |
| --- | --- | --- | --- | --- |
| FL-15 | Entrar / cadastrar por convite → primeira sessão | **Completo e conectado** (a 1ª conta vira ADMIN — risco TR-132). O Figma só desenha o login (`8:2371`): **sem cadastro, convite nem recuperação de senha** (lacuna de design) | `api/auth/signup/route.ts:58-128`; `login/page.tsx:41` | P1 (bootstrap) |
| FL-16 | Configurações: formato dos títulos, timezone, tema, notificações (`8:3333`, `13:42966`) | Parcialmente conectado — só o menu de idioma/escrita do título, por `localStorage`; sem página, timezone nem preferências de notificação; padrão **EN** (Figma: Japonês) | `titlePreference.tsx:29-32`; `AccountMenu.tsx` | P1/P2 |
| FL-17 | Moderar uma denúncia (admin) | Parcialmente conectado — só Manter/Remover; sem motivo, sem trilha, sem `PostComment` nem perfil | `AdminDashboard.tsx`; `admin/*-reports/*/resolve` | P1 |
| FL-18 | Remover acompanhamento (diálogo `8:5802` "Remover acompanhamento?") | **Ausente na UI** — existe `DELETE /api/anime/[id]` e teste e2e, mas nenhum componente o chama | `api/anime/[id]/route.ts:24-49`; grep `method: "DELETE"` | P1 |

### 3.1 Contagem por classe (denominador = 18 fluxos; cada fluxo conta uma vez, pela situação na PoC)

| Classe (PoC) | Fluxos | Qtde |
| --- | --- | --- |
| Completo e conectado | FL-15 | 1 |
| Parcialmente conectado | FL-02, FL-04, FL-05, FL-07, FL-09, FL-10, FL-11, FL-12, FL-16, FL-17 | 10 |
| Ausente | FL-01, FL-03, FL-06, FL-08, FL-13, FL-14, FL-18 | 7 |
| Não verificável | — (a PoC foi inspecionável em todos; nenhum fluxo foi executado em navegador) | 0 |
| **Total** | | **18** |

**Situação no Figma:** os 14 fluxos A–H e 01–06 são **Documentados, mas não conectados**; os fluxos FL-15 a FL-18 não têm cadeia própria (apenas telas/diálogos: `8:2371`, `8:3333`/`13:42966`, `13:41133`, `8:5802`).

## 4. Caminhos sem saída, ações sem feedback, perda de contexto, destinos inexistentes

| ID | Problema | Onde | Prio |
| --- | --- | --- | --- |
| UX-01 | **Perda de contexto no login** (sempre `/`): o Figma exige "destino e intenção preservados" em Acompanhar, Publicar, Responder, Seguir, Denunciar e Curtir. | `login/page.tsx:41`, `signup/page.tsx:44`, `DiscoverCard.tsx:91` | P1 |
| UX-02 | **Destino inexistente para Visitante**: detalhe de obra = 404; calendário abre site externo; Descobrir só modal. | `anime/[id]/page.tsx:35,43`; `CalendarEntryPreview.tsx:23` | P0 |
| UX-03 | **Calendário vazio sem explicação** (a UI diz "Nada previsto" como se fosse verdade; sem aviso de dados velhos). | `CalendarDayColumn.tsx`; `calendar/page.tsx` | P0 |
| UX-04 | **Erro confundido com vazio no Feed**: falha de rede/500 mostra "Nenhum post ainda…" — o oposto de `8:5448` ("erro de conexão não significa ausência"). | `FeedView.tsx:192-216,682-688` | P1 |
| UX-05 | **Conteúdo removido some em silêncio** (sem tombstone `13:43571`). | `postDto.ts:210-219`; `postFeedDto.ts:51-54` | P2 |
| UX-06 | **Hashtag e chip de obra não clicáveis**. | `PostCard.tsx:234-273,304,316-320` | P2 |
| UX-07 | **Remover acompanhamento sem UI**; **"Acompanhar" não existe como rótulo**. | grep `method: "DELETE"`; grep `acompanh` | P1 |
| UX-08 | **Preview do calendário só por hover**: sem teclado/toque/leitor de tela. | `CalendarEntryCard.tsx` (`onMouseEnter/Leave`) | P2 |
| UX-09 | **Home é o Feed**; "o que sai hoje?" não é respondido em `/`; o Figma tem o Dashboard (logo) e 4 itens de nav (`13:41078`). | `app/page.tsx:7-19`; `Header.tsx:73-116` | P1 |
| UX-10 | Apagar post sem confirmação (`13:43571` exige "Excluir publicação?"); erros inline sem `role="alert"` e sem ícone. | `PostCard.tsx:225-231`; `InlineEditField.tsx` | P2 |
| UX-11 | Sino: item vira texto sem link quando o anime saiu da lista; sem "marcar como lido" por canal nem preferências. | `NotificationBell.tsx:233-236` | P2 |
| UX-12 | Nenhum `error.tsx`/`loading.tsx` global; 404 usado também para "proibido" (nunca 403). | `src/app` | P2 |
| UX-13 | **Busca/estado do feed não restaurados ao voltar** (`13:41169`: preservar aba, query, filtros, scroll). | `FeedView.tsx` (estado local) | P2 |
| UX-14 | **Minha Lista começa com hero de 52–62 vh** e agrupa por consumo; o Figma agrupa por data de lançamento (`8:2608`). | `minha-lista/page.tsx:13-19,75-78` | P2 |

## 5. Prontidão para prototipagem — o que o Figma ainda precisa ter para fechar os fluxos

Os fluxos do Figma são **estáticos** (nenhuma interação conectada). Para virarem protótipo validável faltam:

1. **Conectar** os 14 fluxos (hoje "interações a conectar"); definir qual é a fonte de verdade quando a cadeia resumida e a tabela divergem (FV-16).
2. **Frames ausentes** (FV-06/FV-07): menu "···" do post aberto; **visitante** nas telas sociais; aba **Em alta** da hashtag; aba **Discussões iniciadas**; **resultados** da busca social; "**Saiba como**" do Para você; **lista de bloqueados**; **tombstone de comentário**; estado "Seguindo" vazio já existe (`13:43738`), mas não o de hashtag/perfil/busca; spoiler para **busca, citação e bio**.
3. **Telas de conta**: cadastro por convite e recuperação de senha **não existem** no Figma (só login).
4. **Decisão do Figma sobre a prévia de resposta e as hashtags** do post com spoiler (FV-06) e sobre o filtro "Status" de Minha Lista (FV-08).
5. **Validação de 1280 e 1920**: declarada "não validada" pelo próprio Figma (`13:41166`, `13:41169`).
6. **Pendências sem número** (`13:41172`): limites de caracteres/hashtags, rate limits, retenção de rascunhos, janela de "Em alta", agregação de notificações — precisam de decisão do dono do produto (ver `OPEN_DECISIONS.md`).

# Quiz, títulos (conquistas) e avatar de anime — especificação lida do Figma

Arquivo `vg9LobYvRnXk2iUmDd7uXa`. Páginas novas (o conector só lista a 1ª página; abrir por id):

| Página | Canvas | Frames principais |
|---|---|---|
| 19 — Perfil — Avatar e Conquistas | `41:31364` | Minhas conquistas `41:28061` · Título equipado após demo `41:28158` · Escolher título `41:28330` · Estados `41:28432` · Padrões sociais do título `41:28572` |
| 20 — Quiz — Experiência e Resultados | `41:31365` | Introdução e spoilers `41:28803` · Pergunta 01…10 `41:28899`, `41:29001`, … · Resultado 10/10 `41:29937` · Resultado 7/10 `41:30007` · Estados e guardas `41:30072` |
| Componentes | `42:5183` | `QuizQuestion` (Response=Unselected/SelectedA–D/ConfirmedA–D) · `QuizProgress` `42:3706` · `QuizResult` `42:5243` · `AchievementTitleBadge` `42:3461` · `AchievementCard` `42:4532` · `ProfilePreview` `42:4440` |

Referência de estilo do perfil/avatar: Crunchyroll `/pt-br/discover` ("Editar Perfil" com banner, avatar com lápis, nome, nome de usuário; "Seleção de Avatar" com avatares agrupados por anime).

## Regras do quiz
- Um quiz por obra (escopo, ex.: "Season 1 — personagens e ambientação"), **10 perguntas**, 4 alternativas (A–D), uma por página. Categoria em caixa alta ("PERSONAGENS").
- Fluxo: introdução + aviso de spoiler (consentimento explícito "Entendo os spoilers") → selecionar alternativa → **Confirmar resposta** → próxima. Sem voltar para editar. **Nenhum gabarito é mostrado.**
- Acesso: precisa de conta e de **acompanhar a obra** (condição de acesso, não consentimento de spoiler; não significa ter assistido).
- Só existe quiz real quando há **10 perguntas aprovadas**; senão "Experiência real · Indisponível".
- Resultado: `10/10` desbloqueia o título cosmético (ex.: "称号 · Olhar de boticária"); qualquer outra nota não concede nada. Sem XP, nível, ranking ou recompensa parcial. Nova tentativa: política pendente (adotado: uma tentativa concluída por pessoa e quiz; tentativa em andamento pode ser abandonada).
- Ações do resultado: "Equipar título", "Ver minhas conquistas", "Voltar ao anime".

## Títulos (conquistas)
- Persistem na coleção independentemente de acompanhar a obra. Equipar é opcional; **um título por vez, ou nenhum**. "Remover do perfil" não apaga da coleção.
- `AchievementTitleBadge`: pílula roxa (`#1b152b`, texto `#8b5cf6`, 12 semibold, raio 10) com "称号 · <título>"; aparece sob o autor (`ProfilePreview`: identidade + badge) em perfil, postagens e respostas. Sem título: nenhum badge (sem wrapper vazio).
- "Minhas conquistas" (página `/conquistas`, pelo link da caixa de conquistas do perfil; era a aba "Minhas conquistas · N"): `AchievementCard` — capa 120×180, "✓ EQUIPADO"/"DESBLOQUEADO", título 26, obra JP 18 / EN 14, requisito, ação "Remover do perfil" / "Equipar título"; painel lateral "No seu perfil agora" + "Escolher título".

## Avatar
- Foto de perfil escolhida entre imagens das obras que a pessoa acompanha (capa e personagens), agrupadas por anime; fica independente do título equipado.

## Carga das perguntas (Admin → Quizzes)
- JSON (um quiz ou uma lista de vários animes) ou CSV `;` de um anime; modelos em `docs/quizzes/modelo-quiz.json` e `modelo-quiz.csv`. Sempre 10 perguntas, 4 alternativas distintas e a correta de A a D; `scope` (recorte) e `titleReward` (título desbloqueado) por obra.
- "Validar" só confere; "Carregar" grava tudo ou nada. Por padrão as perguntas entram em **revisão**; o quiz só abre para as pessoas com as 10 **aprovadas** (aprovação individual ou de uma vez na tela de revisão, que é o único lugar que mostra o gabarito).
- Recarregar um quiz sem tentativas substitui as perguntas; com tentativas, é recusado (e o quiz não pode ser removido). A obra precisa estar no catálogo. Cargas e aprovações vão para os logs do admin.

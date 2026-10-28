# ADR 0012 — Perfil social

Status: aceito em 26/10/2026.

## Contexto

O perfil tinha o cabeçalho (capa, avatar, nome, bio, seguir) e as abas Publicações, Discussões e Animes. A pessoa usuária
pediu um perfil social completo, com o tema do Anime Hub, e escolheu:

- **recados** (scrapbook): qualquer conta deixa um recado no perfil de outra;
- **depoimentos**: escritos por amigos, aparecem só depois que a pessoa aprova;
- **fãs e avaliações**: "ser fã" e notas de amigos (como confiável/legal/sexy, com o tema do site);
- **quem sou eu + sorte do dia**;
- **amigos = o seguir que já existe**: amigo é quem se segue mutuamente. Não há pedido de amizade.

## Decisão

- **Layout em 3 colunas**, igual ao das comunidades (ADR 0011):
  - esquerda: menu das seções, fãs e avaliações;
  - centro: o cabeçalho de antes (sem a bio), a sorte do dia, o quem sou eu, os recados, os depoimentos e as abas de
    antes (Publicações, Discussões, Animes);
  - direita: amigos (9, com "ver todos"), comunidades em que a pessoa entrou e conquistas (títulos dos quizzes).
- **Quem sou eu.** A bio de antes, mais anime e personagem favoritos (texto livre, até 80 caracteres) e até 5 gêneros
  favoritos (do vocabulário de gêneros, sem Hentai). Tudo opcional, em Editar perfil.
- **Sorte do dia.** Só a dona do perfil vê. As 30 frases são do Anime Hub; nenhuma cita uma obra. A frase
  depende da pessoa e do dia no fuso de quem vê (`src/lib/dailyFortune.ts`).
- **Recados.** Até 1.000 caracteres, 20 por minuto por conta. Apagar: quem recebeu, quem escreveu ou a moderação; o
  recado fica marcado como apagado. O perfil mostra os 5 últimos; `/users/<id>/recados` mostra todos, 20 por página.
- **Depoimentos.**
  - Só amigos escrevem, até 2.000 caracteres e um por amigo.
  - Reescrever volta a esperar a aprovação.
  - A dona aprova ou recusa. Quem visita vê só os aprovados.
  - Quem escreveu ou quem recebeu pode apagar.
- **Fãs.** Qualquer conta pode ser fã, menos de si mesma. Os fãs aparecem só como contagem.
- **Avaliações.** Só amigos avaliam. São três notas de 0 a 3 cada:
  - Otaku raiz;
  - Gente boa;
  - Sem spoiler.

  O perfil mostra a média e quantos avaliaram. Quem avaliou pode mudar as notas.
- **Bloqueio.** Com bloqueio entre as duas pessoas, não há recado, depoimento, fã nem avaliação, e o que a pessoa
  bloqueada escreveu some para quem bloqueou.
- **Notificações (sino).**
  - Recado e depoimento seguem a preferência de comentários e levam a `#recados` / `#depoimentos`.
  - Virar fã segue a de seguidores, sem repetir.
- **"Minhas conquistas"** saiu do menu do avatar e agora fica no perfil: na caixa de conquistas e na aba de antes.

## Consequências

- **Banco.** `20261108100000_profile_social` só acrescenta:
  - os favoritos em `User`;
  - as tabelas `Scrap`, `Testimonial`, `Fan` e `ProfileRating`.
- **Código.**
  - Regras: `src/lib/profileSocial.ts`.
  - Rotas: `/api/users/<id>/scraps`, `/testimonials`, `/fan`, `/rating`, `/api/scraps/<id>` e `/api/testimonials/<id>`.
- **Testes.** Spec 121 e `src/lib/dailyFortune.test.ts`. O spec 70 foi ajustado ao novo rótulo "Quem sou eu".
- **Fora desta versão.**
  - Pedido de amizade separado do seguir.
  - Lista de quem é fã.
  - Responder recado no perfil de quem escreveu, num clique.

## Revisão de 26/10/2026 — amizade separada do seguir

A pessoa usuária escolheu trocar o "amigo = seguir mútuo" por **pedido de amizade**.

- **Pedir e responder:**
  - "Adicionar como amigo" fica no cabeçalho do perfil, ao lado de "Seguir perfil".
  - Quem recebe aceita ou recusa no próprio perfil de quem pediu ou na página **Amigos** (`/amigos`, também no menu da
    conta). A página lista os pedidos recebidos, os enviados e os amigos.
  - Quem pediu pode cancelar. Qualquer um dos dois pode desfazer a amizade.
  - Se as duas pessoas pedirem, vira amizade direto.
- **Seguir continua independente:** monta o "Seguindo" do Feed e não cria nem desfaz amizade.
- **O que exige amizade:** depoimentos e avaliações, como antes, agora pela amizade.
- **Grade de amigos:** mostra as amizades. No próprio perfil, a caixa de amigos avisa dos pedidos esperando e leva a
  `/amigos`.
- **Sino:**
  - "quer ser seu amigo" leva a `/amigos`;
  - "aceitou seu pedido de amizade" leva ao perfil de quem aceitou;
  - os dois seguem a preferência de seguidores e não se repetem.
- **Bloqueio:** desfaz a amizade e apaga os pedidos entre as duas pessoas; com bloqueio, não há pedido novo.
- **Banco** (`20261110100000_friendships`): cria `Friendship` e `FriendRequest`. A `Friendship` guarda um registro por
  par, com o menor id em `userAId`. A migração transforma em amizade quem já se seguia mutuamente, para ninguém perder
  depoimentos ou avaliações. Ela só acrescenta.
- **Código e testes:** as regras ficam em `src/lib/friends.ts`. Testes: spec 123, que inclui a carga da migração; o spec
  121 foi ajustado.

## Revisão de 26/10/2026 — moderação dos perfis

- **Denunciar.** Recados e depoimentos aprovados têm o botão "Denunciar", com o mesmo fluxo das publicações:
  - um dos motivos fixos (spam, assédio, spoiler sem aviso, outro);
  - uma confirmação;
  - o retorno discreto "Denunciado".
- **Regras.**
  - Quem escreveu não denuncia o próprio conteúdo.
  - Depoimento pendente não é denunciável: quem recebe recusa.
  - Cada pessoa tem no máximo uma denúncia aberta por conteúdo.
  - Até 20 denúncias por minuto por conta.
- **Fila.** Admin → Acesso e moderação ganhou "Denúncias dos perfis" (permissão `moderation`).
  - **Remover** esconde o recado (marcado como apagado) ou o depoimento (status `REMOVED`) e fecha todas as denúncias
    abertas do mesmo conteúdo.
  - **Manter** fecha as denúncias sem mexer no conteúdo.
  - Quem resolveu e a ação (`REMOVED`/`KEPT`) ficam registrados.
- **Banco.** `20261111100000_profile_reports` cria `ProfileReport` e só acrescenta.
- **Testes.** Spec 124.

## Revisão de 26/10/2026 — encontrar pessoas

- **Busca na página Amigos** (`/amigos?q=`): por nome ou @identificador, com pelo menos 2 letras e até 20 resultados.
  - Cada pessoa vem com o botão de amizade no estado certo: adicionar, cancelar, aceitar ou já amigos.
  - Ficam de fora a própria pessoa, quem tem bloqueio com ela e a conta do sistema (NewsHub).
- **Sugestões** (até 8): quem participa das mesmas comunidades e quem acompanha os mesmos animes.
  - Comunidade em comum vale 2; anime em comum vale 1.
  - Anime em comum só conta para quem deixa a aba Animes pública, para não revelar listas ocultas.
  - Cada sugestão diz o que há em comum, como "2 comunidades em comum · 3 animes em comum".
  - Ficam de fora amigos, pedidos pendentes nos dois sentidos e bloqueios.
- **As mesmas sugestões em outros lugares** (rota `/api/friends/suggestions`):
  - na lateral do Feed, a caixa "Pessoas que você talvez conheça", com 3 pessoas, o botão de amizade e "Ver mais
    sugestões";
  - no próprio perfil, enquanto não há amigos, a caixa de amigos;
  - na aba "Seguindo" vazia, as sugestões de quem seguir: primeiro quem tem algo em comum, depois as contas mais novas,
    sem bloqueios e sem a conta do sistema.
- **Código.** `searchPeople` e `friendSuggestions` em `src/lib/friends.ts`. Sem migração.
- **Testes.** Spec 125.

## Revisão de 26/10/2026 — recados mais completos

- **Responder.** No próprio perfil, cada recado recebido tem "Responder".
  - A resposta vai para o perfil de quem escreveu.
  - Ela fica marcada como "↩ resposta a um recado" (`Scrap.replyToId`).
  - Só quem recebeu responde, e só para quem escreveu.
  - Quem escreveu o original recebe o aviso de recado no sino.
- **Conversa** (`/users/<id>/recados/com/<outro>`, link "ver conversa" em cada recado).
  - Mostra os recados de uma pessoa no perfil da outra, nos dois sentidos, do mais antigo ao mais novo (os 100 mais
    recentes), cada um com "no perfil de …".
  - Quem é uma das duas pessoas escreve para a outra dali mesmo; quem visita só lê, porque recados são públicos.
  - Com bloqueio entre as duas, ou entre quem vê e uma delas, a página não existe (404).
- **Fãs** (`/users/<id>/fas`, link "ver fãs" na caixa de fãs): quem é fã, dos mais recentes aos mais antigos, sem
  bloqueios.
- **Banco.** `20261112100000_scrap_replies` só acrescenta: a coluna `replyToId` e um índice.
- **Testes.** Spec 126.

## Revisão de 26/10/2026 — aniversários

- **Data opcional em Editar perfil:** só dia e mês, sem o ano, para não expor a idade; 29/02 vale.
  - No "quem sou eu" do perfil, a data aparece só para a própria pessoa (com "só amigos veem") e para os amigos.
- **Aniversariantes:** hoje e os próximos 7 dias, no fuso de quem vê.
  - Na página Amigos, cada um tem o link "Deixar um recado" no dia.
  - Na lateral do Feed aparecem até 5.
  - Quem nasceu em 29/02 aparece em 28/02 nos anos que não são bissextos.
- **Sino:** "Hoje é aniversário de …", que leva aos recados da pessoa.
  - O aviso é criado quando o sino é consultado, um por amigo por dia, sem precisar de um serviço agendado.
  - Segue a preferência de seguidores e amizade.
- **Gêneros favoritos:** a lista do editor passa a excluir os gêneros marcados como adultos (`Genre.adult`), em vez de
  só "Hentai" pelo nome.
- **Banco.** `20261113100000_birthdays` só acrescenta duas colunas em `User`.
- **Código e testes.** O cálculo de datas fica em `src/lib/birthdayDates.ts` (sem banco, também usado no navegador) e os
  aniversariantes e avisos em `src/lib/birthdays.ts`. Testes: spec 127 e `birthdayDates.test.ts`.

## Revisão de 26/10/2026 — visitas ao perfil

- **Registro:** quem tem conta e abre o perfil de outra pessoa fica registrado, guardando só a última visita de cada
  pessoa (`ProfileVisit`). Não contam a própria visita, quem não entrou nem quem tem bloqueio com a dona do perfil.
- **Quem vê:** só a dona do perfil vê quem visitou.
  - No perfil, a caixa "visitas recentes" mostra 9 visitantes com há quanto tempo.
  - Em `/users/<id>/visitas` estão até 100; para qualquer outra pessoa essa página não existe (404).
  - As visitas valem pelos últimos 90 dias.
  - Visitante que depois teve bloqueio com a dona some da lista.
- **Reciprocidade:** Configurações tem "Registrar minhas visitas aos perfis", ligado por padrão.
  Desligado, as visitas da pessoa não são registradas e somem da lista de todos, até as antigas; e ela também não vê
  quem visitou o perfil dela.
- **Banco.** `20261114100000_profile_visits` só acrescenta: `User.recordVisits` e a tabela `ProfileVisit`.
- **Código e testes.** `src/lib/profileVisits.ts`. Testes: spec 128; o spec 52 foi ajustado.

## Revisão de 26/10/2026 — álbuns de animes e avatar só de anime

A pessoa usuária definiu que **não há fotos nem álbuns de fotos**:

- **Avatar e capa só de anime.** Avatar e capa são sempre imagens dos animes que a pessoa acompanha, escolhidas em
  Editar perfil. A capa já era assim.
  - O botão "Enviar minha própria foto" saiu, e o envio (`POST /api/users/me/avatar`) responde 410.
  - Quem tinha foto enviada volta às iniciais (migração `20261115110000_avatar_from_anime_only`, a pedido da pessoa
    usuária). Os arquivos continuam no disco; só a referência foi zerada.
- **Álbuns são coletâneas de animes.** No perfil, a seção "álbuns" fica depois do "quem sou eu", e cada álbum tem a sua
  página (`/users/<id>/albuns/<álbum>`).
  - **Automáticos**, pelo andamento de cada anime, com a mesma regra da aba Animes: Assistindo, Terminei, Não terminei e
    Dropei.
  - **Personalizados**: a pessoa cria ("+ Novo álbum"), dá nome e descrição e coloca obras da própria lista, com busca.
    - Pode renomear, tirar obras e apagar o álbum.
    - Tirar a obra da lista tira do álbum.
    - Limites: 30 álbuns, 200 obras por álbum e nome de até 60 caracteres, que não pode repetir o de um automático.
- **Quem vê** segue "Mostrar meus animes": desligado, só a própria pessoa vê, e a página do álbum não existe (404) para
  quem visita. Bloqueio também esconde.
- **Banco.** `20261115100000_profile_albums` (`ProfileAlbum`, `ProfileAlbumItem`) só acrescenta.
- **Código e testes.** `src/lib/profileAlbums.ts`. Testes: spec 130; o spec 46 foi ajustado ao 410.

## Revisão de 27/10/2026 — decisões depois da auditoria

Detalhes em `docs/auditoria/auditoria-regras-e-paginas.md`.

- **Andamento com um nome só, nos álbuns.** A aba Animes é a lista completa, com busca e gênero, sem os filtros de
  andamento. O recorte por andamento fica nos álbuns automáticos. Os nomes são os mesmos em todo o site: Assistindo,
  Terminei, Não terminei, Dropei.
- **Avatar e capa.** Se a pessoa deixa de acompanhar o anime da imagem, o avatar volta às iniciais e a capa some.
- **Álbum denunciado.** O álbum vai para a fila dos perfis em Acesso e moderação. Removido, ele some para todos; o dono
  vê o aviso e só pode apagar.
- **Bloqueio.** Como no perfil, o comentário de quem o autor de uma publicação bloqueou some para todos.
- **"Seguindo".** Inclui as publicações dos amigos.
- **Visitante sem conta.** Vê "Adicionar como amigo", que leva ao login.
- **Visitas.** As de mais de 90 dias são apagadas.
- **Aniversários.** O aviso é calculado uma vez por dia (`User.birthdayCheckedOn`); uma amizade nova ou uma data
  mudada refazem o cálculo.
- **Banco.** `20261116100000_reports_events_albums` só acrescenta.
- **Testes.** Spec 132; os specs 77, 82 e 127 foram ajustados.

## Revisão de 28/10/2026 — sistema fechado e validação

- **Perfis só para quem tem conta.** Com o AnimeHub fechado, "quem visita" passou a ser outra pessoa com conta.
  - Quem não entrou vai ao login, e as rotas de leitura do perfil (recados, publicações, animes) exigem sessão.
  - Deixaram de valer o "Visitante sem conta vê 'Adicionar como amigo'" (revisão de 27/10) e o "quem visita só lê, porque
    recados são públicos" (recados mais completos). Os recados ficam à vista de quem tem conta.
- **Validação contra a referência do Orkut:** `docs/auditoria/validacao-social.md`. Ficaram para decidir: mensagens
  privadas e amigos em comum no perfil de outra pessoa.

## Revisão de 28/10/2026 — animes junto dos álbuns

A pessoa usuária pediu que as abas do fim do perfil (Publicações, Discussões iniciadas, Animes, Minhas conquistas)
encaixassem no resto do perfil e que a lista de animes ficasse junto dos álbuns.

- **Seção "animes".** É a antiga seção de álbuns, no mesmo lugar (`#albuns`), com duas vistas: **Álbuns · N** (a
  primeira) e **Todos · N** (a lista completa, com busca e gênero). `?aba=animes` ainda abre a lista, também ao voltar
  da página de uma obra. No menu do perfil, o item passou a se chamar "Animes", com o total de obras.
- **Lista oculta.** Quem visita não vê a seção inteira, nem a lista nem os álbuns. Antes, quem visitava via a aba
  Animes com o aviso de lista oculta.
- **Seção "publicações".** Ganhou o mesmo card das outras seções, com o total no título e as abas "Todas" e
  "Discussões iniciadas". `?aba=discussoes` abre a segunda.
- **"Minhas conquistas"** deixou de ser uma aba que levava para fora do perfil. O caminho agora é o link "minhas
  conquistas" da caixa de conquistas.
- **Testes.** Os specs 69, 70, 72, 77, 96, 121 e 130 foram ajustados. No 96, a lista do perfil fica no meio da
  página, e o teste rola até o fim da lista, não da página.
- **Capa do álbum.** Os quadrados escuros de um álbum sem capas formavam uma cruz que parecia um botão de fechar. Agora:
  - sem capa, o álbum mostra a capa padrão (`public/album-padrao.svg`, três capas empilhadas com um sol nascente);
  - com 1 a 3 capas, mostra a primeira inteira;
  - com 4 ou mais, mostra o mosaico 2×2.
- **Foto de perfil padrão.** Quem não escolheu avatar mostra a foto padrão (`public/avatar-padrao.svg`, uma silhueta
  com o mesmo sol), no lugar das iniciais, em todo o site. "Remover foto" volta para ela.

## Revisão de 28/10/2026 — lote de ajustes (Feed, Meus Animes, Comunidades, Amigos, perfil)

Decisões da pessoa usuária, nas perguntas deste lote: só o @ fica fixo; a aba nova de Meus Animes mostra "Não terminei"
mais as obras com episódio adiado; nas comunidades entram categorias, busca com ordem, comunidades dos amigos e
relacionadas às obras.

- **Busca do Feed.** Ficou pequena (o rótulo só para leitores de tela) e vai no topo da lateral, acima de "Em alta agora".
  No celular e no tablet, a lateral vai para depois do Feed, por isso a busca fica antes dele.
- **Pausados (Meus Animes).** Terceira aba, ao lado de Minha Lista e Para assistir: obras cujas temporadas já terminaram
  de passar e que a pessoa não terminou ("Não terminei" ou com episódio adiado). Usa a mesma grade da aba Animes do
  perfil (busca, gênero, prévia, andamento); marcar "Terminei" ou "Dropei" tira a obra da aba. `?category=paused` na API.
- **Perfil.**
  - "Nova publicação" e "Editar perfil" viraram atalhos discretos (contorno fino, ícone, sem fundo).
  - O "quem sou eu" tem só o ícone de editar (com nome para leitores de tela e dica ao passar o mouse).
  - "Novo álbum" é um cartão dentro da grade dos álbuns, do tamanho de um álbum.
- **Plano de fundo do perfil** (`User.backgroundUrl`, migração `20261120100000_profile_background`, só acrescenta). Segue
  a regra do avatar e do banner: só imagens (banner ou capa) das obras que a pessoa acompanha, escolhidas no seletor, e
  some se ela deixa de acompanhar a obra. Aparece fixo atrás do perfil, escurecido para o texto continuar legível.
- **Seletor de imagens** (avatar, banner e plano de fundo): busca pelo título e páginas de 8 obras.
  - **A repetição.** Cada temporada era um grupo, e as mesmas pessoas voltavam em cada uma. Na lista real eram 800
    linhas para 429 obras; dos 4.826 personagens, 646 eram a mesma imagem e 536 nomes se repetiam.
  - **Agora:** uma obra é um grupo, com as capas de cada temporada ("Capa · 2ª temporada"). Cada personagem aparece uma
    vez, com a arte da temporada mais recente, e nenhum endereço se repete no seletor inteiro.
- **Nome de usuário (@) fixo.**
  - A pessoa não troca mais o @ (PATCH /api/users/me responde 403); o "Nome do Perfil" continua livre.
  - O administrador define o @ ao criar a conta (obrigatório, 3 a 20 letras minúsculas, números ou _, sem espaço) e pode
    definir ou corrigir depois em Acesso e moderação → Usuários, para as contas antigas que ainda não têm.
  - O comando do primeiro administrador pede `--usuario`.
  - Contas antigas sem @: `scripts/sugerir-usuarios.mjs` (`npm run admin:usuarios`). Ele mostra uma sugestão por
    conta, tirada do nome, e com `--aplicar` grava todas de uma vez. Só mexe em quem ainda não tem @; `--definir
    email=usuario` troca uma sugestão. As regras estão repetidas em `.mjs` porque o comando roda no cluster com Node 20;
    `handleSuggestion.test.ts` confere que elas batem com `src/lib/handle.ts`.
- **Amigos.** Duas colunas no computador.
  - À esquerda, os seus amigos e as **pessoas na rede**: todo mundo no AnimeHub, das contas mais novas para as mais
    antigas, com amigos em comum, em páginas de 20.
  - À direita, pedidos, aniversários, sugestões e pedidos enviados.
  - As sugestões passaram a contar amigos de amigos (peso 2, como as comunidades em comum).
- **Comunidades.** "Populares" e "Buscar" viraram uma tela só, **Explorar**:
  - busca pelo nome do anime;
  - **categorias** (os gêneros das obras, sem migração: vêm do catálogo);
  - **ordem** (mais membros, mais novas, atividade recente);
  - páginas de 24;
  - sem filtro, as faixas **Dos seus amigos** e **Das obras que você acompanha**.

  Os endereços antigos (`?aba=populares`, `?aba=buscar`) abrem o Explorar. Dentro de uma comunidade há "← Comunidades"
  para voltar ao diretório. As relacionadas à obra continuam na coluna da direita da comunidade.
- **Foco nos campos.**
  - **Antes:** o anel amarelo do teclado ficava afastado do campo e aparecia em todo clique num campo de texto, já
    que o navegador trata esse clique como foco de teclado. O resultado era um contorno laranja por cima da borda do
    próprio campo.
  - **Agora:** campos de texto e seletores mostram o foco clareando a própria borda. No Editar perfil, o sublinhado
    claro substitui o laranja.
  - Links, botões e caixas de marcar continuam com o anel amarelo do teclado. Nas opções de Configurações, o anel só
    aparece pelo teclado.
- **Ações da prévia do calendário.** "Ver página da obra", "Acompanhando", "Adiar a obra"/"Retomar" e "Acompanhar"
  quebravam o cartão em alguns títulos. Agora são só ícones, com o nome na dica ao passar o mouse e para leitores de
  tela (`IconAction`).
- **"Atrasado" fora** (pedido de 28/10: um agente vai cuidar dos atrasos depois).
  - **Calendário:** saem o selo "Atrasado" no cartão, o aviso "Previsão atrasada" e a checagem na API. O episódio fica
    no horário previsto, sem marca.
  - **Meus Animes:** sai o estado "Atrasado". A obra cai em "Adiado" (hiato) ou "Data não definida", como as outras
    sem horário confirmado.
- **Testes.**
  - Spec novo: 141.
  - Ajustados: 06, 18, 43, 48, 58, 61, 62, 70 e 120.
  - Testes de unidade das imagens por obra (`avatarOptions.test.ts`) e da ordem do diretório (`communityDirectory.test.ts`).

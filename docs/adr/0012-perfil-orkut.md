# ADR 0012 — Perfil no formato do Orkut

Status: aceito em 26/10/2026.

## Contexto

O perfil tinha o cabeçalho (capa, avatar, nome, bio, seguir) e as abas Publicações, Discussões e Animes. A pessoa usuária
pediu o perfil no formato do antigo Orkut, com o tema do Anime Hub, e escolheu:

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
- **Sorte do dia.** Só a dona do perfil vê, como no Orkut. As 30 frases são do Anime Hub; nenhuma cita uma obra. A frase
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

- **Banco.** `20261108100000_profile_orkut` só acrescenta:
  - os favoritos em `User`;
  - as tabelas `Scrap`, `Testimonial`, `Fan` e `ProfileRating`.
- **Código.**
  - Regras: `src/lib/profileOrkut.ts`.
  - Rotas: `/api/users/<id>/scraps`, `/testimonials`, `/fan`, `/rating`, `/api/scraps/<id>` e `/api/testimonials/<id>`.
- **Testes.** Spec 121 e `src/lib/dailyFortune.test.ts`. O spec 70 foi ajustado ao novo rótulo "Quem sou eu".
- **Fora desta versão.**
  - Pedido de amizade separado do seguir.
  - Lista de quem é fã.
  - Responder recado no perfil de quem escreveu, num clique.

## Revisão de 26/10/2026 — amizade separada do seguir

A pessoa usuária escolheu trocar o "amigo = seguir mútuo" por **pedido de amizade**, como no Orkut.

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
  - A resposta vai para o perfil de quem escreveu, como no Orkut.
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
- **Reciprocidade, como no Orkut:** Configurações tem "Registrar minhas visitas aos perfis", ligado por padrão.
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

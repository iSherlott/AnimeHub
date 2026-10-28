# Auditoria de regras de negócio, lógica e páginas (27/10/2026)

Pedido: analisar as regras de negócio, a estrutura e a lógica de como as páginas devem funcionar; procurar falhas de
lógica e pontos de melhoria; validar os fluxos e cada página em detalhe.

## Como foi feito

1. **Inventário das regras.** A partir dos ADRs 0001–0012, do código e dos specs.
2. **Revisão da lógica.** O foco foi a camada social: Feed, comunidades, perfil, amizade, recados, depoimentos, fãs,
   avaliações, visitas, aniversários, álbuns, avisos e moderação. Revisei as regras que cruzam funcionalidades:
   bloqueio, privacidade, contagens, avisos e permissões.
3. **Validação de cada página.** Um spec temporário visitou todas as rotas como visitante, usuário e admin, em 1280 px
   e em 375 px: 208 visitas. Em cada uma, conferiu:
   - o status;
   - erros de JavaScript e de console;
   - os links internos da página, cada um aberto de novo;
   - a rolagem horizontal.
4. **Validação dos fluxos.** Os fluxos de ponta a ponta estão nos specs Playwright, listados abaixo. A suíte inteira
   roda a cada mudança.

## Regras de negócio (resumo)

| Área | Regras principais |
| --- | --- |
| Catálogo | Só entra o que o admin traz (cache da AniList); o id do catálogo é a identidade da obra; nunca inventar dado ("Dados insuficientes"); hentai é categoria visível com aviso +18; 18 gêneros num vocabulário aplicado pelo banco (ADRs 0001–0010). |
| Acompanhar | O acompanhamento é por obra; os episódios são globais. O andamento pode ser marcado à mão ou deduzido (Acompanhando, Não terminei, Terminei, Dropado). "Espera" e "Adiar" tiram a obra do calendário e dos avisos. |
| Calendário e sino | Lançamentos no fuso da conta; o aviso do dia só aparece no dia; "Data alterada" mostra o horário anterior. O sino tem um contador só, mostra 5 por canal com "Ver mais" e tem "Marcar todas como lidas". |
| Feed | As publicações são públicas, com hashtags e "Em alta" (7 dias). O aviso social nunca leva o texto. Spoiler fica escondido. "Seguindo" usa o seguir. A publicação sobre obra do catálogo mostra o atalho da comunidade. |
| Comunidades (ADR 0011) | Uma por franquia. Ler é público; escrever exige participar. A moderação fixa, tranca e resolve denúncias. Eventos têm presença. Avisos de resposta (um por tópico até ser lido) e de evento novo, só para membros. Busca no fórum. |
| Perfil (ADR 0012) | Recados de qualquer conta, com resposta e conversa. Depoimentos só de amigos, com aprovação. Fãs. Avaliações só de amigos (contam só amigos atuais). Sorte do dia só para a dona. Aniversário só para amigos. Visitas com reciprocidade. Álbuns de animes (automáticos e personalizados). Avatar e capa só de anime. |
| Amizade | Pedido aceito, separado do seguir; o pedido das duas pessoas vira amizade direto; bloqueio desfaz a amizade; sugestões por comunidades e animes em comum (só de listas públicas). |
| Bloqueio | Vale nos dois sentidos para quem bloqueou. No perfil, o que a pessoa bloqueada deixou some para todos (correção desta auditoria). |
| Moderação | Denúncias com motivo fixo para publicação, comentário, perfil, tópico, resposta, recado e depoimento. Remover fecha todas as denúncias do mesmo conteúdo. |
| Papéis | ADMIN, CURATOR e MODERATOR. O admin por permissão: catálogo ou moderação. |

## Falhas de lógica encontradas e corrigidas

| # | Falha | Correção | Teste |
| --- | --- | --- | --- |
| 1 | Bloqueio valia só para a dona do perfil: os recados e depoimentos de quem ela bloqueou continuavam visíveis para os outros visitantes, e a pessoa bloqueada continuava contando como fã e na média das avaliações. | Os recados, depoimentos, fãs e avaliações de quem tem bloqueio com a dona somem do perfil para todos. Os dados ficam guardados e voltam se ela desbloquear. | 131 |
| 2 | A avaliação de quem desfez a amizade continuava na média, mas a regra é "só amigos avaliam". | A média conta só as notas de quem ainda é amigo. A nota fica guardada. | 131 |
| 3 | A contagem de fãs no perfil incluía pessoas que a lista de fãs não mostrava (bloqueios). | A contagem usa a mesma regra da lista. | 131 |
| 4 | Os avisos de amizade nunca se repetiam: um pedido reenviado depois de recusado, ou uma amizade refeita, não avisava. E cada reescrita de depoimento gerava um aviso novo. | Pedido, aceite e depoimento não se repetem só enquanto o aviso anterior da mesma pessoa não foi lido. | 131 |
| 5 | Quem saía da comunidade continuava recebendo os avisos de respostas e eventos dela. | Os avisos das comunidades vão só para quem ainda é membro. | 131 |
| 6 | Uma obra com várias temporadas podia entrar duas vezes no mesmo álbum (uma por temporada). | O álbum recusa outra temporada da mesma obra (409), a página mostra a obra uma vez e a busca do editor compara pela obra. | 131 |
| 7 | Um depoimento removido pela moderação podia ser reescrito pelo autor e voltava para aprovação, contornando a decisão. | Depoimento removido não pode ser reescrito (403). | 131 |
| 8 | A preferência "Novos seguidores" também controlava os avisos de amizade, fãs e aniversários, e "Respostas aos meus comentários" controlava os de recados e depoimentos, mas os textos não diziam isso. | Os rótulos das Configurações passaram a dizer o que cada preferência controla. | 52 |
| 9 | No celular (375 px), a barra do topo do admin transbordava 15 px quando o caminho é longo, como em Correspondências. | A data com o fuso fica só a partir do tablet. | volta das páginas |

## Pontos de melhoria (não corrigidos: dependem de decisão ou são maiores)

1. **Bloqueio nas publicações e no perfil seguem regras diferentes.** No Feed, o comentário de quem o autor bloqueou
   some só para o autor (regra D-10). No perfil, agora some para todos. Vale decidir se as publicações seguem a regra
   do perfil.
2. **Avatar de anime que deixou de ser acompanhado.** A regra é "fotos dos animes que está acompanhando", mas quem
   para de acompanhar continua com aquela imagem. Opções: manter (hoje), avisar no Editar perfil ou voltar às iniciais.
3. **Nome "Assistindo" e "Acompanhando nesta temporada".** O álbum automático e a aba Animes usam nomes diferentes para
   a mesma categoria. Sugestão: um nome só.
4. **Aba Animes e álbuns automáticos se sobrepõem.** Os dois mostram a lista por andamento. Dá para a aba Animes passar
   a ser a lista completa com busca, e os álbuns ficarem com o recorte por andamento, ou juntar os dois.
5. **Conteúdo que não dá para denunciar.** Faltam eventos das comunidades, nomes e descrições de álbuns e o "quem sou
   eu" separado da denúncia de perfil. Sugestão: "Denunciar" no evento e no álbum, na mesma fila.
6. **Visitas guardadas para sempre.** A lista mostra só 90 dias, mas as visitas antigas continuam no banco. Sugestão:
   apagar as mais antigas que 90 dias num job diário.
7. **Desempenho do perfil.** A página faz cerca de 30 consultas, e a lista de animes é montada duas vezes (contagem e
   álbuns). Sugestão: reaproveitar a lista e juntar consultas.
8. **Aniversários no sino.** Eles são calculados a cada consulta do sino (60 s). Sugestão: guardar o resultado do dia.
9. **Amigos no "Seguindo".** Amizade e seguir são separados, então as publicações de um amigo que você não segue não
   aparecem em "Seguindo". Vale decidir se amigos entram.
10. **Visitante sem conta.** O perfil não mostra "Adicionar como amigo"; sugestão: mostrar o botão levando ao login,
    como o "Seguir".
11. **Deploy pendente.** O banco de dev e o cluster ainda estão sem as 23 migrações de `20261025100000` a
    `20261115110000`. É o maior risco em aberto. Passo a passo em `deploy/k8s/README.md`.

## Validação dos fluxos (de ponta a ponta)

| Fluxo | Specs |
| --- | --- |
| Entrar, cadastro por convite, voltar à página de origem | 05, 06, 48 |
| Explorar → obra → acompanhar, Minha Lista, andamento, adiar | 11, 45, 50, 72, 77, 81, 82, 87, 92 |
| Calendário, avisos de lançamento, fuso | 43, 51, 62, 90, 102 |
| Feed: publicar, comentar, curtir, citar, repostar, hashtags, Em alta, spoiler | 14, 31, 53, 55, 56, 119, 129 |
| Comunidades: participar, tópico, resposta, enquete, evento, moderação, diretório, avisos, busca | 117, 120, 122, 129 |
| Perfil: quem sou eu, sorte do dia, recados (responder, conversa), depoimentos, fãs, avaliações | 121, 126, 131 |
| Amizade: pedir, aceitar, recusar, desfazer, sugestões, busca | 123, 125 |
| Aniversários, visitas, álbuns | 127, 128, 130 |
| Bloqueio e denúncias (todas as filas) | 54, 124, 131 |
| Sino e preferências | 07, 52, 59, 118, 122 |
| Admin: curadoria, catálogo, episódios, importações, taxonomia, quizzes, papéis | 60, 63, 71, 93, 95, 104–110 |

## Validação de cada página

Resultado da volta de 27/10. O "200" significa: a página abriu sem erro de JavaScript, sem link interno quebrado e
sem rolagem horizontal, em 1280 px e em 375 px. "login" é o redirecionamento ao login, com retorno, para quem não
entrou. "→/" é quem já entrou abrindo login ou cadastro. Rotas de admin para quem não é da equipe dão 404, coberto nos
specs 05 e 110.

| Rota | Visitante | Usuário | Admin |
| --- | --- | --- | --- |
| `/` | 200 | 200 | 200 |
| `/discover` | 200 | 200 | 200 |
| `/calendar` | 200 | 200 | 200 |
| `/buscar?q=anime` | 200 | 200 | 200 |
| `/comunidades` | 200 | 200 | 200 |
| `/comunidades/<obra>` | 200 | 200 | 200 |
| `/comunidades/<obra>/forum` | 200 | 200 | 200 |
| `/comunidades/<obra>/enquetes` | 200 | 200 | 200 |
| `/comunidades/<obra>/eventos` | 200 | 200 | 200 |
| `/comunidades/<obra>/membros` | 200 | 200 | 200 |
| `/anime/<obra>` | 200 | 200 | 200 |
| `/users/<id>` | 200 | 200 | 200 |
| `/users/<id>/recados` | 200 | 200 | 200 |
| `/users/<id>/amigos` | 200 | 200 | 200 |
| `/users/<id>/fas` | 200 | 200 | 200 |
| `/users/<id>/albuns/terminei` | 200 | 200 | 200 |
| `/users/<id>/recados/com/<outro>` | 200 | 200 | 200 |
| `/login` | 200 | →/ | →/ |
| `/signup` | 200 | →/ | →/ |
| `/temporada/autumn2026` (o endereço testado, `fall-2026`, estava errado; os links do Explorar usam `autumn2026` e foram verificados) | 200 | 200 | 200 |
| `/dashboard` | login | 200 | — |
| `/minha-lista` | 200 | 200 | — |
| `/minha-lista/pendencias` | 200 | 200 | — |
| `/publicar` | login | 200 | — |
| `/configuracoes` | login | 200 | — |
| `/conquistas` | login | 200 | — |
| `/perfil/editar` | login | 200 | — |
| `/amigos` | login | 200 | — |
| `/users/<id>/visitas` | login | 200 | — |
| `/admin` | — | — | 200 |
| `/admin/acesso` | — | — | 200 |
| `/admin/atualizacoes` | — | — | 200 |
| `/admin/calendario` | — | — | 200 |
| `/admin/catalogo` | — | — | 200 |
| `/admin/conflitos` | — | — | 200 |
| `/admin/correspondencias` | — | — | 200 ⚠ (corrigido) |
| `/admin/curadoria` | — | — | 200 |
| `/admin/episodios` | — | — | 200 |
| `/admin/franquias` | — | — | 200 |
| `/admin/importacoes` | — | — | 200 |
| `/admin/jobs` | — | — | 200 |
| `/admin/logs` | — | — | 200 |
| `/admin/matching` | — | — | 200 |
| `/admin/match-name` | — | — | 200 |
| `/admin/obras` | — | — | 200 |
| `/admin/overrides` | — | — | 200 |
| `/admin/pendencias` | — | — | 200 |
| `/admin/quizzes` | — | — | 200 |
| `/admin/saude` | — | — | 200 |
| `/admin/scrapers` | — | — | 200 |
| `/admin/taxonomia` | — | — | 200 |
| `/admin/traducoes` | — | — | 200 |
| `/admin/obras/<id>` | — | — | 200 |
| `/admin/franquias/<obra>` | — | — | 200 |
| `/admin/taxonomia/<gênero>` | — | — | 200 |

As páginas que dependem de um registro que o banco de teste não tinha naquele momento são cobertas pelos specs:

- publicação: 14 e 31;
- hashtag: 56;
- quiz da obra: 69 e 110;
- episódio e quiz no admin: 105 e 71.

Nenhum erro de console apareceu fora do 404 do endereço errado de temporada.

## Decisões e o que foi feito depois (27/10)

| Ponto | Decisão | Feito |
| --- | --- | --- |
| 1. Bloqueio no Feed | Igual ao perfil | O comentário de quem o autor da publicação bloqueou some para todos (spec 132). |
| 2. Avatar de anime não acompanhado | Volta ao padrão | Ao tirar um anime da lista, e ao abrir o Editar perfil, o avatar e a capa que não são de nenhum anime acompanhado voltam às iniciais e ficam sem capa (spec 132). |
| 3 e 4. Nome e sobreposição | Fica um só: os álbuns | A aba Animes perdeu os filtros de andamento e virou a lista completa com busca e gênero. O andamento fica nos álbuns automáticos, e o nome é um só em todo o site: Assistindo, Terminei, Não terminei, Dropei (specs 77 e 82). |
| 5. Denúncias | Vão para o painel do admin | Eventos das comunidades vão para a fila das comunidades: remover apaga o evento. Álbuns vão para a fila dos perfis: remover esconde o álbum de todos, e o dono vê o aviso e só pode apagar (spec 132). |
| 9. Amigos no "Seguindo" | Entram | "Seguindo" mostra quem a pessoa segue e os amigos dela (spec 132). |
| 10. Visitante sem conta | Mostrar o botão | "Adicionar como amigo" leva ao login e volta ao perfil (spec 132). |
| 6. Visitas antigas | Limpar | A cada visita a um perfil, as visitas dele com mais de 90 dias são apagadas (spec 132). |
| 7. Desempenho do perfil | Mais leve | De 47 para 36 consultas por abertura do próprio perfil (medido com o registro de consultas do Prisma). A lista de animes é montada uma vez, os bloqueios são guardados por requisição, as comunidades vêm em lote e a média das avaliações pega os amigos numa consulta só. |
| 8. Aniversários no sino | Uma vez por dia | O cálculo roda na primeira consulta do sino no dia (`User.birthdayCheckedOn`). Uma amizade nova e a mudança da data de um amigo refazem o cálculo (specs 127 e 132). |

## Revisão das telas antigas (27/10)

Telas revisadas no desktop e no celular, com dados de exemplo (obras com capa, lista e episódios da semana): Explorar,
Calendário, Painel ("Seu dia, em anime"), Minha Lista, página da obra, Temporada, Busca e Admin (painel, obra,
curadoria, calendário, taxonomia).

| # | Problema | Correção |
| --- | --- | --- |
| 1 | **Temporada e Explorar:** um anime em exibição aparecia como "Data não definida". O cartão só olhava o próximo episódio guardado da AniList; o Calendário usa a agenda global, que também traz Kitsu, AniDB e os ajustes do admin. | Toda lista de obras completa o próximo episódio pela agenda global quando o catálogo não traz uma data futura (`withGlobalSchedule`). |
| 2 | **Selo dos cartões:** dizia "NOVO EPISÓDIO · EP06" para um episódio que ainda vai sair. | O selo agora diz "PRÓXIMO EPISÓDIO". |
| 3 | **Explorar:** o selo "Terminadas, nos seus gêneros" aparecia também quando a seção era completada com novidades do catálogo que ainda não estrearam. | O selo diz o que está na tela: "Nos seus gêneros e novidades do catálogo" quando há obras não terminadas. |
| 4 | **Minha Lista no celular:** o título ficava espremido numa coluna de poucos pixels, uma letra por linha. | No celular, a linha empilha: horário, depois capa e título, depois a ação. Vale nos 4 lugares que usam essa linha. |
| 5 | **Calendário no celular:** as colunas tinham ~108 px e o nome quebrava letra por letra. | Cada dia tem pelo menos 160 px; a grade rola na horizontal. |
| 6 | **Calendário:** o cabeçalho do dia de hoje ficava desalinhado dos outros por causa do "HOJE". | O cabeçalho do dia é alinhado pelo topo. |
| 7 | **Calendário e Painel:** o título vinha em romaji e sem capa quando a linha da agenda veio da Kitsu ou do AniDB sem esses dados. | Usam o título japonês, o inglês e a capa da obra da lista como reserva. |
| 8 | **Página da obra:** aparecia "Sem sinopse disponível" com a sinopse em português guardada no catálogo. | A sinopse recorre à do catálogo (português ou japonês). |
| 9 | **Página da obra:** o título japonês aparecia duas vezes (o principal e a linha de baixo). | A linha de baixo mostra só os títulos diferentes do principal, que segue a preferência de título. |
| 10 | **Minha Lista:** os botões "Finalizei" e "Pendente" fugiam do nome único do andamento. | Os botões agora são "Terminei" e "Não terminei". |
| 11 | **Admin:** os grupos de nome longo quebravam em duas linhas e ficavam centralizados. Numa tela baixa com vários grupos abertos, o fim do menu ficava fora de alcance. | Rótulos alinhados à esquerda; o menu tem no máximo a altura da janela, com rolagem própria. |

**Pontos para decisão:**

- **Temporada com dois nomes.** O site chama a temporada de "Autumn2026" (filtros, URL, importações), mas a página da
  obra mostra "Outono 2026". Sugestão: um nome só para quem usa o site, por exemplo "Outono 2026", mantendo
  `autumn2026` na URL.
- **Três espaços de conversa na página da obra.** Há "Comentários" (de quem acompanha), "Discussões sobre esta obra"
  (publicações do Feed) e "Comunidade" (o fórum). Vale decidir se "Comentários" continua, já que a comunidade cobre
  essa conversa.

**Decidido e feito (27/10):**

- **Temporada com um nome só.** O site mostra "Outono 2026" (e Inverno, Primavera, Verão) no Explorar, na página da
  temporada, no seletor e nos atalhos. O endereço continua `/temporada/autumn2026`; o admin e as importações mantêm o
  formato técnico "Autumn2026" (`seasonDisplayName` em `src/lib/exploreGroups.ts`).
- **A comunidade substitui os comentários.** A página da obra perdeu "Comentários" e "Discussões sobre esta obra" (e o
  "Publicar sobre este anime" que ficava nelas). A aba "Comunidade" leva ao cartão da comunidade da franquia, com o link.
  Os comentários e as publicações já gravados ficam no banco; as publicações sobre a obra continuam no Feed, filtradas
  por ela.

## Revisão em três camadas: nomes, celular e tablet (27/10)

**Camada 1: nomes e textos.**

- Nada no código, nos testes, nas migrações nem na documentação leva mais o nome de outra rede social. O perfil e as
  comunidades são do próprio Anime Hub:
  - `profileSocial.ts`, `ProfileActions.tsx` e `CommunityPanels.tsx`;
  - as migrações `community_events_moderation` e `profile_social`, renomeadas antes de chegar ao banco de dev;
  - o ADR `0012-perfil-social.md`.
- Saíram da tela os textos de desenvolvimento e as frases repetidas:
  - termos de projeto e de especificação: "Fase 2/4", "D-30", o caminho de um arquivo da documentação, "opt-in",
    "Preferência existente preservada" e os parágrafos de especificação em Publicar;
  - o detalhe técnico do erro de episódios ("fetch failed");
  - "Timezone" e "Dark", que agora são "Fuso horário" e "Escuro";
  - o "Autumn2026" repetido na lateral do Feed;
  - a frase solta "A busca social fica aqui";
  - os painéis técnicos de Importações e Scrapers, reescritos em português.
- "Compartilhar internamente" agora é "Compartilhar"; o menu continua oferecendo repostar e citar.

**Camada 2: celular (375 px) e tablet (768 px).** Cerca de 65 páginas foram medidas nos três tamanhos (usuário,
visitante e admin): 201 combinações. Nenhuma transborda mais na horizontal.

| Tela | Antes | Agora |
| --- | --- | --- |
| Publicações (Feed, perfil, busca, publicação) | No celular, a linha Curtir/Responder/Compartilhar/Excluir vazava da tela. | A linha quebra; cada ação fica inteira. |
| Calendário | No celular, uma grade de 1120 px mostrava dois dias e meio cortados. | Um dia por vez (o próximo aparece na borda), com deslize que encaixa no dia e abertura no dia de hoje. No tablet, dias de 200 px. Botões "Anterior / Hoje / Próxima" numa linha. |
| Filtros (Minha Lista, Explorar, temporada, admin) | Dois seletores lado a lado cortavam o texto ("Próximo lançam…"). | Cada seletor ocupa a linha inteira quando não cabe. |
| Admin | No celular, o menu inteiro vinha antes do conteúdo. As tabelas espremiam as colunas. | Botão "Menu" com a seção atual, que fecha ao escolher. As tabelas rolam na horizontal com largura mínima pelo número de colunas. |
| Perfil e página da obra no tablet | As caixas laterais ficavam empilhadas em largura total. | Duas colunas. |

**Camada 3:** suíte completa (lint, unitários e e2e) e conferência visual das telas alteradas.

**Resíduos vistos no tour (27/10):**

- **Fuso pelo nome.** O rodapé, o calendário, o Explorar, a lateral do Feed, as datas, o próximo episódio, o formulário de
  evento e o seletor de Configurações mostram "Horário de Brasília" (e Amazonas, Recife, Buenos Aires, Nova York, Los
  Angeles, Lisboa, Londres, Japão) em vez de "America/Sao_Paulo". Um fuso fora da lista, como o do dispositivo, vira
  "horário de <cidade>". O nome é fixo no código (`timeZoneLabel` em `src/lib/timeZone.ts`), então sai igual no servidor
  e no navegador. O admin continua com o identificador técnico.
- **Configurações:** saiu o cartão "Tema". Só existe o tema escuro, então não havia o que escolher.
- **Feed:** a aba "Para você" explica numa frase só que a ordem é por curtidas e que a Minha Lista não entra na conta. A
  aba "Seguindo" passou a dizer que inclui os amigos, como já fazia.
- **Franquia com "0 temporadas":** era só dos dados de teste do tour, que não tinham o papel na linha do tempo. No banco,
  toda obra com posição na linha do tempo tem o papel preenchido, então não há o que corrigir.

## Acessibilidade (27/10)

Rodei o axe completo em cerca de 65 páginas, como usuário, visitante e admin, no desktop e no celular. Ele cobriu
WCAG 2.0, 2.1 e 2.2 AA e as boas práticas, incluindo o contraste e o tamanho dos alvos de toque. Também percorri as
primeiras 45 paradas de Tab de cada página para conferir o foco visível e a ordem dos títulos. Não apareceu nada sério
nem crítico. O que apareceu e foi corrigido:

| Achado | Onde | Correção |
| --- | --- | --- |
| Foco pelo teclado quase invisível nos campos de texto e nos seletores: o MUI tira o contorno do `<input>` e só sobrava a borda mudando de cinza para cinza. | Em todas as páginas com busca, filtros ou formulários. | O tema põe o anel amarelo do site no campo inteiro (`MuiInputBase` com `:has(:focus-visible)`). Também ganharam o anel os campos próprios da importação, dos quizzes e do aniversário em Editar perfil. |
| Dois `<main>`, um dentro do outro. | Entrar e Criar conta. | O `<main>` fica só no layout, junto do "Pular para o conteúdo". |
| Títulos pulando de nível: subtítulo virava `<h6>`. | Página pública da obra (título em japonês) e Acesso e moderação. | Subtítulos agora são texto (`<p>`), no tema e na página da obra. |
| Dois `<h1>`. | Tópico da comunidade. | O nome da comunidade é o `<h1>`; o tópico vem logo abaixo, como `<h2>`. |
| Duas "regiões de busca" sem nome na mesma página, o que confunde quem navega por regiões. | Filtros do admin e diretório das comunidades. | O campo de busca dos filtros deixou de ser uma região própria (é só um campo com rótulo); a busca das comunidades ganhou o nome "Buscar comunidades". |

O spec 61 passa a cobrir também recados, Editar perfil, Amigos, Comunidades, a comunidade, o fórum, o tópico, Nova
publicação, Conquistas e Para assistir. Ele confere ainda que há um só `<main>` em Entrar e Criar conta e que os campos
mostram o anel de foco.

## Toque num anime abre a prévia; voltar volta ao mesmo ponto (28/10)

**Pedido da pessoa usuária:** no celular, tocar num anime do perfil ou do calendário abria direto a página da obra, o
que atrapalhava; no computador, o clique no calendário fazia o mesmo. E, voltando da página da obra, o navegador
levava ao topo, não ao ponto em que a pessoa estava.

**Decidido:** tocar ou clicar abre uma prévia, e a página da obra fica num botão dentro dela.

- **Prévia** (`WorkPreviewShell`): no celular, uma gaveta que sobe de baixo, com o X para fechar. Do tablet em diante, o
  cartão ao lado do item, que fecha ao clicar fora ou com Esc.
  - **Calendário:** o clique ou toque prende a prévia aberta (capa, horário, sinopse, Acompanhar, Adiar e "Ver página da
    obra"). No computador, passar o mouse continua mostrando a prévia, que some quando o mouse sai.
  - **Perfil, aba Animes:** a capa abre a prévia com títulos, andamento, temporadas, gêneros, o seletor de andamento
    (no próprio perfil) e "Ver página da obra".
- **Voltar ao mesmo ponto:**
  - **Calendário:** a semana, o filtro (Minha Lista ou Todos), a altura da página e o dia na grade do celular ficam
    guardados enquanto a aba do navegador estiver aberta. Ao voltar, tudo é restaurado (`useScrollMemory`,
    `src/lib/useScrollMemory.ts`).
  - **Perfil:** a aba aberta vai para o endereço (`?aba=animes`), sem recarregar a página. A busca e o gênero da aba
    Animes ficam lembrados. A rolagem volta ao ponto, carregando mais capas se precisar.
- **Spec 134** cobre a gaveta no celular, a prévia presa no computador e o "voltar" com semana, filtro, altura e aba.

**Prévia em mais lugares (28/10).** Os cartões de anime de Explorar, temporada, Dashboard (hoje e "mais tarde"),
Minha Lista, Para assistir, álbuns do perfil e obras relacionadas da página da obra abrem a mesma prévia, com
`WorkPreview` e `WorkPreviewTrigger` em `src/components/WorkPreview.tsx`. A prévia mostra capa, títulos, informações,
sinopse, gêneros, as ações do lugar (acompanhar, no Explorar) e o botão "Ver página da obra". A estrela de acompanhar
continua sobre a capa no Explorar. Ao voltar da obra, Explorar, temporada e Minha Lista restauram a busca, os filtros
e a rolagem.

Ficam como links os textos que levam a outra obra por dentro da própria página da obra (temporadas, ramos, marcadores
da história), da hashtag e da comunidade, e os resultados da busca do cabeçalho. Ali a intenção de navegar é clara.

**Toques finais da prévia (28/10).**

- **Sinopse sob demanda:** as listas (Explorar paginado, Minha Lista, Feed) não carregam a sinopse. Ao abrir, a prévia
  pede a sinopse (original e traduções guardadas) e os gêneros só daquela obra (`GET /api/catalog/preview?work=<chave>`,
  pública, com limite por IP). Antes, a prévia dessas listas saía sem sinopse.
- **Anime vizinho:** com a prévia presa, ← → passam ao anime anterior ou seguinte da página, na ordem em que aparecem.
  Na gaveta do celular, os botões ‹ › fazem o mesmo e se apagam nas pontas. Setas dentro de um campo (o seletor de
  andamento) continuam sendo do campo. Os itens que abrem a prévia são marcados com `data-work-trigger`.
- **Gaveta que arrasta:** no celular, arrastar a gaveta para baixo fecha a prévia. Ela só escuta toques depois da
  primeira abertura.
- **Cartão que cabe:** quando a sinopse chega depois de aberto, o cartão do computador se reposiciona para continuar
  inteiro na tela.
- **Feed e publicações do perfil:** o nome da obra numa publicação abre a prévia, com "Ver página da obra" e a
  comunidade dela, em vez de tirar a pessoa do Feed.
- **Spec 135** cobre a rota, a sinopse no Explorar e no Feed, ← →, ‹ › e o arraste.

## Desempenho no celular (28/10)

**Como foi medido.** Um spec temporário semeou um volume realista no banco de teste: 3.000 obras, 300 episódios na
semana, 80 obras na lista e 150 publicações. Cada página foi aberta como num celular médio: tela de 375 px, CPU 4×
mais lenta e rede de 1,6 Mbps com 150 ms de latência. O spec anotou tamanhos, chamadas e tempos, e apagou tudo no
fim. O bloqueio da CPU (TBT) variou de 470 a 1.160 ms entre rodadas iguais nesta máquina e não serve de régua. O
tempo até o conteúdo e os bytes são estáveis.

| página | pronto (antes → depois) | maior pintura (LCP) | dados das APIs |
|---|---|---|---|
| Explorar | 5,3 → 4,4 s | 3,9 → 1,8 s | 144 → 75 KB |
| Calendário | 5,8 → 3,9 s | 2,8 → 1,7 s | 340 → 107 KB |
| Feed | 4,3 → 4,2 s | 2,9 → 1,7 s | 370 → 50 KB |
| Dashboard | 3,1 → 2,5 s | 2,8 → 1,7 s | 378 → 67 KB |
| Perfil | 3,4 → 2,8 s | 3,1 → 1,9 s | 15 → 14 KB |
| Minha Lista | 3,2 → 2,6 s | 2,9 → 1,9 s | — |
| Página da obra | 3,4 → 2,9 s | 3,0 → 1,8 s | — |
| Temporada | 3,7 → 2,6 s | 3,2 → 1,7 s | 43 → 42 KB |

**O que pesava e o que mudou:**

- **Fontes:** a Noto Sans JP, com três pesos listados um a um, virava 372 `@font-face` num CSS de 100 KB que travava
  a primeira pintura de toda página. Ela e a Inter passaram a ser variáveis (um arquivo cobre os pesos). A japonesa
  não é mais pré-carregada, porque só os títulos em japonês a usam. O CSS caiu de 106 para 39 KB e as fontes
  pré-carregadas de 87 para 60 KB.
- **Quem está olhando vem com a página:** a pessoa logada só era descoberta no navegador (`/api/auth/me`), e toda tela
  que depende dela esperava essa resposta para pedir os próprios dados. O RootLayout lê a sessão e entrega o usuário
  ao `CurrentUserProvider`. Isso tira uma ida e volta de cada página e o cabeçalho não pisca mais "deslogado". Ao
  navegar, o provider continua conferindo a sessão, mas mantém o mesmo objeto quando nada mudou, para as telas que
  dependem de `user` não buscarem tudo de novo. Feed, calendário, Dashboard, Explorar e Configurações deixam de ser
  estáticas: custa uma leitura de sessão por página.
- **Agenda sem sinopses:** `/api/calendar` mandava a sinopse (e as traduções guardadas) de cada episódio da semana. A
  prévia pede só a da obra aberta (`/api/catalog/preview`, que agora prefere a sinopse da lista da pessoa e usa a da
  agenda para obra só do calendário). `?mine=1` devolve só os episódios da lista, sem o resto da semana nem o "fora da
  grade". Dashboard e lateral do Feed usam esse modo, já que só mostram a lista.
- **Chamadas em dobro:** o Explorar buscava as fileiras duas vezes ao abrir (antes e depois de saber quem está
  logado). O sino e o Dashboard pediam os avisos ao mesmo tempo e agora dividem a mesma resposta
  (`src/lib/notificationsClient.ts`).
- **Sem vazamento:** 20 navegações seguidas na mesma aba mantêm a memória em cerca de 7,5 MB.

**O que fica de fora:** o JavaScript inicial (cerca de 300 KB comprimidos) é quase todo React, Next e MUI. No Explorar,
as fileiras só aparecem depois que o JavaScript monta e a busca volta; o próximo ganho seria renderizar as fileiras no
servidor, uma reestruturação maior.

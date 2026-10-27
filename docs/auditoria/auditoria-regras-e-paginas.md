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

# Lotes de pesquisa de reboots e arcos (Epic 48)

Cada arquivo de `loots/` é um **lote**: o resultado de pesquisar, par por par, se duas obras são o mesmo enredo refeito do zero
(reboot) e, opcionalmente, os arcos de cada uma. Aplica-se em Admin → Curadoria → **Reboots e arcos** (colando o JSON) ou por
`POST /api/admin/story`. O lote é validado inteiro antes de gravar e pode ser reaplicado sem duplicar.

```json
{
  "loot": "reboots-003",
  "items": [
    {
      "a": 136, "b": 11061,
      "verdict": "REBOOT",
      "source": "https://en.wikipedia.org/wiki/List_of_Hunter_%C3%97_Hunter_(2011_TV_series)_episodes",
      "note": "texto que aparece na descrição das duas obras",
      "reboot": { "old": 136, "new": 11061, "coverage": "PARTIAL", "beyondFromEpisode": 76 },
      "arcs": [
        { "anilistId": 11061, "list": [{ "nameEn": "Hunter Exam", "namePt": "Exame Hunter", "start": 1, "end": 26 }] }
      ]
    },
    { "a": 603, "b": 1534, "verdict": "NOT_REBOOT", "note": "séries independentes da mesma franquia" }
  ]
}
```

Para cadastrar só os arcos de uma obra (sem par), use `arcs` no topo do lote, no lugar de `items` (ou junto dele):

```json
{ "loot": "arcos-002", "arcs": [{ "anilistId": 20, "source": "https://…", "list": [{ "nameEn": "Prologue", "start": 1, "end": 5 }] }] }
```

Regras (o que a validação recusa):

- `loot`: nome do lote, minúsculas, números, ponto e hífen (3 a 41 caracteres); no máximo 100 pares por lote.
- `a` e `b`: ids da AniList de obras que estão no catálogo; o mesmo par não aparece duas vezes.
- `verdict` `REBOOT` exige `reboot { old, new, coverage }` com as duas obras do par; `NOT_REBOOT` não leva `reboot` (e desfaz o
  vínculo que um lote anterior tivesse feito).
- O reboot é **sempre a versão mais atual**: `reboot.new` não pode ter estreado antes de `reboot.old` (a validação recusa).
- `coverage` `FULL`: o reboot conta a mesma história. `PARTIAL`: vai além do que a versão antiga cobriu e **exige**
  `beyondFromEpisode`, o episódio **do reboot** (dentro dos episódios dele) em que isso começa.
- `arcs`: por obra, de 1 a 40 arcos em ordem, sem sobreposição, com `start ≤ end` e dentro do número de episódios da obra.
  `nameEn` é obrigatório; `namePt` e `nameJa` são opcionais.

Como pesquisar: confirme em uma fonte (lista de episódios da Wikipédia, artigo da obra) se o segundo cadastro refaz a história
desde o começo, quanto cada versão cobre e onde estão os arcos; cite a fonte em `source`. A fila do que falta pesquisar aparece no
próprio painel (os pares ligados como "versão alternativa" ainda sem veredito, e as séries longas sem arcos).

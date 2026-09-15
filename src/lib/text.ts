/**
 * Só decide se um texto conta como "vazio" pra fins de validação — não
 * limpa o texto que de fato é gravado. Caracteres de formatação Unicode
 * (zero-width space, BOM, marcas direcionais etc., categoria `Cf`) não
 * contam como conteúdo de verdade aqui, mas continuam preservados no
 * valor salvo — alguns têm função real em certos scripts (ex. ZWJ em
 * devanagari/árabe), não é seguro removê-los do texto gravado, só da
 * checagem de "isso está vazio?".
 *
 * Achado real da 11ª rodada de auditoria (Epic 18): `.trim()` sozinho não
 * rejeita um texto só de zero-width space — o JS considera isso uma
 * string não-vazia de verdade, e em src/lib/titlePreference.tsx um
 * `titlePortuguese` assim "vencia" o fallback pro romaji/inglês
 * (`a || b || c`), deixando o <h1> da página em branco.
 */
export function isBlank(value: string): boolean {
  return value.replace(/\p{Cf}/gu, "").trim().length === 0;
}

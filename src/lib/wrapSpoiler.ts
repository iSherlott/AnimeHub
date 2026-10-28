/**
 * Esconde como spoiler o trecho selecionado num campo de texto: embrulha a seleção em `||…||`. Sem seleção, deixa
 * `||||` com o cursor no meio, para a pessoa escrever o trecho. Devolve o texto novo e onde fica o cursor.
 */
export function wrapSpoilerSelection(value: string, start: number, end: number, max: number): { value: string; caretStart: number; caretEnd: number } | null {
  const selected = value.slice(start, end);
  const next = `${value.slice(0, start)}||${selected}||${value.slice(end)}`;
  if (next.length > max) return null;
  return selected ? { value: next, caretStart: start + 2, caretEnd: end + 2 } : { value: next, caretStart: start + 2, caretEnd: start + 2 };
}

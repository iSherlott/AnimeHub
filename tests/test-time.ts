/**
 * Meio-dia de HOJE em America/Sao_Paulo (fuso padrão do app e do
 * playwright.config), independente do fuso da máquina — o runner de CI é UTC.
 * O Brasil não tem horário de verão desde 2019, então São Paulo é UTC-3 o ano todo.
 */
export function todayAtNoonSaoPaulo(): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
}

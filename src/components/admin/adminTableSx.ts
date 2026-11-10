/** A tabela de Usuários rola na horizontal no mobile pra caber Desde/Ações
 * — sem fixar a 1ª coluna, rolar até "Resetar senha" (ação que derruba
 * sessões da pessoa) tira "Nome" de vista por completo, deixando quem
 * administra sem saber em qual usuário está prestes a clicar (achado real
 * da 7ª rodada de auditoria, Epic 18). `bgcolor` opaco é necessário pra não
 * deixar o resto da linha "vazar" por baixo da coluna fixa ao rolar. */
export const STICKY_NAME_CELL_SX = {
  position: "sticky",
  left: 0,
  bgcolor: "background.paper",
  zIndex: 1,
} as const;

/**
 * Papéis e permissões da administração (Fase 9, decisão D6). Menor privilégio:
 *  - ADMIN: tudo, inclusive convites, usuários e papéis;
 *  - CURATOR: o catálogo (obras, episódios, calendário, importações, curadoria, taxonomia, traduções, jobs, quizzes);
 *  - MODERATOR: denúncias e moderação de conteúdo da comunidade;
 *  - MEMBER: nenhuma área administrativa.
 * A verificação acontece sempre no servidor (`requireStaff` nas APIs, `requireAdminPage` nas páginas). Ninguém ganha papel
 * elevado sozinho: só um ADMIN muda papéis, e a primeira conta do sistema é a única promovida automaticamente.
 */
export const ROLES = ["ADMIN", "CURATOR", "MODERATOR", "MEMBER"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = { ADMIN: "Administrador", CURATOR: "Curador", MODERATOR: "Moderador", MEMBER: "Membro" };

export const PERMISSIONS = ["catalog", "moderation", "admin"] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const PERMISSION_LABELS: Record<Permission, string> = { catalog: "Catálogo", moderation: "Moderação", admin: "Administração (usuários, convites e papéis)" };

const GRANTS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  CURATOR: ["catalog"],
  MODERATOR: ["moderation"],
  MEMBER: [],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  return isRole(role) && GRANTS[role].includes(permission);
}

/** Tem alguma área administrativa. */
export function isStaff(role: string | null | undefined): boolean {
  return isRole(role) && GRANTS[role].length > 0;
}

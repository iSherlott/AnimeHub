/**
 * O AnimeHub é fechado: as contas são criadas pela administração e quem não entrou só vê o catálogo — Explorar,
 * Calendário, Temporada e a página de cada obra (mais o login). Feed, Meus animes, Comunidades, perfis, amigos e o resto
 * da parte social pedem login. Esta lista é usada pelo `proxy.ts` (redireciona antes de a página abrir), pelo menu (não
 * mostra o que a pessoa não pode abrir) e pelo `CurrentUserProvider` (sessão que expirou com a página aberta).
 */
const PUBLIC_PREFIXES = ["/discover", "/calendar", "/temporada/", "/anime/", "/login"];

/** Página da obra é pública; o quiz da obra é da comunidade. */
const PUBLIC_EXCEPTIONS_PRIVATE = [/^\/obra\/[^/]+\/quiz(\/|$)/];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXCEPTIONS_PRIVATE.some((re) => re.test(pathname))) return false;
  if (pathname.startsWith("/obra/")) return true;
  return PUBLIC_PREFIXES.some((prefix) => (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

/** Página que só abre para quem entrou (o resto da parte de cima do site; o /admin tem a própria verificação de papel). */
export function isMemberOnlyPath(pathname: string): boolean {
  return !pathname.startsWith("/admin") && !pathname.startsWith("/api/") && !isPublicPath(pathname);
}

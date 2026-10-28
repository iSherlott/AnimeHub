import { NextResponse, type NextRequest } from "next/server";
import { isMemberOnlyPath } from "@/lib/memberOnly";
import { SESSION_COOKIE } from "@/lib/auth/cookieName";

/**
 * Sistema fechado: quem não entrou e abre uma página só de quem tem conta (Feed, Meus animes, Comunidades, perfis…) vai
 * para o login, que devolve a pessoa a essa página depois. Aqui só se olha se existe o cookie de sessão — a validade
 * dele é conferida pelas páginas e APIs (e o `CurrentUserProvider` manda ao login quem tiver a sessão vencida).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isMemberOnlyPath(pathname) || request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Só páginas: sem APIs, arquivos do Next, imagens e arquivos com extensão.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};

/**
 * O cookie de sessão só vai por HTTPS em produção. Quando o app roda em produção mas é aberto por HTTP (um servidor na
 * rede local, sem proxy com certificado), o navegador descarta um cookie "secure" e ninguém consegue entrar:
 * `SESSION_COOKIE_SECURE=false` desliga a exigência de propósito; `true` a liga em qualquer ambiente.
 */
export function sessionCookieSecure(env: Record<string, string | undefined> = process.env): boolean {
  if (env.SESSION_COOKIE_SECURE === "true") return true;
  if (env.SESSION_COOKIE_SECURE === "false") return false;
  return env.NODE_ENV === "production";
}

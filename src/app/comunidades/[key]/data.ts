import { cache } from "react";
import { permanentRedirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { findCommunity, isMember, scopeForKey } from "@/lib/community";

/**
 * Dados da comunidade compartilhados entre o layout (as três colunas) e as páginas, numa só consulta por requisição.
 * O endereço canônico é o da franquia: `canonical` redireciona `/comunidades/<outra obra>/…` para ele.
 */
export const getScope = cache(async (key: string) => scopeForKey(key));
export const getCommunity = cache(async (key: string) => {
  const scope = await getScope(key);
  return scope ? findCommunity(scope) : null;
});
export const getViewer = cache(async (key: string) => {
  const [user, community] = await Promise.all([getCurrentUser(), getCommunity(key)]);
  return { user, member: await isMember(community?.id ?? null, user?.id ?? null) };
});

export async function canonical(key: string, suffix = ""): Promise<void> {
  const scope = await getScope(key);
  if (scope && scope.key !== key) permanentRedirect(`/comunidades/${scope.key}${suffix}`);
}

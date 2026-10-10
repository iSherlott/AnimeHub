import { LinkButton } from "@/components/LinkButton";
import { publishHref } from "@/lib/publishLinks";

/**
 * "+ Publicar sobre este anime" (Figma `13:42397`, fluxo B): leva ao editor
 * "Nova publicação" com a produção PRÉ-SELECIONADA (não cria acompanhamento
 * nem post automático). Visitante é levado ao login pelo próprio editor, que
 * volta com destino e rascunho preservados.
 */
export function PublishAboutButton({ anilistId }: { anilistId: number; loggedIn?: boolean }) {
  return (
    <LinkButton href={publishHref({ anilistId })} variant="contained" data-testid="publish-about">
      + Publicar sobre este anime
    </LinkButton>
  );
}

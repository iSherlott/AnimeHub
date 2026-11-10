import { Box } from "@mui/material";
import { AppLink } from "@/components/AppLink";
import { parseTwitterLinks, twitterLanguageLabel } from "@/lib/twitterLinks";

/**
 * O X (antigo Twitter) oficial da obra na ficha: "@kusuriya_PR ↗" (e a conta em inglês, quando há, com a língua). Sem
 * nenhuma conta, nada (a ficha esconde a linha vazia).
 */
export function WorkTwitterLinks({ json }: { json: string | null | undefined }) {
  const links = parseTwitterLinks(json);
  if (links.length === 0) return null;
  return (
    <Box component="span" sx={{ display: "inline-flex", flexWrap: "wrap", columnGap: 1.5, rowGap: 0.25 }}>
      {links.map((link) => {
        const language = twitterLanguageLabel(link.language);
        return (
          <AppLink key={link.handle} href={link.url} target="_blank" rel="noopener noreferrer" underline="hover" data-testid="work-twitter" aria-label={`X oficial: @${link.handle}${language ? ` (${language})` : ""}`}>
            @{link.handle}
            {language ? ` (${language})` : ""} ↗
          </AppLink>
        );
      })}
    </Box>
  );
}

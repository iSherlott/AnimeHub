import NextLink from "next/link";
import { Link as MuiLink } from "@mui/material";
import { splitBodyByHashtags } from "@/lib/hashtags";

/**
 * Texto de uma publicação com as hashtags como LINKS para a página da
 * hashtag (fluxo A, Figma `13:44169`). Só texto + links: nada de HTML do
 * autor. A cor herda do contexto (o bloco só-texto do card usa branco).
 */
export function PostBodyText({ text }: { text: string }) {
  return (
    <>
      {splitBodyByHashtags(text).map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.value}</span>
        ) : (
          <MuiLink
            key={i}
            component={NextLink}
            href={`/hashtag/${encodeURIComponent(segment.key)}`}
            underline="always"
            color="inherit"
            data-testid="hashtag-link"
            sx={{ fontWeight: 700 }}
          >
            {segment.value}
          </MuiLink>
        )
      )}
    </>
  );
}

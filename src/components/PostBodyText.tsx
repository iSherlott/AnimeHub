"use client";

import NextLink from "next/link";
import { Link as MuiLink } from "@mui/material";
import { splitBodyByHashtags } from "@/lib/hashtags";
import { SpoilerRichText } from "@/components/Spoiler";

/** Só https; a pontuação final da frase não entra no link. */
const URL_PATTERN = /(https:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g;

function TextWithLinks({ value }: { value: string }) {
  return (
    <>
      {value.split(URL_PATTERN).map((part, i) =>
        i % 2 === 1 ? (
          <MuiLink key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" underline="always" color="inherit" data-testid="post-link">
            {part}
          </MuiLink>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function TextWithHashtags({ value }: { value: string }) {
  return (
    <>
      {splitBodyByHashtags(value).map((segment, i) =>
        segment.type === "text" ? (
          <TextWithLinks key={i} value={segment.value} />
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

/**
 * Texto de uma publicação com as hashtags como LINKS para a página da
 * hashtag (fluxo A, Figma `13:44169`). Só texto + links: nada de HTML do
 * autor. A cor herda do contexto (o bloco só-texto do card usa branco).
 * Trechos entre `||barras duplas||` são spoiler: ficam cobertos até a pessoa tocar (`spoilerLabel` diz de qual obra);
 * hashtag de dentro deles não vira link (nem é contada pelo servidor), para não revelar o trecho.
 */
export function PostBodyText({ text, spoilerLabel = "Spoiler" }: { text: string; spoilerLabel?: string }) {
  return <SpoilerRichText text={text} label={spoilerLabel} renderText={(value, key) => <TextWithHashtags key={key} value={value} />} />;
}

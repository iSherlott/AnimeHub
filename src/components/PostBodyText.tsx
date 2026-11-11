"use client";

import NextLink from "next/link";
import { Link as MuiLink } from "@mui/material";
import { splitBodyByHashtags } from "@/lib/hashtags";
import { SpoilerRichText } from "@/components/Spoiler";
import { splitMentions } from "@/lib/mentionText";

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
          <TextWithMentions key={i} value={part} />
        )
      )}
    </>
  );
}

/**
 * `@handle` vira link para o perfil (12/11/2026); o resto fica como texto. Link comum (não o do Next): o `/u/<@>` só
 * redireciona para `/users/<id>`, e a navegação interna do Next não seguia esse redirecionamento.
 */
export function TextWithMentions({ value }: { value: string }) {
  return (
    <>
      {splitMentions(value).map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.value}</span>
        ) : (
          <MuiLink key={i} href={`/u/${segment.handle}`} underline="hover" color="secondary" data-testid="mention-link" sx={{ fontWeight: 700 }}>
            {segment.value}
          </MuiLink>
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

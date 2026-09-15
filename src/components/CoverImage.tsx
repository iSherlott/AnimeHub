"use client";

import { useState } from "react";
import Image from "next/image";
import { Box } from "@mui/material";

/**
 * Wrapper client-only pro <Image> de capa em páginas server component, tipo
 * anime/[id]. Uma URL de capa que 404 (dado sujo vindo de fonte externa)
 * renderizava o ícone quebrado cru do navegador — achado real da 6ª rodada
 * de auditoria, Epic 18. Mesmo padrão de AnimeCard/RecommendationCard.
 */
export function CoverImage({
  src,
  sizes,
}: {
  src: string;
  sizes: string;
}) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return <Box sx={{ height: "100%", width: "100%", bgcolor: "background.paper" }} />;
  }

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      style={{ objectFit: "cover" }}
      onError={() => setBroken(true)}
    />
  );
}

/** Mesma ideia de CoverImage, mas pro banner de fundo (largura toda, com a
 * opacidade reduzida que o banner usa). `sizes="100vw"` é necessário mesmo
 * pra imagem já full-width: sem ele o Next.js só gera um srcset limitado
 * (1x/2x) em vez do srcset responsivo completo, e ainda emite aviso no
 * console em dev — mesmo achado de AnimeInfoModal/HeroBanner (achado real
 * da 12ª/13ª rodadas de auditoria, Epic 18). */
export function BackdropImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return <Box sx={{ height: "100%", width: "100%", bgcolor: "background.paper" }} />;
  }

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes="100vw"
      style={{ objectFit: "cover", opacity: 0.4 }}
      onError={() => setBroken(true)}
    />
  );
}

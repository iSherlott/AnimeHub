import type { MetadataRoute } from "next";

/**
 * Site instalável (10/11/2026): "Adicionar à tela inicial" abre o AnimeHub em tela cheia, com o ícone da marca. Sem
 * avisos no celular (push): eles pedem HTTPS, e o site roda em http na rede de casa.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anime Hub",
    short_name: "Anime Hub",
    description: "Seu catálogo de animes, calendário de lançamentos e a rede dos seus amigos.",
    lang: "pt-BR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08080b",
    theme_color: "#08080b",
    categories: ["entertainment", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Calendário", url: "/calendar" },
      { name: "Meus animes", url: "/minha-lista" },
      { name: "Feed", url: "/" },
    ],
  };
}

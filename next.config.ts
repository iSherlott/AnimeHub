import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empacota só o necessário pra rodar em produção (usado pela imagem
  // Docker) — evita levar node_modules/devDependencies inteiros pro runner.
  // Só a build da imagem Docker liga isso (ver Dockerfile): dev local e a
  // suíte Playwright usam `next start` normal, que não roda a partir do
  // output standalone.
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
      {
        protocol: "https",
        hostname: "media.kitsu.io",
      },
      {
        protocol: "https",
        hostname: "media.kitsu.app",
      },
    ],
  },
};

export default nextConfig;

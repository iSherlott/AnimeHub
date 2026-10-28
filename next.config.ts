import type { NextConfig } from "next";

// Cabeçalhos de segurança (GAP-S-07). 'unsafe-inline' em script/style é
// necessário hoje (hidratação inline do Next e estilos do MUI/emotion); a
// próxima rodada pode migrar para nonce via proxy. `img-src https:` porque
// posts ainda aceitam URL de imagem externa (D-15 pendente).
const isDev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Quem abre o servidor de desenvolvimento por outro endereço que não seja localhost: a rede local (192.168.1.x) e o nome
  // DDNS da máquina. Sem isso o Next bloqueia os recursos internos do modo dev (HMR) para essas origens.
  allowedDevOrigins: ["192.168.1.*", "sherlott.ddns.net"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Sistema fechado: não existe mais cadastro aberto (as contas são criadas pelo admin). Endereços antigos vão ao login.
  async redirects() {
    return [{ source: "/signup", destination: "/login", permanent: false }];
  },
  // Empacota só o necessário pra rodar em produção (usado pela imagem
  // Docker) — evita levar node_modules/devDependencies inteiros pro runner.
  // Só a build da imagem Docker liga isso (ver Dockerfile): dev local e a
  // suíte Playwright usam `next start` normal, que não roda a partir do
  // output standalone.
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,
  // Na imagem Docker, a checagem de tipos do build olha só o código do site (tsconfig.build.json, sem os testes): com os
  // ~150 specs do Playwright ela passava de 2 GB e estourava a memória do Node no servidor (deploy de 28/10). Os testes
  // continuam checados no Windows (tsc com o tsconfig.json inteiro) antes de cada push.
  typescript: { tsconfigPath: process.env.NEXT_STANDALONE === "true" ? "tsconfig.build.json" : "tsconfig.json" },
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
      // Capas das obras que só existem no AniDB (importação do HTML da temporada).
      {
        protocol: "https",
        hostname: "cdn.anidb.net",
      },
      {
        protocol: "https",
        hostname: "media.kitsu.app",
      },
    ],
  },
};

export default nextConfig;

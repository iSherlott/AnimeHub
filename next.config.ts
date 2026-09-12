import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

import type { NextConfig } from "next";

// Tarayıcı API'ye her zaman aynı adresten (/api/v1) gider.
// - Varsayılan (tek Vercel projesi): NestJS API'si src/pages/api/v1/[...path].ts içinde aynı projede çalışır.
// - API_ORIGIN verilirse istekler ayrı bir API sunucusuna aktarılır (ör. Docker/Railway).
const apiOrigin = process.env.API_ORIGIN?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@lean/shared"],
  // API paketi derlenmiş haliyle (Nest dekoratör metadatası korunarak) çalışma anında yüklenir
  serverExternalPackages: ["@lean/api"],
  reactStrictMode: true,
  // Sunucu kodunu küçültme: Nest hata kayıtlarında sınıf adları okunur kalsın
  experimental: { serverMinification: false },
  async rewrites() {
    return {
      beforeFiles: apiOrigin ? [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

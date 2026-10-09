import type { NextConfig } from "next";

// Yayında web ve API ayrı sunuculardadır (ör. Vercel + Railway). API_ORIGIN verilirse
// tarayıcı /api/v1 isteklerini aynı adrese yapar, Next bunları API'ye aktarır (CORS gerekmez).
const apiOrigin = process.env.API_ORIGIN?.replace(/\/$/, "");
if (!apiOrigin && process.env.VERCEL) {
  console.warn("[lean] API_ORIGIN tanımlı değil: /api/v1 istekleri API'ye aktarılamaz, giriş çalışmaz.");
}

const nextConfig: NextConfig = {
  transpilePackages: ["@lean/shared"],
  reactStrictMode: true,
  async rewrites() {
    return apiOrigin ? [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }] : [];
  },
};

export default nextConfig;

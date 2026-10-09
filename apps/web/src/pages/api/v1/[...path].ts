import type { IncomingMessage, ServerResponse } from "http";

/**
 * Tek Vercel projesi kurulumu: NestJS API'si bu Next.js API yolu üzerinden aynı projede çalışır.
 * (API_ORIGIN tanımlıysa istekler next.config.ts'teki rewrite ile ayrı API sunucusuna gider ve bu dosya kullanılmaz.)
 * Gövde ayrıştırma kapalı: istekler (dosya yüklemeleri dahil) olduğu gibi Express'e aktarılır.
 */
export const config = {
  api: { bodyParser: false, externalResolver: true, responseLimit: false },
};

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const mod = (await import("@lean/api/serverless")) as { default: Handler };
  await mod.default(req, res);
}

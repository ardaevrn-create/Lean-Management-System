import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'http';
import { dirname, join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

// Vercel dosya izleyicisi (nft) için ipucu: Rust'sız Prisma istemcisinin çalışma anında okuduğu
// WASM dosyası koddan statik olarak gerekmez; bu yol ifadesi dosyanın fonksiyon paketine girmesini sağlar.
// Paketleyiciler (ör. Turbopack) require.resolve'u modül numarasına çevirebilir; bu durumda ipucu yok sayılır.
export function prismaQueryCompilerPath(): string | undefined {
  const resolved: unknown = require.resolve('@prisma/client');
  return typeof resolved === 'string'
    ? join(dirname(require.resolve('@prisma/client')), '../../.prisma/client/query_compiler_bg.wasm')
    : undefined;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let instance: Promise<Handler> | undefined;

async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  setupApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance();
}

/** Vercel fonksiyonu giriş noktası: Nest uygulaması soğuk başlangıçta bir kez kurulur ve yeniden kullanılır. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  instance ??= bootstrap().catch((err) => {
    instance = undefined;
    throw err;
  });
  const app = await instance;
  app(req, res);
}

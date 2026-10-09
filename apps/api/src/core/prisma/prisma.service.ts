import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { RequestContext } from '../../common/request-context';
import { tenantExtension } from './tenant-extension';

/** Rust'sız Prisma istemcisi pg sürücü adaptörüyle çalışır (sunucusuz ortamlarla uyumlu). */
export function createPrismaClient(url = process.env.DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

function createScopedClient(base: PrismaClient, ctx: RequestContext) {
  return base.$extends(tenantExtension(() => ctx.optionalTenantId));
}
export type TenantDb = ReturnType<typeof createScopedClient>;
/** $transaction içindeki istemci tipi */
export type TenantTx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Tenant filtresi OLMAYAN istemci. Yalnız auth, platform ve zamanlanmış işler için. */
  readonly raw = createPrismaClient();
  /** Tenant izolasyonlu istemci. Servislerde varsayılan olarak bunu kullanın. */
  readonly db: TenantDb;

  constructor(ctx: RequestContext) {
    this.db = createScopedClient(this.raw, ctx);
  }

  async onModuleInit() {
    await this.raw.$connect();
  }

  async onModuleDestroy() {
    await this.raw.$disconnect();
  }
}

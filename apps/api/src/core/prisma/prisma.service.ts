import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContext } from '../../common/request-context';
import { tenantExtension } from './tenant-extension';

function createScopedClient(base: PrismaClient, ctx: RequestContext) {
  return base.$extends(tenantExtension(() => ctx.optionalTenantId));
}
export type TenantDb = ReturnType<typeof createScopedClient>;
/** $transaction içindeki istemci tipi */
export type TenantTx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Tenant filtresi OLMAYAN istemci. Yalnız auth, platform ve zamanlanmış işler için. */
  readonly raw = new PrismaClient();
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

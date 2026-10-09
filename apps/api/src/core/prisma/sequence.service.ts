import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/request-context';
import { PrismaService, TenantTx } from './prisma.service';

/** Şirket bazlı artan numara (aksiyon no, DÖF no...). */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext) {}

  async next(name: string, tx?: TenantTx): Promise<number> {
    const client = tx ?? this.prisma.db;
    const tenantId = this.ctx.tenantId;
    const seq = await client.sequence.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, name, value: 1 },
      update: { value: { increment: 1 } },
    });
    return seq.value;
  }
}

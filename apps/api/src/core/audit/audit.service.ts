import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** Kalite sistemi kayıt gerekliliği: kim, ne zaman, neyi değiştirdi. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext) {}

  async log(entity: string, entityId: string, action: string, diff?: unknown) {
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: this.ctx.tenantId,
        userId: this.ctx.optionalUser?.id ?? null,
        entity,
        entityId,
        action,
        diff: diff === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(diff)) as Prisma.InputJsonValue),
      },
    });
  }

  /** İki nesne arasındaki değişen alanlar: { alan: [eski, yeni] } */
  static diff(before: object, after: object): Record<string, [unknown, unknown]> {
    const changes: Record<string, [unknown, unknown]> = {};
    const prev = before as Record<string, unknown>;
    for (const [key, b] of Object.entries(after)) {
      const a = prev[key];
      if (b !== undefined && JSON.stringify(a) !== JSON.stringify(b)) changes[key] = [a, b];
    }
    return changes;
  }
}

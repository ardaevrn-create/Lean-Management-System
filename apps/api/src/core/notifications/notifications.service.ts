import { Injectable } from '@nestjs/common';
import type { NotificationType } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  /** Web uygulamasında açılacak yol, ör. /actions/abc */
  link?: string;
  /** Aynı anahtarla kullanıcıya ikinci kez bildirim gönderilmez */
  dedupeKey?: string;
  /** E-posta da gönderilsin mi (varsayılan: evet) */
  email?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly mail: MailService,
  ) {}

  /** Bildirim oluşturur; işlemi yapan kullanıcının kendisine bildirim gönderilmez. */
  async notify(input: NotifyInput): Promise<number> {
    const actorId = this.ctx.optionalUser?.id;
    const userIds = [...new Set(input.userIds)].filter((id) => id && id !== actorId);
    if (!userIds.length) return 0;
    const tenantId = this.ctx.tenantId;

    const result = await this.prisma.db.notification.createManyAndReturn({
      data: userIds.map((userId) => ({
        tenantId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })),
      skipDuplicates: true,
      select: { id: true, userId: true },
    });

    if (input.email !== false && result.length) {
      const users = await this.prisma.db.user.findMany({
        where: { id: { in: result.map((r) => r.userId) }, email: { not: null }, isActive: true },
        select: { email: true },
      });
      for (const u of users) {
        await this.mail.send({ to: u.email!, subject: input.title, text: input.body ?? input.title });
      }
    }
    return result.length;
  }
}

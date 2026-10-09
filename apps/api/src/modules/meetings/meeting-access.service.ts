import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface RightsSubject {
  organizerId: string;
  orgUnit?: { path: string } | null;
  type?: { facilitatorId: string | null } | null;
  participants: { userId: string }[];
}

const DEFAULT_TZ = 'Europe/Istanbul';
const TZ_TTL_MS = 5 * 60_000;

/** Toplantı görünürlüğü / yetki kuralları ve şirket saat dilimi. */
@Injectable()
export class MeetingAccessService {
  private readonly tzCache = new Map<string, { tz: string; at: number }>();

  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly access: AccessService) {}

  /** Şirketin saat dilimi (Tenant.timezone). */
  async timezone(): Promise<string> {
    const tenantId = this.ctx.tenantId;
    const hit = this.tzCache.get(tenantId);
    if (hit && Date.now() - hit.at < TZ_TTL_MS) return hit.tz;
    const tenant = await this.prisma.raw.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    let tz = tenant?.timezone || DEFAULT_TZ;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      tz = DEFAULT_TZ;
    }
    this.tzCache.set(tenantId, { tz, at: Date.now() });
    return tz;
  }

  /** Kullanıcının organizatörü, katılımcısı ya da tip kolaylaştırıcısı olduğu toplantılar. */
  mineWhere(userId = this.ctx.userId): Prisma.MeetingWhereInput {
    return {
      OR: [{ organizerId: userId }, { participants: { some: { userId } } }, { type: { facilitatorId: userId } }],
    };
  }

  /** Kullanıcının görebileceği toplantılar: kendi toplantıları + meeting.view/manage kapsamındaki birimler. */
  visibleWhere(): Prisma.MeetingWhereInput {
    const or: Prisma.MeetingWhereInput[] = [this.mineWhere()];
    for (const perm of [PERMISSIONS.MEETING_VIEW, PERMISSIONS.MEETING_MANAGE]) {
      const paths = this.access.scopePaths(perm);
      if (paths === null) return {};
      if (paths.length) or.push({ orgUnit: { OR: paths.map((p) => ({ path: { startsWith: p } })) } });
    }
    return { OR: or };
  }

  /** Bir toplantı üzerindeki kullanıcı hakları (kilit durumu hariç). */
  rights(row: RightsSubject) {
    const userId = this.ctx.userId;
    const path = row.orgUnit?.path ?? null;
    const isOrganizer = row.organizerId === userId;
    const isFacilitator = !!row.type?.facilitatorId && row.type.facilitatorId === userId;
    const isParticipant = row.participants.some((p) => p.userId === userId);
    const manage = this.access.has(PERMISSIONS.MEETING_MANAGE) && this.access.inScope(PERMISSIONS.MEETING_MANAGE, path);
    const scopedView =
      (this.access.has(PERMISSIONS.MEETING_VIEW) && this.access.inScope(PERMISSIONS.MEETING_VIEW, path)) || manage;
    return {
      isOrganizer,
      isFacilitator,
      isParticipant,
      manage,
      /** Toplantıyı yönetebilir / yürütebilir (organizatör, kolaylaştırıcı veya meeting.manage) */
      run: isOrganizer || isFacilitator || manage,
      view: isOrganizer || isFacilitator || isParticipant || scopedView,
    };
  }
}

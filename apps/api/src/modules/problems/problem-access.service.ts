import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';

export interface ProblemRightsSubject {
  ownerId: string;
  reportedById: string;
  orgUnit?: { path: string } | null;
  members: { userId: string }[];
}

/** Problem görünürlüğü / yetki kuralları. */
@Injectable()
export class ProblemAccessService {
  constructor(private readonly ctx: RequestContext, private readonly access: AccessService) {}

  /** Kullanıcının sahibi, ekip üyesi ya da bildiren olduğu problemler. */
  mineWhere(userId = this.ctx.userId): Prisma.ProblemWhereInput {
    return { OR: [{ ownerId: userId }, { reportedById: userId }, { members: { some: { userId } } }] };
  }

  /** Sahip veya ekip üyesi olunan problemler (pano / "benim açık problemlerim"). */
  workingOnWhere(userId = this.ctx.userId): Prisma.ProblemWhereInput {
    return { OR: [{ ownerId: userId }, { members: { some: { userId } } }] };
  }

  /** Görülebilecek problemler: kendi problemleri + problem.view / problem.manage kapsamındaki birimler. */
  visibleWhere(): Prisma.ProblemWhereInput {
    const or: Prisma.ProblemWhereInput[] = [this.mineWhere()];
    for (const perm of [PERMISSIONS.PROBLEM_VIEW, PERMISSIONS.PROBLEM_MANAGE]) {
      const paths = this.access.scopePaths(perm);
      if (paths === null) return {};
      if (paths.length) or.push({ orgUnit: { OR: paths.map((p) => ({ path: { startsWith: p } })) } });
    }
    return { OR: or };
  }

  rights(row: ProblemRightsSubject) {
    const userId = this.ctx.userId;
    const path = row.orgUnit?.path ?? null;
    const isOwner = row.ownerId === userId;
    const isReporter = row.reportedById === userId;
    const isMember = row.members.some((m) => m.userId === userId);
    const manage = this.access.has(PERMISSIONS.PROBLEM_MANAGE) && this.access.inScope(PERMISSIONS.PROBLEM_MANAGE, path);
    const scopedView = (this.access.has(PERMISSIONS.PROBLEM_VIEW) && this.access.inScope(PERMISSIONS.PROBLEM_VIEW, path)) || manage;
    return {
      isOwner, isReporter, isMember, manage,
      view: isOwner || isReporter || isMember || scopedView,
      /** Düzenleme ve (kapatma hariç) faz ilerletme */
      edit: isOwner || isMember || manage,
      /** Geri alma, kapatma, iptal */
      close: isOwner || manage,
    };
  }
}

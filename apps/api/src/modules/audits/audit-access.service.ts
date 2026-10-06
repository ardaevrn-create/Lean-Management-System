import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';

export interface AuditRightsSubject {
  auditorId: string;
  area: { responsibleId: string | null; orgUnit?: { path: string } | null };
}

/** Denetim modülü görünürlük ve yetki kuralları. */
@Injectable()
export class AuditAccessService {
  constructor(private readonly ctx: RequestContext, private readonly access: AccessService) {}

  /** audit.view / perform / manage izinlerinden en az birine sahip olmalı (şablon, plan okuma). */
  assertAnyPermission() {
    const has = [PERMISSIONS.AUDIT_VIEW, PERMISSIONS.AUDIT_PERFORM, PERMISSIONS.AUDIT_MANAGE].some((p) => this.access.has(p));
    if (!has) throw new ForbiddenException('Missing permission: audit.view');
  }

  /** Alanın birim yolu audit.manage kapsamında mı (izin yoksa false)? */
  canManage(orgUnitPath: string | null | undefined) {
    return this.access.has(PERMISSIONS.AUDIT_MANAGE) && this.access.inScope(PERMISSIONS.AUDIT_MANAGE, orgUnitPath);
  }

  assertManage(orgUnitPath: string | null | undefined) {
    if (!this.canManage(orgUnitPath)) throw new ForbiddenException('Out of audit.manage scope');
  }

  /** audit.view / manage kapsamı: null = tüm şirket; yoksa birim yolu koşulları (boş dizi = kapsam yok). */
  private scopeConditions(): Prisma.AuditAreaWhereInput[] | null {
    const or: Prisma.AuditAreaWhereInput[] = [];
    for (const perm of [PERMISSIONS.AUDIT_VIEW, PERMISSIONS.AUDIT_MANAGE]) {
      const paths = this.access.scopePaths(perm);
      if (paths === null) {
        if (this.access.has(perm)) return null;
        continue;
      }
      if (paths.length) or.push({ orgUnit: { OR: paths.map((p) => ({ path: { startsWith: p } })) } });
    }
    return or;
  }

  /** Görülebilir alanlar: audit.view/manage kapsamı + sorumlusu olunan alanlar. */
  visibleAreaWhere(): Prisma.AuditAreaWhereInput {
    const scope = this.scopeConditions();
    if (scope === null) return {};
    return { OR: [{ responsibleId: this.ctx.userId }, ...scope] };
  }

  /** Görülebilir denetimler: kendi denetimlerim + sorumlusu olduğum alanlar + kapsamdaki alanlar. */
  visibleAuditWhere(): Prisma.AuditWhereInput {
    if (this.scopeConditions() === null) return {};
    return { OR: [{ auditorId: this.ctx.userId }, { area: this.visibleAreaWhere() }] };
  }

  /** Görülebilir TPM etiketleri: açan, atanan, alan sorumlusu veya kapsam. */
  visibleTagWhere(): Prisma.AbnormalityTagWhereInput {
    if (this.scopeConditions() === null) return {};
    const userId = this.ctx.userId;
    return { OR: [{ openedById: userId }, { assignedToId: userId }, { area: this.visibleAreaWhere() }] };
  }

  rights(row: AuditRightsSubject) {
    const userId = this.ctx.userId;
    const path = row.area.orgUnit?.path ?? null;
    const isAuditor = row.auditorId === userId;
    const isResponsible = row.area.responsibleId === userId;
    const manage = this.canManage(path);
    const scopedView =
      (this.access.has(PERMISSIONS.AUDIT_VIEW) && this.access.inScope(PERMISSIONS.AUDIT_VIEW, path)) || manage;
    return {
      isAuditor,
      isResponsible,
      manage,
      perform: isAuditor && this.access.has(PERMISSIONS.AUDIT_PERFORM),
      view: isAuditor || isResponsible || scopedView,
    };
  }
}

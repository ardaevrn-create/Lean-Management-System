import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import type { RequestUser } from '../../common/request-user';
import { AccessService } from '../../core/auth/access.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { kpiInclude, type KpiRow } from './kpi-core';

/** KPI erişim kuralları: görüntüleme, tanım yönetimi, değer girişi, sapma onayı. */
@Injectable()
export class KpiAccessService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly access: AccessService) {}

  /**
   * Görünür KPI'lar: kpi.view kapsamındaki birimler + kullanıcının sahibi / veri giriş sorumlusu olduğu KPI'lar.
   */
  visibleWhere(user: RequestUser = this.ctx.user): Prisma.KpiDefinitionWhereInput {
    const or: Prisma.KpiDefinitionWhereInput[] = [{ ownerId: user.id }, { dataEntryUserId: user.id }];
    if (this.access.has(PERMISSIONS.KPI_VIEW, user)) {
      const filter = this.access.orgUnitFilter(PERMISSIONS.KPI_VIEW, user);
      if (filter === null) return {};
      if (filter.OR.length) or.push({ orgUnit: filter });
    }
    return { OR: or };
  }

  /** Kullanıcının değer girebileceği KPI'lar: sahibi/veri giriş sorumlusu ya da kpi.value.enter kapsamı. */
  enterableWhere(user: RequestUser = this.ctx.user): Prisma.KpiDefinitionWhereInput {
    const or: Prisma.KpiDefinitionWhereInput[] = [{ ownerId: user.id }, { dataEntryUserId: user.id }];
    if (this.access.has(PERMISSIONS.KPI_VALUE_ENTER, user)) {
      const filter = this.access.orgUnitFilter(PERMISSIONS.KPI_VALUE_ENTER, user);
      if (filter === null) return {};
      if (filter.OR.length) or.push({ orgUnit: filter });
    }
    return { OR: or };
  }

  /** İki koşulun birleşimi (AND). */
  and(...w: Prisma.KpiDefinitionWhereInput[]): Prisma.KpiDefinitionWhereInput {
    return { AND: w };
  }

  isResponsible(k: Pick<KpiRow, 'ownerId' | 'dataEntryUserId'>, user: RequestUser = this.ctx.user): boolean {
    return k.ownerId === user.id || k.dataEntryUserId === user.id;
  }

  canView(k: KpiRow, user: RequestUser = this.ctx.user): boolean {
    if (this.isResponsible(k, user)) return true;
    return this.access.has(PERMISSIONS.KPI_VIEW, user) && this.access.inScope(PERMISSIONS.KPI_VIEW, k.orgUnit.path, user);
  }

  canManage(k: Pick<KpiRow, 'orgUnit'>, user: RequestUser = this.ctx.user): boolean {
    return this.access.has(PERMISSIONS.KPI_MANAGE, user) && this.access.inScope(PERMISSIONS.KPI_MANAGE, k.orgUnit.path, user);
  }

  canEnter(k: KpiRow, user: RequestUser = this.ctx.user): boolean {
    if (this.isResponsible(k, user)) return true;
    return this.access.has(PERMISSIONS.KPI_VALUE_ENTER, user) && this.access.inScope(PERMISSIONS.KPI_VALUE_ENTER, k.orgUnit.path, user);
  }

  /** Sapma onayı: kapsamında kpi.deviation.approve izni olanlar ya da KPI sahibinin yöneticisi. */
  canApprove(k: KpiRow, user: RequestUser = this.ctx.user): boolean {
    if (this.access.has(PERMISSIONS.KPI_DEVIATION_APPROVE, user) && this.access.inScope(PERMISSIONS.KPI_DEVIATION_APPROVE, k.orgUnit.path, user)) return true;
    return !!user.employeeId && k.owner.employee?.managerId === user.employeeId;
  }

  async load(id: string): Promise<KpiRow> {
    const row = await this.prisma.db.kpiDefinition.findUnique({ where: { id }, include: kpiInclude });
    if (!row) throw new NotFoundException('KPI not found');
    return row;
  }

  async loadVisible(id: string): Promise<KpiRow> {
    const row = await this.load(id);
    if (!this.canView(row)) throw new ForbiddenException();
    return row;
  }

  async loadByCode(code: string): Promise<KpiRow | null> {
    return this.prisma.db.kpiDefinition.findFirst({ where: { code: code.trim().toUpperCase() }, include: kpiInclude });
  }
}

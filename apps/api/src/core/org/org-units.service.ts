import { Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, type OrgUnit as OrgUnitDto, type OrgUnitNode } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../auth/access.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOrgUnitDto, UpdateOrgUnitDto } from './org.dto';

@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<OrgUnitDto[]> {
    const units = await this.prisma.db.orgUnit.findMany({
      include: {
        manager: { select: { firstName: true, lastName: true } },
        _count: { select: { employees: { where: { isActive: true } } } },
      },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return units.map((u) => ({
      id: u.id, parentId: u.parentId, name: u.name, code: u.code, type: u.type, level: u.level, path: u.path,
      sortOrder: u.sortOrder, isActive: u.isActive, managerEmployeeId: u.managerEmployeeId,
      managerName: u.manager ? `${u.manager.firstName} ${u.manager.lastName}` : null,
      employeeCount: u._count.employees,
    }));
  }

  async tree(): Promise<OrgUnitNode[]> {
    const units = await this.list();
    const nodes = new Map<string, OrgUnitNode>(units.map((u) => [u.id, { ...u, children: [] }]));
    const roots: OrgUnitNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async get(id: string) {
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException('Org unit not found');
    return unit;
  }

  async create(dto: CreateOrgUnitDto) {
    const parent = dto.parentId ? await this.get(dto.parentId) : null;
    this.assertManage(parent?.path ?? null);
    await this.assertCodeUnique(dto.code ?? null);
    return this.prisma.db.$transaction(async (tx) => {
      const unit = await tx.orgUnit.create({
        data: {
          tenantId: this.ctx.tenantId,
          name: dto.name,
          code: dto.code ?? null,
          type: dto.type,
          parentId: parent?.id ?? null,
          managerEmployeeId: dto.managerEmployeeId ?? null,
          sortOrder: dto.sortOrder ?? 0,
          level: parent ? parent.level + 1 : 0,
          path: '',
        },
      });
      const saved = await tx.orgUnit.update({ where: { id: unit.id }, data: { path: `${parent?.path ?? '/'}${unit.id}/` } });
      await this.audit.log('orgUnit', unit.id, 'created', dto);
      return saved;
    });
  }

  async update(id: string, dto: UpdateOrgUnitDto) {
    const unit = await this.get(id);
    this.assertManage(unit.path);
    if (dto.code !== undefined && dto.code !== unit.code) await this.assertCodeUnique(dto.code ?? null, id);

    const { parentId, ...fields } = dto;
    const moving = parentId !== undefined && parentId !== unit.parentId;
    return this.prisma.db.$transaction(async (tx) => {
      if (moving) {
        const newParent = parentId ? await tx.orgUnit.findUnique({ where: { id: parentId } }) : null;
        if (parentId && !newParent) throw new NotFoundException('Parent not found');
        if (newParent?.path.startsWith(unit.path)) {
          throw new BusinessException('ORG_CYCLE', 'Birim kendi alt birimine taşınamaz');
        }
        this.assertManage(newParent?.path ?? null);
        const newPath = `${newParent?.path ?? '/'}${unit.id}/`;
        const levelDelta = (newParent ? newParent.level + 1 : 0) - unit.level;
        // Alt ağacın path ve level değerlerini tek sorguda güncelle
        await tx.$executeRaw`
          UPDATE "OrgUnit"
             SET path = ${newPath} || substring(path from ${unit.path.length + 1}),
                 level = level + ${levelDelta}
           WHERE "tenantId" = ${this.ctx.tenantId} AND path LIKE ${unit.path + '%'}`;
        await tx.orgUnit.update({ where: { id }, data: { parentId: newParent?.id ?? null } });
      }
      const updated = await tx.orgUnit.update({ where: { id }, data: fields });
      await this.audit.log('orgUnit', id, 'updated', AuditService.diff(unit, dto));
      return updated;
    });
  }

  async remove(id: string) {
    const unit = await this.get(id);
    this.assertManage(unit.path);
    const [children, employees] = await Promise.all([
      this.prisma.db.orgUnit.count({ where: { parentId: id } }),
      this.prisma.db.employee.count({ where: { orgUnitId: id } }),
    ]);
    if (children || employees) {
      throw new BusinessException('ORG_UNIT_NOT_EMPTY', 'Alt birimi veya personeli olan birim silinemez; pasife alabilirsiniz');
    }
    await this.prisma.db.orgUnit.delete({ where: { id } });
    await this.audit.log('orgUnit', id, 'deleted', { name: unit.name });
  }

  /** Bir birim ve tüm alt birimlerinin id'leri */
  async subtreeIds(id: string): Promise<string[]> {
    const unit = await this.get(id);
    const units = await this.prisma.db.orgUnit.findMany({ where: { path: { startsWith: unit.path } }, select: { id: true } });
    return units.map((u) => u.id);
  }

  private assertManage(path: string | null) {
    // Kök seviyesinde birim eklemek tüm-şirket kapsamı gerektirir
    if (!this.access.inScope(PERMISSIONS.ORG_MANAGE, path)) {
      throw new BusinessException('OUT_OF_SCOPE', 'Bu birim üzerinde yetkiniz yok');
    }
  }

  private async assertCodeUnique(code: string | null, exceptId?: string) {
    if (!code) return;
    const existing = await this.prisma.db.orgUnit.findFirst({ where: { code, NOT: exceptId ? { id: exceptId } : undefined } });
    if (existing) throw new BusinessException('ORG_CODE_TAKEN', `Birim kodu kullanılıyor: ${code}`);
  }
}

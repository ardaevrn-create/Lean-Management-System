import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditAreaItem, EquipmentItem } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditAccessService } from './audit-access.service';
import type { AreaQuery, CreateAreaDto, CreateEquipmentDto, EquipmentQuery, UpdateAreaDto, UpdateEquipmentDto } from './audits.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;
const orgRef = { select: { id: true, name: true, code: true, path: true } } as const;

const areaInclude = {
  orgUnit: orgRef, responsible: userRef, _count: { select: { equipment: { where: { isActive: true } } } },
} satisfies Prisma.AuditAreaInclude;
const equipmentInclude = {
  area: { select: { id: true, code: true, name: true } }, orgUnit: orgRef,
} satisfies Prisma.EquipmentInclude;

type AreaRow = Prisma.AuditAreaGetPayload<{ include: typeof areaInclude }>;
type EquipmentRow = Prisma.EquipmentGetPayload<{ include: typeof equipmentInclude }>;

/** Denetim alanları (M6-03) ve ekipman envanteri (M6-10). */
@Injectable()
export class AuditMastersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: AuditAccessService,
  ) {}

  /* ------------------------------ Alanlar ------------------------------ */

  /** Alan listesi herkese açıktır (saha çalışanı etiket açarken alan seçer). */
  async listAreas(query: AreaQuery): Promise<AuditAreaItem[]> {
    const rows = await this.prisma.db.auditArea.findMany({
      where: query.includeInactive ? {} : { isActive: true }, include: areaInclude, orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toArea(r));
  }

  async createArea(dto: CreateAreaDto): Promise<AuditAreaItem> {
    const unit = await this.orgUnit(dto.orgUnitId);
    this.access.assertManage(unit.path);
    await this.assertAreaCode(dto.code.toUpperCase());
    await this.assertUser(dto.responsibleId);
    const row = await this.prisma.db.auditArea.create({
      data: {
        tenantId: this.ctx.tenantId, code: dto.code.toUpperCase(), name: dto.name, orgUnitId: dto.orgUnitId,
        responsibleId: dto.responsibleId ?? null, areaType: dto.areaType ?? 'PRODUCTION',
      },
      include: areaInclude,
    });
    await this.audit.log('audit_area', row.id, 'created', dto);
    return this.toArea(row);
  }

  async updateArea(id: string, dto: UpdateAreaDto): Promise<AuditAreaItem> {
    const current = await this.loadArea(id);
    this.access.assertManage(current.orgUnit.path);
    if (dto.orgUnitId && dto.orgUnitId !== current.orgUnitId) this.access.assertManage((await this.orgUnit(dto.orgUnitId)).path);
    if (dto.code && dto.code.toUpperCase() !== current.code) await this.assertAreaCode(dto.code.toUpperCase(), id);
    if (dto.responsibleId) await this.assertUser(dto.responsibleId);
    const row = await this.prisma.db.auditArea.update({
      where: { id },
      data: {
        code: dto.code?.toUpperCase(), name: dto.name, orgUnitId: dto.orgUnitId, responsibleId: dto.responsibleId,
        areaType: dto.areaType, isActive: dto.isActive,
      },
      include: areaInclude,
    });
    await this.audit.log('audit_area', id, 'updated', dto);
    return this.toArea(row);
  }

  async deactivateArea(id: string): Promise<AuditAreaItem> {
    return this.updateArea(id, { isActive: false });
  }

  async loadArea(id: string): Promise<AreaRow> {
    const row = await this.prisma.db.auditArea.findUnique({ where: { id }, include: areaInclude });
    if (!row) throw new NotFoundException('Area not found');
    return row;
  }

  /* ------------------------------ Ekipman ------------------------------ */

  async listEquipment(query: EquipmentQuery): Promise<EquipmentItem[]> {
    const rows = await this.prisma.db.equipment.findMany({
      where: { ...(query.includeInactive ? {} : { isActive: true }), ...(query.areaId ? { areaId: query.areaId } : {}) },
      include: equipmentInclude, orderBy: { code: 'asc' },
    });
    return rows.map((r) => this.toEquipment(r));
  }

  async createEquipment(dto: CreateEquipmentDto): Promise<EquipmentItem> {
    const area = await this.loadArea(dto.areaId);
    this.access.assertManage(area.orgUnit.path);
    await this.assertEquipmentCode(dto.code.toUpperCase());
    if (dto.orgUnitId) await this.orgUnit(dto.orgUnitId);
    const row = await this.prisma.db.equipment.create({
      data: {
        tenantId: this.ctx.tenantId, code: dto.code.toUpperCase(), name: dto.name, areaId: dto.areaId,
        orgUnitId: dto.orgUnitId ?? area.orgUnitId, criticality: dto.criticality ?? 'B',
      },
      include: equipmentInclude,
    });
    await this.audit.log('equipment', row.id, 'created', dto);
    return this.toEquipment(row);
  }

  async updateEquipment(id: string, dto: UpdateEquipmentDto): Promise<EquipmentItem> {
    const current = await this.loadEquipment(id);
    const area = await this.loadArea(current.areaId);
    this.access.assertManage(area.orgUnit.path);
    if (dto.areaId && dto.areaId !== current.areaId) this.access.assertManage((await this.loadArea(dto.areaId)).orgUnit.path);
    if (dto.code && dto.code.toUpperCase() !== current.code) await this.assertEquipmentCode(dto.code.toUpperCase());
    if (dto.orgUnitId) await this.orgUnit(dto.orgUnitId);
    const row = await this.prisma.db.equipment.update({
      where: { id },
      data: {
        code: dto.code?.toUpperCase(), name: dto.name, areaId: dto.areaId, orgUnitId: dto.orgUnitId,
        criticality: dto.criticality, isActive: dto.isActive,
      },
      include: equipmentInclude,
    });
    await this.audit.log('equipment', id, 'updated', dto);
    return this.toEquipment(row);
  }

  async deactivateEquipment(id: string): Promise<EquipmentItem> {
    return this.updateEquipment(id, { isActive: false });
  }

  async loadEquipment(id: string): Promise<EquipmentRow> {
    const row = await this.prisma.db.equipment.findUnique({ where: { id }, include: equipmentInclude });
    if (!row) throw new NotFoundException('Equipment not found');
    return row;
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private async orgUnit(id: string) {
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id }, select: { id: true, path: true } });
    if (!unit) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
    return unit;
  }

  private async assertUser(id: string | null | undefined) {
    if (!id) return;
    if (!(await this.prisma.db.user.count({ where: { id, isActive: true } }))) throw new BusinessException('INVALID_USER', 'Kullanıcı bulunamadı ya da pasif');
  }

  private async assertAreaCode(code: string, exceptId?: string) {
    const hit = await this.prisma.db.auditArea.findFirst({ where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (hit) throw new BusinessException('CODE_EXISTS', 'Bu alan kodu zaten kullanılıyor');
  }

  private async assertEquipmentCode(code: string) {
    if (await this.prisma.db.equipment.findFirst({ where: { code }, select: { id: true } })) {
      throw new BusinessException('CODE_EXISTS', 'Bu ekipman kodu zaten kullanılıyor');
    }
  }

  private toArea(r: AreaRow): AuditAreaItem {
    return {
      id: r.id, code: r.code, name: r.name, areaType: r.areaType, isActive: r.isActive,
      orgUnit: { id: r.orgUnit.id, name: r.orgUnit.name, code: r.orgUnit.code }, responsible: r.responsible,
      equipmentCount: r._count.equipment,
    };
  }

  private toEquipment(r: EquipmentRow): EquipmentItem {
    return {
      id: r.id, code: r.code, name: r.name, criticality: r.criticality, isActive: r.isActive, area: r.area,
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name, code: r.orgUnit.code } : null,
    };
  }
}

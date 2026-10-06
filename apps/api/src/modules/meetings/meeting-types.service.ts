import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS, type AgendaTemplateItem, type MeetingTemplateInfo, type MeetingTypeItem } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MEETING_TEMPLATES, templateByKey } from './meeting-templates';
import type { CreateMeetingTypeDto, FromTemplateDto, UpdateMeetingTypeDto } from './meetings.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;

const typeInclude = {
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  facilitator: userRef,
  members: { include: { user: userRef }, orderBy: { id: 'asc' } },
  _count: { select: { meetings: true } },
} satisfies Prisma.MeetingTypeInclude;

type TypeRow = Prisma.MeetingTypeGetPayload<{ include: typeof typeInclude }>;

@Injectable()
export class MeetingTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive = false): Promise<MeetingTypeItem[]> {
    const rows = await this.prisma.db.meetingType.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: typeInclude,
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toItem(r));
  }

  async get(id: string): Promise<MeetingTypeItem> {
    return this.toItem(await this.load(id));
  }

  async create(dto: CreateMeetingTypeDto): Promise<MeetingTypeItem> {
    await this.assertScope(dto.orgUnitId);
    await this.assertCodeFree(dto.code);
    await this.assertUsers([dto.facilitatorId, ...(dto.members ?? []).map((m) => m.userId)]);
    const tenantId = this.ctx.tenantId;
    const row = await this.prisma.db.meetingType.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description ?? null,
        category: dto.category ?? 'OTHER',
        tier: dto.tier ?? null,
        frequency: dto.frequency ?? 'WEEKLY',
        defaultDurationMin: dto.defaultDurationMin ?? 60,
        defaultLocation: dto.defaultLocation ?? null,
        orgUnitId: dto.orgUnitId ?? null,
        facilitatorId: dto.facilitatorId ?? null,
        agendaTemplate: (dto.agendaTemplate ?? []) as unknown as Prisma.InputJsonValue,
        members: { create: this.uniqueMembers(dto.members).map((m) => ({ tenantId, userId: m.userId, role: m.role ?? 'PARTICIPANT' })) },
      },
      include: typeInclude,
    });
    await this.audit.log('meetingType', row.id, 'created', dto);
    return this.toItem(row);
  }

  async update(id: string, dto: UpdateMeetingTypeDto): Promise<MeetingTypeItem> {
    const row = await this.load(id);
    this.assertCanChange(row);
    if (dto.orgUnitId !== undefined) await this.assertScope(dto.orgUnitId);
    if (dto.code && dto.code.toUpperCase() !== row.code) await this.assertCodeFree(dto.code);
    await this.assertUsers([dto.facilitatorId, ...(dto.members ?? []).map((m) => m.userId)]);
    const tenantId = this.ctx.tenantId;

    const data: Prisma.MeetingTypeUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.code !== undefined) data.code = dto.code.toUpperCase();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.tier !== undefined) data.tier = dto.tier;
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.defaultDurationMin !== undefined) data.defaultDurationMin = dto.defaultDurationMin;
    if (dto.defaultLocation !== undefined) data.defaultLocation = dto.defaultLocation;
    if (dto.orgUnitId !== undefined) data.orgUnitId = dto.orgUnitId;
    if (dto.facilitatorId !== undefined) data.facilitatorId = dto.facilitatorId;
    if (dto.agendaTemplate !== undefined) data.agendaTemplate = dto.agendaTemplate as unknown as Prisma.InputJsonValue;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    await this.prisma.db.$transaction(async (tx) => {
      await tx.meetingType.update({ where: { id }, data });
      if (dto.members) {
        await tx.meetingTypeMember.deleteMany({ where: { typeId: id } });
        await tx.meetingTypeMember.createMany({
          data: this.uniqueMembers(dto.members).map((m) => ({ tenantId, typeId: id, userId: m.userId, role: m.role ?? 'PARTICIPANT' })),
        });
      }
    });
    await this.audit.log('meetingType', id, 'updated', dto);
    return this.toItem(await this.load(id));
  }

  /** Silme = pasife alma (geçmiş toplantılar korunur). */
  async deactivate(id: string): Promise<MeetingTypeItem> {
    const row = await this.load(id);
    this.assertCanChange(row);
    await this.prisma.db.meetingType.update({ where: { id }, data: { isActive: false } });
    await this.audit.log('meetingType', id, 'deactivated');
    return this.toItem(await this.load(id));
  }

  listTemplates(): MeetingTemplateInfo[] {
    return MEETING_TEMPLATES;
  }

  async createFromTemplate(key: string, dto: FromTemplateDto): Promise<MeetingTypeItem> {
    const tpl = templateByKey(key);
    if (!tpl) throw new NotFoundException('Template not found');
    // Kod çakışırsa sayısal sonek eklenir
    const baseCode = (dto.code ?? tpl.key).toUpperCase();
    let code = baseCode;
    for (let i = 2; await this.prisma.db.meetingType.findFirst({ where: { code } }); i++) code = `${baseCode}-${i}`;
    return this.create({
      name: dto.name ?? tpl.name,
      code,
      description: tpl.description,
      category: tpl.category,
      tier: tpl.tier,
      frequency: tpl.frequency,
      defaultDurationMin: tpl.durationMin,
      defaultLocation: dto.defaultLocation,
      orgUnitId: dto.orgUnitId ?? undefined,
      facilitatorId: dto.facilitatorId ?? undefined,
      members: dto.participantIds?.map((userId) => ({ userId })),
      agendaTemplate: tpl.agenda,
    });
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private async load(id: string): Promise<TypeRow> {
    const row = await this.prisma.db.meetingType.findFirst({ where: { id }, include: typeInclude });
    if (!row) throw new NotFoundException('Meeting type not found');
    return row;
  }

  private uniqueMembers<T extends { userId: string }>(members: T[] | undefined): T[] {
    const seen = new Set<string>();
    return (members ?? []).filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)));
  }

  private assertCanChange(row: TypeRow) {
    if (!this.access.has(PERMISSIONS.MEETING_MANAGE)) throw new ForbiddenException();
    if (!this.access.inScope(PERMISSIONS.MEETING_MANAGE, row.orgUnit?.path)) throw new ForbiddenException();
  }

  private async assertScope(orgUnitId: string | null | undefined) {
    if (!orgUnitId) {
      if (this.access.scopePaths(PERMISSIONS.MEETING_MANAGE) !== null) throw new ForbiddenException('Company-wide meeting types require an unscoped meeting.manage role');
      return;
    }
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!unit) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
    if (!this.access.inScope(PERMISSIONS.MEETING_MANAGE, unit.path)) throw new ForbiddenException();
  }

  private async assertCodeFree(code: string) {
    if (await this.prisma.db.meetingType.findFirst({ where: { code: code.toUpperCase() } })) {
      throw new ConflictException({ statusCode: 409, code: 'TYPE_CODE_TAKEN', message: 'Bu toplantı tipi kodu kullanılıyor' });
    }
  }

  private async assertUsers(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return;
    const count = await this.prisma.db.user.count({ where: { id: { in: unique }, isActive: true } });
    if (count !== unique.length) throw new BusinessException('INVALID_USER', 'Kullanıcı bulunamadı ya da pasif');
  }

  private toItem(r: TypeRow): MeetingTypeItem {
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      category: r.category,
      tier: r.tier,
      frequency: r.frequency,
      defaultDurationMin: r.defaultDurationMin,
      defaultLocation: r.defaultLocation,
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name, code: r.orgUnit.code } : null,
      facilitator: r.facilitator,
      members: r.members.map((m) => ({ user: m.user, role: m.role })),
      agendaTemplate: (Array.isArray(r.agendaTemplate) ? r.agendaTemplate : []) as unknown as AgendaTemplateItem[],
      isActive: r.isActive,
      meetingCount: r._count.meetings,
    };
  }
}

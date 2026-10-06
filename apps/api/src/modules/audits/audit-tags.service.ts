import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { tagCode, type AbnormalityTagItem, type Paginated } from '@lean/shared';
import { addDays, startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../../core/audit/audit.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SequenceService } from '../../core/prisma/sequence.service';
import { AuditAccessService } from './audit-access.service';
import type { CloseTagDto, CreateTagDto, TagQuery, UpdateTagDto } from './audits.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;
const include = {
  area: { select: { id: true, code: true, name: true, responsibleId: true, orgUnit: { select: { path: true } } } },
  equipment: { select: { id: true, code: true, name: true } },
  openedBy: userRef,
  assignedTo: userRef,
} satisfies Prisma.AbnormalityTagInclude;
type Row = Prisma.AbnormalityTagGetPayload<{ include: typeof include }>;

const ACTIVE = ['OPEN', 'IN_PROGRESS'] as const;

/** TPM anormallik etiketleri (M6-09): kırmızı = bakım ekibi, mavi = operatör / otonom bakım. */
@Injectable()
export class AuditTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: AuditAccessService,
    private readonly sequences: SequenceService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: TagQuery): Promise<Paginated<AbnormalityTagItem>> {
    const where = this.buildWhere(query);
    const orderBy = parseSort(query.sort, ['createdAt', 'dueDate', 'number', 'status'] as const, { createdAt: 'desc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.abnormalityTag.findMany({ where, include, orderBy, ...pageArgs(query) }),
      this.prisma.db.abnormalityTag.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toItem(r)), total, query);
  }

  async listAll(query: TagQuery): Promise<AbnormalityTagItem[]> {
    const rows = await this.prisma.db.abnormalityTag.findMany({ where: this.buildWhere(query), include, orderBy: { createdAt: 'desc' }, take: 5000 });
    return rows.map((r) => this.toItem(r));
  }

  async get(id: string): Promise<AbnormalityTagItem> {
    const row = await this.load(id);
    if (!(await this.canView(row))) throw new ForbiddenException();
    return this.toItem(row);
  }

  /** Herkes etiket açabilir (saha çalışanı dahil). */
  async create(dto: CreateTagDto): Promise<AbnormalityTagItem> {
    const area = await this.prisma.db.auditArea.findUnique({ where: { id: dto.areaId } });
    if (!area || !area.isActive) throw new BusinessException('INVALID_AREA', 'Alan bulunamadı ya da pasif');
    if (dto.equipmentId) {
      const eq = await this.prisma.db.equipment.findUnique({ where: { id: dto.equipmentId } });
      if (!eq || eq.areaId !== area.id) throw new BusinessException('INVALID_EQUIPMENT', 'Ekipman bu alana ait değil');
    }
    const assignedToId = dto.assignedToId === undefined ? area.responsibleId : dto.assignedToId;
    if (assignedToId && !(await this.prisma.db.user.count({ where: { id: assignedToId, isActive: true } }))) {
      throw new BusinessException('INVALID_USER', 'Atanan kullanıcı bulunamadı ya da pasif');
    }
    const dueDate = dto.dueDate ? startOfUtcDay(new Date(dto.dueDate)) : addDays(startOfUtcDay(), dto.color === 'RED' ? 3 : 7);
    const row = await this.prisma.db.$transaction(async (tx) => {
      const number = await this.sequences.next('tag', tx);
      return tx.abnormalityTag.create({
        data: {
          tenantId: this.ctx.tenantId, number, areaId: area.id, equipmentId: dto.equipmentId ?? null, color: dto.color, category: dto.category,
          description: dto.description, openedById: this.ctx.userId, assignedToId: assignedToId ?? null, dueDate,
        },
        include,
      });
    });
    await this.audit.log('tpm_tag', row.id, 'created', dto);
    if (assignedToId) {
      await this.notifications.notify({
        userIds: [assignedToId], type: 'GENERIC',
        title: `Yeni ${dto.color === 'RED' ? 'kırmızı' : 'mavi'} etiket: ${tagCode(row.number)} ${row.area.name}`,
        body: dto.description.slice(0, 200), link: '/audits?tab=tags',
      });
    }
    return this.toItem(row);
  }

  async update(id: string, dto: UpdateTagDto): Promise<AbnormalityTagItem> {
    const row = await this.load(id);
    if (!this.rights(row).edit) throw new ForbiddenException();
    if (!(ACTIVE as readonly string[]).includes(row.status)) throw new BusinessException('INVALID_STATUS', 'Kapalı etiket düzenlenemez');
    if (dto.assignedToId && !(await this.prisma.db.user.count({ where: { id: dto.assignedToId, isActive: true } }))) {
      throw new BusinessException('INVALID_USER', 'Atanan kullanıcı bulunamadı ya da pasif');
    }
    const updated = await this.prisma.db.abnormalityTag.update({
      where: { id },
      data: {
        color: dto.color, category: dto.category, description: dto.description, assignedToId: dto.assignedToId,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? startOfUtcDay(new Date(dto.dueDate)) : null,
      },
      include,
    });
    await this.audit.log('tpm_tag', id, 'updated', dto);
    if (dto.assignedToId && dto.assignedToId !== row.assignedToId) {
      await this.notifications.notify({
        userIds: [dto.assignedToId], type: 'GENERIC', title: `Etiket size atandı: ${tagCode(row.number)} ${row.area.name}`,
        body: updated.description.slice(0, 200), link: '/audits?tab=tags',
      });
    }
    return this.toItem(updated);
  }

  async start(id: string): Promise<AbnormalityTagItem> {
    const row = await this.load(id);
    if (!this.rights(row).close) throw new ForbiddenException();
    if (row.status !== 'OPEN') throw new BusinessException('INVALID_STATUS', 'Yalnız açık etiket işleme alınabilir');
    const updated = await this.prisma.db.abnormalityTag.update({ where: { id }, data: { status: 'IN_PROGRESS' }, include });
    await this.audit.log('tpm_tag', id, 'started');
    return this.toItem(updated);
  }

  /** Etiketi kapatır: audit.manage (kapsamlı), atanan kişi veya alan sorumlusu. */
  async close(id: string, dto: CloseTagDto): Promise<AbnormalityTagItem> {
    const row = await this.load(id);
    if (!this.rights(row).close) throw new ForbiddenException();
    if (!(ACTIVE as readonly string[]).includes(row.status)) throw new BusinessException('INVALID_STATUS', 'Etiket zaten kapalı veya iptal edilmiş');
    const updated = await this.prisma.db.abnormalityTag.update({
      where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: this.ctx.userId, closeNote: dto.closeNote ?? null }, include,
    });
    await this.audit.log('tpm_tag', id, 'closed', dto);
    await this.notifications.notify({
      userIds: [row.openedById], type: 'GENERIC', title: `Etiket kapatıldı: ${tagCode(row.number)} ${row.area.name}`,
      body: dto.closeNote, link: '/audits?tab=tags',
    });
    return this.toItem(updated);
  }

  async cancel(id: string): Promise<AbnormalityTagItem> {
    const row = await this.load(id);
    const r = this.rights(row);
    if (!(r.manage || (row.openedById === this.ctx.userId && row.status === 'OPEN'))) throw new ForbiddenException();
    if (!(ACTIVE as readonly string[]).includes(row.status)) throw new BusinessException('INVALID_STATUS', 'Etiket zaten kapalı veya iptal edilmiş');
    const updated = await this.prisma.db.abnormalityTag.update({ where: { id }, data: { status: 'CANCELLED' }, include });
    await this.audit.log('tpm_tag', id, 'cancelled');
    return this.toItem(updated);
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private buildWhere(query: TagQuery): Prisma.AbnormalityTagWhereInput {
    const and: Prisma.AbnormalityTagWhereInput[] = [];
    const me = this.ctx.userId;
    if (query.view === 'mine') and.push({ OR: [{ openedById: me }, { assignedToId: me }] });
    else and.push(this.access.visibleTagWhere());
    if (query.status) and.push({ status: query.status });
    if (query.open) and.push({ status: { in: [...ACTIVE] } });
    if (query.overdue) and.push({ status: { in: [...ACTIVE] }, dueDate: { lt: startOfUtcDay() } });
    if (query.color) and.push({ color: query.color });
    if (query.category) and.push({ category: query.category });
    if (query.areaId) and.push({ areaId: query.areaId });
    if (query.equipmentId) and.push({ equipmentId: query.equipmentId });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    if (query.q) {
      const q = query.q.trim();
      const num = /^(?:ETK-?)?0*(\d+)$/i.exec(q);
      and.push({ OR: [{ description: { contains: q, mode: 'insensitive' } }, { area: { name: { contains: q, mode: 'insensitive' } } }, ...(num ? [{ number: Number(num[1]) }] : [])] });
    }
    return { AND: and };
  }

  private async load(id: string): Promise<Row> {
    const row = await this.prisma.db.abnormalityTag.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Tag not found');
    return row;
  }

  private async canView(row: Row): Promise<boolean> {
    const me = this.ctx.userId;
    if (row.openedById === me || row.assignedToId === me || row.area.responsibleId === me) return true;
    return !!(await this.prisma.db.abnormalityTag.findFirst({ where: { id: row.id, ...this.access.visibleTagWhere() }, select: { id: true } }));
  }

  private rights(row: Row) {
    const me = this.ctx.userId;
    const manage = this.access.canManage(row.area.orgUnit.path);
    const handler = manage || row.assignedToId === me || row.area.responsibleId === me;
    return { manage, close: handler, edit: handler || (row.openedById === me && row.status === 'OPEN') };
  }

  private toItem(r: Row): AbnormalityTagItem {
    const rights = this.rights(r);
    const active = (ACTIVE as readonly string[]).includes(r.status);
    return {
      id: r.id, number: r.number, code: tagCode(r.number), color: r.color, category: r.category, description: r.description, status: r.status,
      dueDate: r.dueDate?.toISOString().slice(0, 10) ?? null, isOverdue: active && !!r.dueDate && r.dueDate < startOfUtcDay(),
      area: { id: r.area.id, code: r.area.code, name: r.area.name }, equipment: r.equipment, openedBy: r.openedBy, assignedTo: r.assignedTo,
      createdAt: r.createdAt.toISOString(), closedAt: r.closedAt?.toISOString() ?? null, closeNote: r.closeNote,
      can: { close: rights.close && active, edit: rights.edit && active },
    };
  }
}

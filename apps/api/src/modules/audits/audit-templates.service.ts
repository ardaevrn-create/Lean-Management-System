import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditBuiltinTemplateInfo, AuditSectionItem, AuditTemplateDetail, AuditTemplateItem } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service';
import { AuditAccessService } from './audit-access.service';
import { BUILTIN_TEMPLATES, builtinInfo, type BuiltinSection } from './audit-templates';
import type { BuiltinTemplateDto, CreateTemplateDto, TemplateQuery, TemplateSectionDto, UpdateTemplateDto } from './audits.dto';

const detailInclude = {
  sections: { orderBy: { sortOrder: 'asc' }, include: { questions: { orderBy: { sortOrder: 'asc' } } } },
  _count: { select: { audits: true } },
} satisfies Prisma.AuditTemplateInclude;
type Row = Prisma.AuditTemplateGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class AuditTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: AuditAccessService,
  ) {}

  builtinCatalog(): AuditBuiltinTemplateInfo[] {
    return BUILTIN_TEMPLATES.map(builtinInfo);
  }

  async list(query: TemplateQuery): Promise<AuditTemplateItem[]> {
    this.access.assertAnyPermission();
    const rows = await this.prisma.db.auditTemplate.findMany({
      where: { ...(query.includeInactive ? {} : { isActive: true }), ...(query.type ? { type: query.type } : {}) },
      include: detailInclude,
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r) => this.toItem(r));
  }

  async get(id: string): Promise<AuditTemplateDetail> {
    this.access.assertAnyPermission();
    return this.toDetail(await this.load(id));
  }

  async create(dto: CreateTemplateDto): Promise<AuditTemplateDetail> {
    const code = dto.code.toUpperCase();
    const id = await this.prisma.db.$transaction(async (tx) => {
      await this.assertCodeFree(tx, code);
      return this.insert(tx, {
        name: dto.name, code, type: dto.type ?? 'CUSTOM', areaType: dto.areaType ?? 'ANY', scaleType: dto.scaleType ?? 'ZERO_TO_FOUR',
        version: 1, description: dto.description ?? null, builtinKey: null, sections: dto.sections,
      });
    });
    await this.audit.log('audit_template', id, 'created', dto);
    return this.toDetail(await this.load(id));
  }

  /** Yerleşik şablonu şirkete kopyalar; kod çakışırsa -2, -3 eklenir. */
  async createBuiltin(key: string, dto: BuiltinTemplateDto): Promise<AuditTemplateDetail> {
    const tpl = BUILTIN_TEMPLATES.find((t) => t.key === key);
    if (!tpl) throw new NotFoundException(`Unknown built-in template: ${key}`);
    const baseCode = (dto.code ?? tpl.key).toUpperCase();
    const id = await this.prisma.db.$transaction(async (tx) => {
      let code = baseCode;
      for (let i = 2; await tx.auditTemplate.findFirst({ where: { code }, select: { id: true } }); i++) code = `${baseCode}-${i}`;
      return this.insert(tx, {
        name: dto.name ?? tpl.name, code, type: tpl.type, areaType: tpl.areaType, scaleType: tpl.scaleType, version: 1,
        description: tpl.description, builtinKey: tpl.key, sections: tpl.sections as BuiltinSection[],
      });
    });
    await this.audit.log('audit_template', id, 'created', { builtin: key });
    return this.toDetail(await this.load(id));
  }

  /**
   * Düzenleme: tamamlanmış denetimi olan şablon yerinde değiştirilmez; yeni sürüm (kopya) oluşturulur,
   * eski sürüm pasifleşir, planlar ve henüz başlamamış denetimler yeni sürüme taşınır.
   */
  async update(id: string, dto: UpdateTemplateDto): Promise<AuditTemplateDetail> {
    const row = await this.load(id);
    const structural = dto.sections !== undefined || (dto.scaleType !== undefined && dto.scaleType !== row.scaleType);
    const completed = structural ? await this.prisma.db.audit.count({ where: { templateId: id, status: { in: ['COMPLETED', 'IN_PROGRESS'] } } }) : 0;

    if (structural && completed > 0) {
      const newId = await this.prisma.db.$transaction(async (tx) => {
        const latest = await tx.auditTemplate.aggregate({ where: { code: row.code }, _max: { version: true } });
        const created = await this.insert(tx, {
          name: dto.name ?? row.name, code: row.code, type: dto.type ?? row.type, areaType: dto.areaType ?? row.areaType,
          scaleType: dto.scaleType ?? row.scaleType, version: (latest._max.version ?? row.version) + 1,
          description: dto.description === undefined ? row.description : dto.description,
          builtinKey: row.builtinKey, sections: dto.sections ?? this.toSectionDtos(row),
        });
        await tx.auditTemplate.update({ where: { id }, data: { isActive: false } });
        await tx.auditPlan.updateMany({ where: { templateId: id }, data: { templateId: created } });
        await tx.audit.updateMany({ where: { templateId: id, status: 'PLANNED' }, data: { templateId: created } });
        return created;
      });
      await this.audit.log('audit_template', newId, 'versioned', { from: id });
      return { ...(await this.toDetail(await this.load(newId))), versioned: true };
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.auditTemplate.update({
        where: { id },
        data: {
          name: dto.name, type: dto.type, areaType: dto.areaType, scaleType: dto.scaleType, isActive: dto.isActive,
          description: dto.description === undefined ? undefined : dto.description,
        },
      });
      if (dto.sections) {
        await tx.auditTemplateSection.deleteMany({ where: { templateId: id } });
        await this.insertSections(tx, id, dto.sections);
      }
    });
    await this.audit.log('audit_template', id, 'updated', dto);
    return this.toDetail(await this.load(id));
  }

  async deactivate(id: string): Promise<AuditTemplateDetail> {
    await this.load(id);
    await this.prisma.db.auditTemplate.update({ where: { id }, data: { isActive: false } });
    await this.audit.log('audit_template', id, 'deactivated');
    return this.toDetail(await this.load(id));
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private async insert(
    tx: TenantTx,
    d: {
      name: string; code: string; type: AuditTemplateItem['type']; areaType: AuditTemplateItem['areaType']; scaleType: AuditTemplateItem['scaleType'];
      version: number; description: string | null; builtinKey: string | null; sections: TemplateSectionDto[] | BuiltinSection[];
    },
  ): Promise<string> {
    this.validateSections(d.sections, d.scaleType);
    const tenantId = this.ctx.tenantId;
    const t = await tx.auditTemplate.create({
      data: {
        tenantId, name: d.name, code: d.code, type: d.type, areaType: d.areaType, scaleType: d.scaleType, version: d.version,
        description: d.description, builtinKey: d.builtinKey,
      },
    });
    await this.insertSections(tx, t.id, d.sections);
    return t.id;
  }

  private async insertSections(tx: TenantTx, templateId: string, sections: TemplateSectionDto[] | BuiltinSection[]) {
    const tenantId = this.ctx.tenantId;
    for (const [si, s] of sections.entries()) {
      const sec = await tx.auditTemplateSection.create({
        data: { tenantId, templateId, title: s.title, sortOrder: si, weight: s.weight ?? 1 },
      });
      await tx.auditTemplateQuestion.createMany({
        data: s.questions.map((q, qi) => ({
          tenantId, sectionId: sec.id, text: q.text, guidance: q.guidance ?? null, weight: q.weight ?? 1, sortOrder: qi,
          photoRequiredBelow: q.photoRequiredBelow ?? null,
        })),
      });
    }
  }

  private validateSections(sections: { title: string; questions: { text: string; photoRequiredBelow?: number | null }[] }[], scale: string) {
    if (!sections.length) throw new BusinessException('TEMPLATE_EMPTY', 'Şablonda en az bir bölüm olmalı');
    const max = scale === 'ZERO_TO_FIVE' ? 5 : scale === 'YES_NO' ? 1 : 4;
    for (const s of sections) {
      if (!s.questions.length) throw new BusinessException('TEMPLATE_EMPTY', `"${s.title}" bölümünde en az bir soru olmalı`);
      for (const q of s.questions) {
        if (q.photoRequiredBelow != null && q.photoRequiredBelow > max) {
          throw new BusinessException('INVALID_PHOTO_THRESHOLD', 'Fotoğraf eşiği skalanın üst sınırını aşamaz');
        }
      }
    }
  }

  private async assertCodeFree(tx: TenantTx, code: string) {
    if (await tx.auditTemplate.findFirst({ where: { code }, select: { id: true } })) {
      throw new BusinessException('CODE_EXISTS', 'Bu şablon kodu zaten kullanılıyor');
    }
  }

  async load(id: string): Promise<Row> {
    const row = await this.prisma.db.auditTemplate.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw new NotFoundException('Template not found');
    return row;
  }

  private toSectionDtos(row: Row): TemplateSectionDto[] {
    return row.sections.map((s) => ({
      title: s.title, weight: s.weight,
      questions: s.questions.map((q) => ({ text: q.text, guidance: q.guidance, weight: q.weight, photoRequiredBelow: q.photoRequiredBelow })),
    }));
  }

  private toItem(r: Row): AuditTemplateItem {
    return {
      id: r.id, name: r.name, code: r.code, type: r.type, areaType: r.areaType, scaleType: r.scaleType, version: r.version,
      isActive: r.isActive, description: r.description, builtinKey: r.builtinKey,
      sectionCount: r.sections.length, questionCount: r.sections.reduce((n, s) => n + s.questions.length, 0), auditCount: r._count.audits,
    };
  }

  private toDetail(r: Row): AuditTemplateDetail {
    const sections: AuditSectionItem[] = r.sections.map((s) => ({
      id: s.id, title: s.title, weight: s.weight, sortOrder: s.sortOrder,
      questions: s.questions.map((q) => ({
        id: q.id, text: q.text, guidance: q.guidance, weight: q.weight, sortOrder: q.sortOrder, photoRequiredBelow: q.photoRequiredBelow,
      })),
    }));
    return { ...this.toItem(r), sections };
  }
}

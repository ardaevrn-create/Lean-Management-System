import { Injectable, OnModuleInit } from '@nestjs/common';
import { ORG_UNIT_TYPES, PERMISSIONS, type ImportRowError, type OrgUnitType } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { ImportRegistry } from '../imports/import-registry';
import type { Importer, ParsedRow } from '../imports/importer';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { OrgUnitsService } from './org-units.service';

const TYPE_ALIASES: Record<string, OrgUnitType> = {
  sirket: 'COMPANY', lokasyon: 'SITE', fabrika: 'SITE', direktorluk: 'DIRECTORATE', departman: 'DEPARTMENT',
  mudurluk: 'DEPARTMENT', birim: 'UNIT', hat: 'LINE', alan: 'AREA',
};

function parseType(v: unknown): OrgUnitType | null {
  const s = String(v ?? '').trim();
  if ((ORG_UNIT_TYPES as readonly string[]).includes(s.toUpperCase())) return s.toUpperCase() as OrgUnitType;
  const n = s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ğ/g, 'g');
  return TYPE_ALIASES[n] ?? null;
}

/** Organizasyon birimleri: üst birim koduna göre hiyerarşi kurulur; mevcut kod varsa güncellenir. */
@Injectable()
export class OrgUnitsImporter implements Importer, OnModuleInit {
  type = 'org-units';
  label = 'Organizasyon Birimleri';
  permission = PERMISSIONS.ORG_MANAGE;
  columns: Importer['columns'] = [
    { key: 'code', label: 'Birim Kodu', required: true, type: 'string' },
    { key: 'name', label: 'Birim Adı', required: true, type: 'string' },
    { key: 'type', label: 'Tip', required: true, type: 'string', description: 'Şirket, Lokasyon, Direktörlük, Departman, Birim, Hat, Alan' },
    { key: 'parentCode', label: 'Üst Birim Kodu', required: false, type: 'string', description: 'Boşsa en üst seviyeye (şirket altına) eklenir' },
  ];
  sampleRows = [
    { code: 'URT', name: 'Üretim Direktörlüğü', type: 'Direktörlük', parentCode: '' },
    { code: 'URT-H3', name: 'Hat 3', type: 'Hat', parentCode: 'URT' },
  ];

  constructor(private readonly registry: ImportRegistry, private readonly prisma: PrismaService, private readonly orgUnits: OrgUnitsService) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async validate(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const errors: ImportRowError[] = [];
    const fileCodes = new Map<string, number>();
    for (const r of rows) {
      const code = String(r.values.code);
      if (fileCodes.has(code)) errors.push({ row: r.rowNumber, column: 'Birim Kodu', message: `Dosyada tekrar eden kod (satır ${fileCodes.get(code)})` });
      fileCodes.set(code, r.rowNumber);
      if (!parseType(r.values.type)) errors.push({ row: r.rowNumber, column: 'Tip', message: `Geçersiz tip: ${r.values.type}` });
    }
    const parentCodes = [...new Set(rows.map((r) => r.values.parentCode).filter(Boolean) as string[])];
    const existing = new Set((await this.prisma.db.orgUnit.findMany({ where: { code: { in: parentCodes } }, select: { code: true } })).map((u) => u.code));
    for (const r of rows) {
      const p = r.values.parentCode as string | null;
      if (p && !existing.has(p) && !fileCodes.has(p)) errors.push({ row: r.rowNumber, column: 'Üst Birim Kodu', message: `Üst birim bulunamadı: ${p}` });
      if (p && p === r.values.code) errors.push({ row: r.rowNumber, column: 'Üst Birim Kodu', message: 'Birim kendi üst birimi olamaz' });
    }
    return errors;
  }

  async commit(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const errors: ImportRowError[] = [];
    const root = await this.prisma.db.orgUnit.findFirst({ where: { parentId: null }, orderBy: { createdAt: 'asc' } });
    // Üst birimi önce işlenecek şekilde sırala (en fazla N tur)
    let pending = [...rows];
    for (let pass = 0; pending.length && pass < 50; pass++) {
      const next: ParsedRow[] = [];
      for (const r of pending) {
        const parentCode = r.values.parentCode as string | null;
        const parent = parentCode ? await this.prisma.db.orgUnit.findFirst({ where: { code: parentCode } }) : root;
        if (parentCode && !parent) { next.push(r); continue; }
        try {
          const existing = await this.prisma.db.orgUnit.findFirst({ where: { code: String(r.values.code) } });
          const data = { name: String(r.values.name), type: parseType(r.values.type)!, parentId: parent?.id ?? null };
          if (existing) await this.orgUnits.update(existing.id, data);
          else await this.orgUnits.create({ ...data, code: String(r.values.code) });
        } catch (err) {
          errors.push({ row: r.rowNumber, column: null, message: (err as Error).message });
        }
      }
      if (next.length === pending.length) break;
      pending = next;
    }
    for (const r of pending) errors.push({ row: r.rowNumber, column: 'Üst Birim Kodu', message: 'Üst birim çözümlenemedi' });
    return errors;
  }
}

/** Personel: sicil no'ya göre ekler/günceller; istenirse kullanıcı hesabı açar. */
@Injectable()
export class EmployeesImporter implements Importer, OnModuleInit {
  type = 'employees';
  label = 'Personel';
  permission = PERMISSIONS.EMPLOYEE_MANAGE;
  columns: Importer['columns'] = [
    { key: 'employeeNo', label: 'Sicil No', required: true, type: 'string' },
    { key: 'firstName', label: 'Ad', required: true, type: 'string' },
    { key: 'lastName', label: 'Soyad', required: true, type: 'string' },
    { key: 'title', label: 'Unvan', required: false, type: 'string' },
    { key: 'orgUnitCode', label: 'Birim Kodu', required: false, type: 'string' },
    { key: 'managerEmployeeNo', label: 'Yönetici Sicil No', required: false, type: 'string' },
    { key: 'email', label: 'E-posta', required: false, type: 'string' },
    { key: 'phone', label: 'Telefon', required: false, type: 'string' },
    { key: 'hireDate', label: 'İşe Giriş Tarihi', required: false, type: 'date' },
    { key: 'createUser', label: 'Hesap Aç', required: false, type: 'boolean', description: 'Evet ise kullanıcı adı = sicil no, geçici şifre üretilir' },
  ];
  sampleRows = [{ employeeNo: '10023', firstName: 'Ayşe', lastName: 'Yılmaz', title: 'Hat Şefi', orgUnitCode: 'URT-H3', managerEmployeeNo: '10001', createUser: 'Evet' }];

  constructor(
    private readonly registry: ImportRegistry,
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly users: UsersService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async validate(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const errors: ImportRowError[] = [];
    const nos = new Map<string, number>();
    for (const r of rows) {
      const no = String(r.values.employeeNo);
      if (nos.has(no)) errors.push({ row: r.rowNumber, column: 'Sicil No', message: `Dosyada tekrar eden sicil no (satır ${nos.get(no)})` });
      nos.set(no, r.rowNumber);
      const email = r.values.email as string | null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ row: r.rowNumber, column: 'E-posta', message: 'Geçersiz e-posta' });
    }
    const codes = [...new Set(rows.map((r) => r.values.orgUnitCode).filter(Boolean) as string[])];
    const units = new Set((await this.prisma.db.orgUnit.findMany({ where: { code: { in: codes } }, select: { code: true } })).map((u) => u.code));
    const mgrs = [...new Set(rows.map((r) => r.values.managerEmployeeNo).filter(Boolean) as string[])];
    const existingMgrs = new Set((await this.prisma.db.employee.findMany({ where: { employeeNo: { in: mgrs } }, select: { employeeNo: true } })).map((e) => e.employeeNo));
    for (const r of rows) {
      const code = r.values.orgUnitCode as string | null;
      if (code && !units.has(code)) errors.push({ row: r.rowNumber, column: 'Birim Kodu', message: `Birim bulunamadı: ${code}` });
      const m = r.values.managerEmployeeNo as string | null;
      if (m && !existingMgrs.has(m) && !nos.has(m)) errors.push({ row: r.rowNumber, column: 'Yönetici Sicil No', message: `Yönetici bulunamadı: ${m}` });
    }
    return errors;
  }

  async commit(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const errors: ImportRowError[] = [];
    const tenantId = this.ctx.tenantId;
    const units = new Map((await this.prisma.db.orgUnit.findMany({ where: { code: { not: null } }, select: { id: true, code: true } })).map((u) => [u.code!, u.id]));
    const toAccount: string[] = [];
    // 1. tur: personel kayıtları; 2. tur: yönetici bağlantıları (dosya içi referanslar için)
    for (const r of rows) {
      const v = r.values;
      const data = {
        firstName: String(v.firstName), lastName: String(v.lastName), title: (v.title as string) ?? null,
        email: (v.email as string) ?? null, phone: (v.phone as string) ?? null, hireDate: (v.hireDate as Date) ?? null,
        orgUnitId: v.orgUnitCode ? units.get(String(v.orgUnitCode)) ?? null : null,
      };
      try {
        const emp = await this.prisma.db.employee.upsert({
          where: { tenantId_employeeNo: { tenantId, employeeNo: String(v.employeeNo) } },
          create: { ...data, tenantId, employeeNo: String(v.employeeNo) },
          update: data,
        });
        if (v.createUser) toAccount.push(emp.id);
      } catch (err) {
        errors.push({ row: r.rowNumber, column: null, message: (err as Error).message });
      }
    }
    for (const r of rows) {
      const m = r.values.managerEmployeeNo as string | null;
      if (!m) continue;
      const manager = await this.prisma.db.employee.findFirst({ where: { employeeNo: m } });
      if (manager) await this.prisma.db.employee.updateMany({ where: { employeeNo: String(r.values.employeeNo) }, data: { managerId: manager.id } });
    }
    if (toAccount.length) await this.users.createForEmployees(toAccount);
    return errors;
  }
}

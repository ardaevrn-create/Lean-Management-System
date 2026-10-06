import { Injectable, OnModuleInit } from '@nestjs/common';
import { PERMISSIONS, PRIORITIES, type ImportRowError, type Priority } from '@lean/shared';
import { normalizeUsername } from '../auth/crypto';
import { ImportRegistry } from '../imports/import-registry';
import type { Importer, ParsedRow } from '../imports/importer';
import { PrismaService } from '../prisma/prisma.service';
import { ActionsService } from './actions.service';

const PRIORITY_ALIASES: Record<string, Priority> = { dusuk: 'LOW', orta: 'MEDIUM', yuksek: 'HIGH', kritik: 'CRITICAL' };

function parsePriority(v: unknown): Priority | null {
  if (!v) return 'MEDIUM';
  const s = String(v).trim().toLocaleLowerCase('tr-TR').replace('ü', 'u').replace('ş', 's').replace('ı', 'i');
  return (PRIORITIES as readonly string[]).includes(s.toUpperCase()) ? (s.toUpperCase() as Priority) : PRIORITY_ALIASES[s] ?? null;
}

/** Excel'den toplu aksiyon girişi (ör. eski Excel aksiyon listelerinin taşınması). */
@Injectable()
export class ActionsImporter implements Importer, OnModuleInit {
  type = 'actions';
  label = 'Aksiyonlar';
  permission = PERMISSIONS.ACTION_MANAGE;
  columns: Importer['columns'] = [
    { key: 'title', label: 'Başlık', required: true, type: 'string' },
    { key: 'description', label: 'Açıklama', required: false, type: 'string' },
    { key: 'owner', label: 'Sorumlu', required: true, type: 'string', description: 'Kullanıcı adı / sicil no' },
    { key: 'dueDate', label: 'Termin', required: true, type: 'date', description: 'GG.AA.YYYY' },
    { key: 'priority', label: 'Öncelik', required: false, type: 'string', description: 'Düşük, Orta, Yüksek, Kritik' },
    { key: 'orgUnitCode', label: 'Birim Kodu', required: false, type: 'string' },
    { key: 'sourceLabel', label: 'Kaynak', required: false, type: 'string', description: 'Serbest metin, ör. "2025 YGG toplantısı"' },
  ];
  sampleRows = [{ title: 'Hat 3 emniyet bariyeri onarımı', owner: '10023', dueDate: '31.12.2026', priority: 'Yüksek', orgUnitCode: 'URT-H3' }];

  constructor(private readonly registry: ImportRegistry, private readonly prisma: PrismaService, private readonly actions: ActionsService) {}

  onModuleInit() {
    this.registry.register(this);
  }

  private async lookups(rows: ParsedRow[]) {
    const usernames = [...new Set(rows.map((r) => normalizeUsername(String(r.values.owner))))];
    const codes = [...new Set(rows.map((r) => r.values.orgUnitCode).filter(Boolean) as string[])];
    const [users, units] = await Promise.all([
      this.prisma.db.user.findMany({ where: { username: { in: usernames }, isActive: true }, select: { id: true, username: true } }),
      this.prisma.db.orgUnit.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }),
    ]);
    return { users: new Map(users.map((u) => [u.username, u.id])), units: new Map(units.map((u) => [u.code!, u.id])) };
  }

  async validate(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const { users, units } = await this.lookups(rows);
    const errors: ImportRowError[] = [];
    for (const r of rows) {
      if (!users.has(normalizeUsername(String(r.values.owner)))) errors.push({ row: r.rowNumber, column: 'Sorumlu', message: `Kullanıcı bulunamadı: ${r.values.owner}` });
      if (r.values.orgUnitCode && !units.has(String(r.values.orgUnitCode))) errors.push({ row: r.rowNumber, column: 'Birim Kodu', message: `Birim bulunamadı: ${r.values.orgUnitCode}` });
      if (!parsePriority(r.values.priority)) errors.push({ row: r.rowNumber, column: 'Öncelik', message: `Geçersiz öncelik: ${r.values.priority}` });
    }
    return errors;
  }

  async commit(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const { users, units } = await this.lookups(rows);
    const errors: ImportRowError[] = [];
    for (const r of rows) {
      try {
        await this.actions.create({
          title: String(r.values.title),
          description: (r.values.description as string) ?? null,
          ownerId: users.get(normalizeUsername(String(r.values.owner)))!,
          dueDate: r.values.dueDate as Date,
          priority: parsePriority(r.values.priority)!,
          orgUnitId: r.values.orgUnitCode ? units.get(String(r.values.orgUnitCode)) : undefined,
          sourceLabel: (r.values.sourceLabel as string) ?? null,
        });
      } catch (err) {
        errors.push({ row: r.rowNumber, column: null, message: (err as Error).message });
      }
    }
    return errors;
  }
}

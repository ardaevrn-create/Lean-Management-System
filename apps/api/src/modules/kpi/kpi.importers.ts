import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  KPI_AGGREGATIONS, KPI_CATEGORIES, KPI_DIRECTIONS, KPI_FREQUENCIES, PERMISSIONS, coercePeriodInput, isValidPeriod, normalizeKpiCode,
  type ImportRowError, type KpiAggregation, type KpiCategory, type KpiDirection, type KpiFrequency,
} from '@lean/shared';
import { normalizeUsername } from '../../core/auth/crypto';
import { ImportRegistry } from '../../core/imports/import-registry';
import type { Importer, ParsedRow } from '../../core/imports/importer';
import { PrismaService } from '../../core/prisma/prisma.service';
import { KpiAccessService } from './kpi-access.service';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { KpiValuesService } from './kpi-values.service';
import { kpiInclude, type KpiRow } from './kpi-core';
import type { CreateKpiDto, UpdateKpiDto } from './kpi.dto';

/** Türkçe karakterleri sadeleştirip küçük harfe çevirir (takma ad eşleştirme için). */
function norm(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function aliasParser<T extends string>(all: readonly T[], aliases: Record<string, T>) {
  return (v: unknown): T | null => {
    const n = norm(v);
    if (!n) return null;
    const direct = all.find((a) => norm(a) === n || norm(a.replace(/_/g, ' ')) === n);
    return direct ?? aliases[n] ?? null;
  };
}

export const parseCategory = aliasParser<KpiCategory>(KPI_CATEGORIES, {
  kalite: 'QUALITY', verimlilik: 'PRODUCTIVITY', uretkenlik: 'PRODUCTIVITY', uretim: 'PRODUCTIVITY', maliyet: 'COST', teslimat: 'DELIVERY',
  guvenlik: 'SAFETY', isg: 'SAFETY', 'is guvenligi': 'SAFETY', insan: 'PEOPLE', personel: 'PEOPLE', cevre: 'ENVIRONMENT', enerji: 'ENVIRONMENT', diger: 'OTHER',
});
export const parseDirection = aliasParser<KpiDirection>(KPI_DIRECTIONS, {
  'yuksek iyi': 'HIGHER_BETTER', 'yuksek': 'HIGHER_BETTER', 'buyuk iyi': 'HIGHER_BETTER', 'artis iyi': 'HIGHER_BETTER',
  'dusuk iyi': 'LOWER_BETTER', 'dusuk': 'LOWER_BETTER', 'kucuk iyi': 'LOWER_BETTER', 'azalis iyi': 'LOWER_BETTER',
  aralik: 'RANGE', bant: 'RANGE', 'aralikta iyi': 'RANGE',
});
export const parseFrequency = aliasParser<KpiFrequency>(KPI_FREQUENCIES, {
  gunluk: 'DAILY', haftalik: 'WEEKLY', aylik: 'MONTHLY', ceyreklik: 'QUARTERLY', '3 aylik': 'QUARTERLY', donemlik: 'QUARTERLY', yillik: 'YEARLY',
});
export const parseAggregation = aliasParser<KpiAggregation>(KPI_AGGREGATIONS, {
  toplam: 'SUM', ortalama: 'AVERAGE', son: 'LAST', 'son deger': 'LAST', minimum: 'MIN', maksimum: 'MAX', maks: 'MAX', enaz: 'MIN', encok: 'MAX',
});

/** KPI tanımları: koda göre ekler / günceller. */
@Injectable()
export class KpiDefinitionsImporter implements Importer, OnModuleInit {
  type = 'kpi-definitions';
  label = 'KPI Tanımları';
  permission = PERMISSIONS.KPI_MANAGE;
  columns: Importer['columns'] = [
    { key: 'code', label: 'KPI Kodu', required: true, type: 'string' },
    { key: 'name', label: 'KPI Adı', required: true, type: 'string' },
    { key: 'category', label: 'Kategori', required: false, type: 'string', description: 'Kalite, Verimlilik, Maliyet, Teslimat, Güvenlik, İnsan, Çevre, Diğer' },
    { key: 'unit', label: 'Birim', required: false, type: 'string', description: 'Ör. %, adet, TL, dk' },
    { key: 'direction', label: 'Yön', required: false, type: 'string', description: 'Yüksek iyi, Düşük iyi, Aralık (varsayılan Yüksek iyi)' },
    { key: 'frequency', label: 'Periyot', required: true, type: 'string', description: 'Günlük, Haftalık, Aylık, Çeyreklik, Yıllık' },
    { key: 'orgUnitCode', label: 'Organizasyon Birimi Kodu', required: true, type: 'string' },
    { key: 'ownerUsername', label: 'KPI Sahibi (Kullanıcı Adı)', required: true, type: 'string', description: 'Kullanıcı adı / sicil no' },
    { key: 'dataEntryUsername', label: 'Veri Giriş Sorumlusu', required: false, type: 'string', description: 'Boşsa KPI sahibi' },
    { key: 'warningTolerancePct', label: 'Uyarı Toleransı %', required: false, type: 'number', description: 'Hedefin yüzdesi (varsayılan 5)' },
    { key: 'entryDueDays', label: 'Giriş Süresi (gün)', required: false, type: 'number', description: 'Dönem sonundan sonra kaç gün içinde girilmeli (varsayılan 5)' },
    { key: 'startPeriod', label: 'Başlangıç Dönemi', required: false, type: 'string', description: 'Ör. 2026-01 veya 01.01.2026' },
    { key: 'aggregation', label: 'Toplulaştırma', required: false, type: 'string', description: 'Toplam, Ortalama, Son, Min, Maks (YTD için)' },
    { key: 'formula', label: 'Formül', required: false, type: 'string', description: 'Ör. ({HURDA_ADET} / {URETIM_ADET}) * 100' },
  ];
  sampleRows = [
    { code: 'OEE', name: 'Genel Ekipman Verimliliği', category: 'Verimlilik', unit: '%', direction: 'Yüksek iyi', frequency: 'Aylık', orgUnitCode: 'URT-H1', ownerUsername: '2001', warningTolerancePct: 5, entryDueDays: 5, startPeriod: '2026-01' },
  ];

  constructor(
    private readonly registry: ImportRegistry,
    private readonly prisma: PrismaService,
    private readonly defs: KpiDefinitionsService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  private async lookups(rows: ParsedRow[]) {
    const usernames = [...new Set(rows.flatMap((r) => [r.values.ownerUsername, r.values.dataEntryUsername]).filter(Boolean).map((u) => normalizeUsername(String(u))))];
    const codes = [...new Set(rows.map((r) => r.values.orgUnitCode).filter(Boolean).map(String))];
    const [users, units] = await Promise.all([
      this.prisma.db.user.findMany({ where: { username: { in: usernames }, isActive: true }, select: { id: true, username: true } }),
      this.prisma.db.orgUnit.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }),
    ]);
    return { users: new Map(users.map((u) => [u.username, u.id])), units: new Map(units.map((u) => [u.code!, u.id])) };
  }

  async validate(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const { users, units } = await this.lookups(rows);
    const errors: ImportRowError[] = [];
    const seen = new Map<string, number>();
    for (const r of rows) {
      const v = r.values;
      const err = (column: string, message: string) => errors.push({ row: r.rowNumber, column, message });
      const code = normalizeKpiCode(String(v.code));
      if (!/^[A-Z0-9_.-]{2,40}$/.test(code)) err('KPI Kodu', 'Kod 2-40 karakter: harf, rakam, _ . - olmalı');
      if (seen.has(code)) err('KPI Kodu', `Dosyada tekrar eden kod (satır ${seen.get(code)})`);
      seen.set(code, r.rowNumber);
      const freq = parseFrequency(v.frequency);
      if (!freq) err('Periyot', `Geçersiz periyot: ${v.frequency}`);
      if (v.category && !parseCategory(v.category)) err('Kategori', `Geçersiz kategori: ${v.category}`);
      if (v.direction && !parseDirection(v.direction)) err('Yön', `Geçersiz yön: ${v.direction}`);
      if (v.aggregation && !parseAggregation(v.aggregation)) err('Toplulaştırma', `Geçersiz toplulaştırma: ${v.aggregation}`);
      if (!units.has(String(v.orgUnitCode))) err('Organizasyon Birimi Kodu', `Birim bulunamadı: ${v.orgUnitCode}`);
      if (!users.has(normalizeUsername(String(v.ownerUsername)))) err('KPI Sahibi (Kullanıcı Adı)', `Kullanıcı bulunamadı: ${v.ownerUsername}`);
      if (v.dataEntryUsername && !users.has(normalizeUsername(String(v.dataEntryUsername)))) err('Veri Giriş Sorumlusu', `Kullanıcı bulunamadı: ${v.dataEntryUsername}`);
      if (v.startPeriod && freq && !coercePeriodInput(v.startPeriod, freq)) err('Başlangıç Dönemi', `Geçersiz dönem: ${v.startPeriod}`);
      if (v.warningTolerancePct !== null && v.warningTolerancePct !== undefined && (Number(v.warningTolerancePct) < 0 || Number(v.warningTolerancePct) > 1000)) {
        err('Uyarı Toleransı %', 'Toleranslar 0-1000 arasında olmalı');
      }
    }
    return errors;
  }

  async commit(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const { users, units } = await this.lookups(rows);
    const errors: ImportRowError[] = [];
    // Formüllü KPI'lar girdilerinden sonra işlensin
    const ordered = [...rows].sort((a, b) => Number(!!a.values.formula) - Number(!!b.values.formula));
    for (const r of ordered) {
      const v = r.values;
      try {
        const code = normalizeKpiCode(String(v.code));
        const frequency = parseFrequency(v.frequency)!;
        const common = {
          name: String(v.name),
          unit: v.unit ? String(v.unit) : undefined,
          category: v.category ? parseCategory(v.category)! : undefined,
          direction: v.direction ? parseDirection(v.direction)! : undefined,
          aggregation: v.aggregation ? parseAggregation(v.aggregation)! : undefined,
          warningTolerancePct: v.warningTolerancePct !== null ? Number(v.warningTolerancePct) : undefined,
          entryDueDays: v.entryDueDays !== null ? Math.round(Number(v.entryDueDays)) : undefined,
          orgUnitId: units.get(String(v.orgUnitCode))!,
          ownerId: users.get(normalizeUsername(String(v.ownerUsername)))!,
          dataEntryUserId: v.dataEntryUsername ? users.get(normalizeUsername(String(v.dataEntryUsername)))! : undefined,
          startPeriod: v.startPeriod ? coercePeriodInput(v.startPeriod, frequency) : undefined,
          formula: v.formula ? String(v.formula) : undefined,
        };
        const existing = await this.prisma.db.kpiDefinition.findFirst({ where: { code }, select: { id: true, frequency: true } });
        if (existing) {
          const dto: UpdateKpiDto = { ...common, ...(existing.frequency !== frequency ? { frequency } : {}) };
          await this.defs.update(existing.id, dto);
        } else {
          const dto: CreateKpiDto = { ...common, code, frequency };
          await this.defs.create(dto);
        }
      } catch (err) {
        errors.push({ row: r.rowNumber, column: null, message: (err as Error).message });
      }
    }
    return errors;
  }
}

/** Hedefler: KPI kodu + dönem + hedef (+ üst sınır). */
@Injectable()
export class KpiTargetsImporter implements Importer, OnModuleInit {
  type = 'kpi-targets';
  label = 'KPI Hedefleri';
  permission = PERMISSIONS.KPI_MANAGE;
  columns: Importer['columns'] = [
    { key: 'kpiCode', label: 'KPI Kodu', required: true, type: 'string' },
    { key: 'period', label: 'Dönem', required: true, type: 'string', description: 'Ör. 2026-10, 2026-Q4, 2026-W41 ya da bir tarih (01.10.2026) — KPI periyoduna çevrilir' },
    { key: 'target', label: 'Hedef', required: true, type: 'number' },
    { key: 'targetMax', label: 'Hedef Üst Sınır', required: false, type: 'number', description: 'Yalnız "Aralık" yönlü KPI\'lar' },
  ];
  sampleRows = [{ kpiCode: 'OEE', period: '2026-10', target: 85 }];

  constructor(
    private readonly registry: ImportRegistry,
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly defs: KpiDefinitionsService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  private async load(rows: ParsedRow[]) {
    const codes = [...new Set(rows.map((r) => normalizeKpiCode(String(r.values.kpiCode))))];
    const kpis = await this.prisma.db.kpiDefinition.findMany({ where: { code: { in: codes } }, include: kpiInclude });
    return new Map(kpis.map((k) => [k.code, k]));
  }

  async validate(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const kpis = await this.load(rows);
    const errors: ImportRowError[] = [];
    for (const r of rows) {
      const k = kpis.get(normalizeKpiCode(String(r.values.kpiCode)));
      if (!k) { errors.push({ row: r.rowNumber, column: 'KPI Kodu', message: `KPI bulunamadı: ${r.values.kpiCode}` }); continue; }
      if (!this.access.canManage(k)) errors.push({ row: r.rowNumber, column: 'KPI Kodu', message: `Bu KPI için hedef tanımlama yetkiniz yok: ${k.code}` });
      if (!coercePeriodInput(r.values.period, k.frequency)) errors.push({ row: r.rowNumber, column: 'Dönem', message: `Geçersiz dönem (${k.frequency}): ${r.values.period}` });
    }
    return errors;
  }

  async commit(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const kpis = await this.load(rows);
    const errors: ImportRowError[] = [];
    const byKpi = new Map<string, ParsedRow[]>();
    for (const r of rows) {
      const code = normalizeKpiCode(String(r.values.kpiCode));
      byKpi.set(code, [...(byKpi.get(code) ?? []), r]);
    }
    for (const [code, items] of byKpi) {
      const k = kpis.get(code)!;
      try {
        await this.defs.setTargets(k.id, {
          targets: items.map((r) => ({
            period: coercePeriodInput(r.values.period, k.frequency)!,
            target: Number(r.values.target),
            targetMax: r.values.targetMax !== null ? Number(r.values.targetMax) : null,
          })),
        });
      } catch (err) {
        for (const r of items) errors.push({ row: r.rowNumber, column: null, message: (err as Error).message });
      }
    }
    return errors;
  }
}

/** Değerler: mevcut değerin üzerine yazılırsa revizyon kaydı ("Excel içe aktarma") tutulur. */
@Injectable()
export class KpiValuesImporter implements Importer, OnModuleInit {
  type = 'kpi-values';
  label = 'KPI Değerleri';
  permission = PERMISSIONS.KPI_VALUE_ENTER;
  columns: Importer['columns'] = [
    { key: 'kpiCode', label: 'KPI Kodu', required: true, type: 'string' },
    { key: 'period', label: 'Dönem', required: true, type: 'string', description: 'Ör. 2026-10, 2026-Q4, 2026-W41 ya da bir tarih (01.10.2026) — KPI periyoduna çevrilir' },
    { key: 'value', label: 'Değer', required: true, type: 'number' },
    { key: 'note', label: 'Not', required: false, type: 'string' },
  ];
  sampleRows = [{ kpiCode: 'OEE', period: '2026-09', value: 82.5, note: '' }];

  constructor(
    private readonly registry: ImportRegistry,
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly values: KpiValuesService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  private async load(rows: ParsedRow[]) {
    const codes = [...new Set(rows.map((r) => normalizeKpiCode(String(r.values.kpiCode))))];
    const kpis = await this.prisma.db.kpiDefinition.findMany({ where: { code: { in: codes } }, include: kpiInclude });
    return new Map<string, KpiRow>(kpis.map((k) => [k.code, k]));
  }

  async validate(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const kpis = await this.load(rows);
    const errors: ImportRowError[] = [];
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = kpis.get(normalizeKpiCode(String(r.values.kpiCode)));
      const err = (column: string, message: string) => errors.push({ row: r.rowNumber, column, message });
      if (!k) { err('KPI Kodu', `KPI bulunamadı: ${r.values.kpiCode}`); continue; }
      if (!k.isActive) err('KPI Kodu', `KPI pasif: ${k.code}`);
      if (k.formula) err('KPI Kodu', `Hesaplanan KPI'ya manuel değer girilemez: ${k.code}`);
      else if (!this.access.canEnter(k)) err('KPI Kodu', `Bu KPI için değer girme yetkiniz yok: ${k.code}`);
      const period = coercePeriodInput(r.values.period, k.frequency);
      if (!period || !isValidPeriod(period, k.frequency)) { err('Dönem', `Geçersiz dönem (${k.frequency}): ${r.values.period}`); continue; }
      const key = `${k.code}|${period}`;
      if (seen.has(key)) err('Dönem', `Dosyada aynı KPI ve dönem tekrar ediyor (satır ${seen.get(key)})`);
      seen.set(key, r.rowNumber);
    }
    return errors;
  }

  async commit(rows: ParsedRow[]): Promise<ImportRowError[]> {
    const kpis = await this.load(rows);
    const errors: ImportRowError[] = [];
    for (const r of rows) {
      const k = kpis.get(normalizeKpiCode(String(r.values.kpiCode)))!;
      try {
        await this.values.setValueFor(k, {
          period: coercePeriodInput(r.values.period, k.frequency)!,
          value: Number(r.values.value),
          note: (r.values.note as string | null) ?? null,
          source: 'IMPORT',
          reason: 'Excel içe aktarma',
        });
      } catch (err) {
        const body = (err as { getResponse?: () => { message?: string } }).getResponse?.();
        errors.push({ row: r.rowNumber, column: null, message: body?.message ?? (err as Error).message });
      }
    }
    return errors;
  }
}

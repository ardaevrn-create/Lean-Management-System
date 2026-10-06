/**
 * KPI demo verisi (seed.ts içinden çağrılır): tanımlar, yıllık hedefler, geçmiş değerler,
 * sapma açıklamaları + aksiyonlar ve bilerek eksik bırakılan son ay girişleri.
 * Gerçek servisleri kullanır (iş kuralları, revizyon ve denetim izi devrede).
 */
import type { INestApplicationContext } from '@nestjs/common';
import { currentPeriod, lastEndedPeriod, periodDueDate, periodsBetween, periodsOfYear, type KpiCategory, type KpiDirection } from '@lean/shared';
import { KpiAccessService } from '../src/modules/kpi/kpi-access.service';
import { KpiDefinitionsService } from '../src/modules/kpi/kpi-definitions.service';
import { KpiDeviationsService } from '../src/modules/kpi/kpi-deviations.service';
import { KpiValuesService } from '../src/modules/kpi/kpi-values.service';

interface SeedKpi {
  code: string;
  name: string;
  category: KpiCategory;
  unit: string;
  direction: KpiDirection;
  decimals: number;
  unitKey: 'hat1' | 'hat2' | 'kalite';
  owner: string;
  entry: string | null;
  target: number | null;
  aggregation?: 'SUM' | 'AVERAGE' | 'LAST';
  formula?: string;
  /** Ocak'tan başlayarak aylık değerler; null = bilerek girilmemiş */
  values: (number | null)[];
}

const KPIS: SeedKpi[] = [
  { code: 'OEE', name: 'Genel Ekipman Verimliliği (OEE)', category: 'PRODUCTIVITY', unit: '%', direction: 'HIGHER_BETTER', decimals: 1, unitKey: 'hat1', owner: '2001', entry: '3001', target: 85, values: [86, 87.5, 84, 88, 76, 85.5, 86.2, 82.5, 71] },
  { code: 'HURDA_ADET', name: 'Hurda Adedi', category: 'QUALITY', unit: 'adet', direction: 'LOWER_BETTER', decimals: 0, unitKey: 'hat1', owner: '2001', entry: '3002', target: null, aggregation: 'SUM', values: [18, 22, 20, 35, 25, 19, 21, 24, 30] },
  { code: 'URETIM_ADET', name: 'Üretim Adedi', category: 'PRODUCTIVITY', unit: 'adet', direction: 'HIGHER_BETTER', decimals: 0, unitKey: 'hat1', owner: '2001', entry: '3002', target: null, aggregation: 'SUM', values: [1200, 1250, 1100, 1300, 1280, 1220, 1240, 1260, 1000] },
  { code: 'HURDA_ORAN', name: 'Hurda Oranı', category: 'QUALITY', unit: '%', direction: 'LOWER_BETTER', decimals: 2, unitKey: 'hat1', owner: '2001', entry: null, target: 2, formula: '({HURDA_ADET} / {URETIM_ADET}) * 100', values: [] },
  { code: 'IS_KAZASI', name: 'İş Kazası Sayısı', category: 'SAFETY', unit: 'adet', direction: 'LOWER_BETTER', decimals: 0, unitKey: 'hat2', owner: '2002', entry: '3003', target: 1, aggregation: 'SUM', values: [0, 0, 1, 2, 0, 0, 1, 0, null] },
  { code: 'ZAMANINDA_TESLIMAT', name: 'Zamanında Teslimat', category: 'DELIVERY', unit: '%', direction: 'HIGHER_BETTER', decimals: 1, unitKey: 'hat2', owner: '2002', entry: '3003', target: 95, values: [96, 97, 93.5, 98, 95.5, 94, 96, 90, 97] },
  { code: 'MUSTERI_SIKAYETI', name: 'Müşteri Şikayeti', category: 'QUALITY', unit: 'adet', direction: 'LOWER_BETTER', decimals: 0, unitKey: 'kalite', owner: '1003', entry: null, target: 4, aggregation: 'SUM', values: [3, 2, 5, 4, 6, 3, 2, 4, null] },
  { code: 'ENERJI_KWH', name: 'Enerji Tüketimi', category: 'ENVIRONMENT', unit: 'kWh', direction: 'LOWER_BETTER', decimals: 0, unitKey: 'hat1', owner: '2001', entry: '3001', target: 50000, aggregation: 'SUM', values: [48000, 49500, 51000, 50500, 56000, 49000, 47500, 52000, 51500] },
  { code: 'SKOR_5S', name: '5S Denetim Skoru', category: 'PEOPLE', unit: 'puan', direction: 'HIGHER_BETTER', decimals: 0, unitKey: 'hat2', owner: '2002', entry: '3003', target: 80, values: [82, 84, 79, 85, 70, 83, 86, 81, null] },
];

export async function seedKpis(
  app: INestApplicationContext,
  ctx: { byNo: Record<string, string>; units: Record<'hat1' | 'hat2' | 'kalite', string>; day: (offset: number) => string },
) {
  const defs = app.get(KpiDefinitionsService);
  const values = app.get(KpiValuesService);
  const deviations = app.get(KpiDeviationsService);
  const access = app.get(KpiAccessService);

  const today = new Date();
  const year = Number(currentPeriod('YEARLY', today));
  const lastEnded = lastEndedPeriod('MONTHLY', today);
  const months = lastEnded.startsWith(`${year}-`) ? periodsBetween('MONTHLY', `${year}-01`, lastEnded) : [];
  const ids: Record<string, string> = {};

  for (const k of KPIS) {
    const created = await defs.create({
      code: k.code,
      name: k.name,
      category: k.category,
      unit: k.unit,
      decimals: k.decimals,
      direction: k.direction,
      frequency: 'MONTHLY',
      aggregation: k.aggregation ?? 'AVERAGE',
      warningTolerancePct: 5,
      entryDueDays: 5,
      orgUnitId: ctx.units[k.unitKey],
      ownerId: ctx.byNo[k.owner],
      dataEntryUserId: k.entry ? ctx.byNo[k.entry] : null,
      formula: k.formula ?? null,
      startPeriod: `${year}-01`,
    });
    ids[k.code] = created.id;
    if (k.target !== null) {
      await defs.setTargets(created.id, { targets: periodsOfYear('MONTHLY', year).map((period) => ({ period, target: k.target })) });
    }
  }

  // Geçmiş aylar: girişler son giriş tarihinden 1 gün önce yapılmış (zamanında)
  for (const k of KPIS.filter((x) => !x.formula)) {
    const row = await access.load(ids[k.code]);
    for (const [i, period] of months.entries()) {
      const v = k.values[i % k.values.length];
      if (v === null || v === undefined) continue; // bilerek eksik bırakılan giriş
      await values.setValueFor(row, { period, value: v, enteredAt: new Date(periodDueDate(period, row.entryDueDays).getTime() - 86_400_000) });
    }
  }

  // Sapma açıklamaları ve karşı önlem aksiyonları
  const at = (idx: number) => months[idx];
  const explain = async (code: string, idx: number, explanation: string, rootCause: string, action?: { title: string; owner: string }, decide?: boolean) => {
    const period = at(idx);
    if (!period) return;
    const saved = await deviations.save({ kpiId: ids[code], period, explanation, rootCause });
    if (action) {
      await deviations.createAction(saved.deviation!.id, { title: action.title, ownerId: ctx.byNo[action.owner], dueDate: ctx.day(21), priority: 'HIGH' });
    }
    if (decide) await deviations.decide(saved.deviation!.id, true, 'Aksiyon planı uygun');
  };

  await explain('OEE', 4, 'Plansız duruşlar nedeniyle OEE düştü (kalıp değişimi uzadı).', 'Standart kalıp değişim prosedürünün uygulanmaması', { title: 'SMED çalışması ile kalıp değişim süresinin kısaltılması', owner: '2001' }, true);
  await explain('OEE', 7, 'Hat 1 bakım duruşu planlanandan uzun sürdü.', 'Yedek parça gecikmesi');
  await explain('HURDA_ORAN', 3, 'Nisan ayında yeni hammadde partisi kaynaklı hurda artışı.', 'Tedarikçi parti kalitesi', { title: 'Tedarikçi giriş kalite kontrol planının sıkılaştırılması', owner: '1003' });
  await explain('ZAMANINDA_TESLIMAT', 2, 'Mart ayında nakliye gecikmeleri yaşandı.', 'Lojistik firması kapasite sorunu');
  await explain('ENERJI_KWH', 4, 'Mayıs ayında kompresör hava kaçakları enerji tüketimini artırdı.', 'Periyodik hava kaçağı kontrolü yapılmıyor', { title: 'Aylık hava kaçağı tarama rutininin başlatılması', owner: '1004' }, true);
  await explain('IS_KAZASI', 3, 'Nisan ayında iki ramak kala olayı kazaya dönüştü.', 'Güvenlik bariyeri eksikliği', { title: 'Hat 2 emniyet bariyerlerinin tamamlanması', owner: '2002' });
}

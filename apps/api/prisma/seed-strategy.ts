/**
 * Stratejik plan + Hoshin demo verisi (seed.ts içinden, KPI seed'inden sonra çağrılır).
 * Gerçek servisleri kullanır; hedefler mevcut KPI kodlarına bağlanır, böylece bowling gerçek renkler gösterir.
 */
import type { INestApplicationContext } from '@nestjs/common';
import type { HoshinLevel } from '@lean/shared';
import { RequestContext } from '../src/common/request-context';
import { AccessService } from '../src/core/auth/access.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { HoshinCatchballService } from '../src/modules/strategy/hoshin-catchball.service';
import { HoshinGoalsService } from '../src/modules/strategy/hoshin-goals.service';
import { HoshinXMatrixService } from '../src/modules/strategy/hoshin-xmatrix.service';
import { StrategyPlansService } from '../src/modules/strategy/strategy-plans.service';
import type { CreateGoalDto } from '../src/modules/strategy/strategy.dto';

const YEAR = 2026;

export async function seedStrategy(app: INestApplicationContext, ctx: { byNo: Record<string, string>; day: (offset: number) => string }) {
  const prisma = app.get(PrismaService);
  const rc = app.get(RequestContext);
  const access = app.get(AccessService);
  const plans = app.get(StrategyPlansService);
  const goals = app.get(HoshinGoalsService);
  const catchball = app.get(HoshinCatchballService);
  const xmatrix = app.get(HoshinXMatrixService);
  const { byNo } = ctx;

  const admin = rc.user;
  const asUser = async <T>(no: string, fn: () => Promise<T>): Promise<T> => {
    const u = await prisma.db.user.findUniqueOrThrow({ where: { id: byNo[no] } });
    const assignments = await access.loadAssignments(u.id, rc.tenantId);
    rc.setUser({
      id: u.id, tenantId: u.tenantId, username: u.username, fullName: u.fullName, employeeId: u.employeeId, isPlatformAdmin: false, isApiKey: false,
      mustChangePassword: false, permissions: new Set(assignments.flatMap((a) => a.permissions)), assignments,
    });
    try {
      return await fn();
    } finally {
      rc.setUser(admin);
    }
  };

  const unitIds: Record<string, string> = {};
  for (const u of await prisma.db.orgUnit.findMany({ where: { code: { not: null } } })) unitIds[u.code!] = u.id;
  const kpiIds: Record<string, string> = {};
  for (const k of await prisma.db.kpiDefinition.findMany()) kpiIds[k.code] = k.id;

  // ---- Plan, vizyon / misyon / değerler ----
  const plan = await plans.create({
    name: '2026–2030 Stratejik Planı', startYear: 2026, endYear: 2030,
    vision: 'Bölgenin en verimli ve en güvenilir kalite referansı olmak.',
    mission: 'Müşterilerimize hatasız ürünü zamanında ve rekabetçi maliyetle sunmak; yalın yönetim kültürüyle sürekli iyileşmek.',
    values: ['Müşteri odaklılık', 'Sürekli iyileşme', 'Güvenlik önce', 'Şeffaflık', 'Takım ruhu'],
  });
  const swot: [Parameters<StrategyPlansService['addSwot']>[1]['type'], string, number][] = [
    ['STRENGTH', 'Deneyimli ve istikrarlı çalışan kadrosu', 5], ['STRENGTH', 'Yerleşik kalite yönetim sistemi (ISO 9001)', 4], ['STRENGTH', 'Esnek montaj hatları', 3],
    ['WEAKNESS', 'Plansız duruşların yüksekliği', 5], ['WEAKNESS', 'Manuel veri toplama ve raporlama', 4], ['WEAKNESS', 'Yedek parça tedarik süreleri', 3],
    ['OPPORTUNITY', 'Otomotiv yan sanayiinde artan yerli üretim talebi', 5], ['OPPORTUNITY', 'Dijital dönüşüm teşvikleri', 3], ['OPPORTUNITY', 'Yeni müşteri segmentleri', 3],
    ['THREAT', 'Hammadde fiyat dalgalanmaları', 4], ['THREAT', 'Enerji maliyetlerindeki artış', 4], ['THREAT', 'Nitelikli işgücü kaybı', 3],
  ];
  for (const [type, text, impact] of swot) await plans.addSwot(plan.id, { type, text, impact });
  const obj: Record<string, string> = {};
  for (const [key, title, perspective, description] of [
    ['SA1', 'Maliyet liderliği', 'FINANCIAL', 'Enerji, hurda ve verimlilik kalemlerinde maliyet avantajı'],
    ['SA2', 'Müşteri memnuniyeti ve güveni', 'CUSTOMER', 'Şikayetleri azaltmak, teslimat performansını yükseltmek'],
    ['SA3', 'Operasyonel mükemmellik', 'INTERNAL_PROCESS', 'OEE ve süreç stabilitesinin yükseltilmesi'],
    ['SA4', 'Yetkin ve güvenli çalışma ortamı', 'LEARNING_GROWTH', '5S, güvenlik ve çalışan gelişimi'],
  ] as const) {
    const o = await plans.addObjective(plan.id, { code: key, title, perspective, description, ownerId: byNo['1001'] });
    obj[key] = o.id;
  }

  // ---- Hedef ağacı ----
  const g: Record<string, string> = {};
  const mk = async (key: string, level: HoshinLevel, parent: string | null, title: string, o: Partial<CreateGoalDto> & { owner: string; kpi?: string; org?: string }) => {
    const { owner, kpi, org, ...rest } = o;
    const d = await goals.create({
      planId: plan.id, level, parentId: parent ? g[parent] : null, title, year: level === 'BREAKTHROUGH' ? 2030 : YEAR, ownerId: byNo[owner],
      orgUnitId: org ? unitIds[org] : null, kpiId: kpi ? kpiIds[kpi] : null, ...rest,
    } as CreateGoalDto);
    g[key] = d.id;
    await catchball.activate(d.id);
  };

  await mk('AH1', 'BREAKTHROUGH', null, "2030'a kadar OEE %85", { owner: '1001', kpi: 'OEE', objectiveId: obj.SA3, baseline: 76, targetValue: 85, weight: 2 });
  await mk('AH2', 'BREAKTHROUGH', null, 'Müşteri şikayetlerini %50 azalt (2030)', { owner: '1001', kpi: 'MUSTERI_SIKAYETI', objectiveId: obj.SA2, baseline: 56, targetValue: 28 });
  await mk('AH3', 'BREAKTHROUGH', null, 'Enerji tüketimini %15 düşür (2030)', { owner: '1001', kpi: 'ENERJI_KWH', objectiveId: obj.SA1, baseline: 630_000, targetValue: 535_000 });

  await mk('YH1', 'ANNUAL', 'AH1', '2026 OEE ortalaması %85', { owner: '1002', org: 'URT', objectiveId: obj.SA3, unit: '%', baseline: 78, targetValue: 85 });
  await mk('YH2', 'ANNUAL', 'AH2', '2026 yılında müşteri şikayeti ≤ 48', { owner: '1003', org: 'KAL', kpi: 'MUSTERI_SIKAYETI', objectiveId: obj.SA2, baseline: 56, targetValue: 48 });
  await mk('YH3', 'ANNUAL', 'AH3', '2026 enerji tüketimi ≤ 600.000 kWh', { owner: '1004', org: 'BKM', kpi: 'ENERJI_KWH', objectiveId: obj.SA1, baseline: 630_000, targetValue: 600_000 });
  await mk('YH4', 'ANNUAL', 'AH2', 'Zamanında teslimat ≥ %95', { owner: '1002', org: 'URT', kpi: 'ZAMANINDA_TESLIMAT', objectiveId: obj.SA2, baseline: 92, targetValue: 95 });

  await mk('OP1', 'PRIORITY', 'YH1', 'SMED: hızlı kalıp değişimi', {
    owner: '2001', org: 'URT-H1', unit: 'dk', baseline: 90, targetValue: 45, direction: 'LOWER_BETTER', aggregation: 'LAST', startDate: `${YEAR}-01-01`, endDate: `${YEAR}-12-31`,
  });
  await mk('OP2', 'PRIORITY', 'YH2', 'Hurda azaltma programı', { owner: '1003', org: 'KAL', kpi: 'HURDA_ORAN', baseline: 3, targetValue: 2 });
  await mk('OP3', 'PRIORITY', 'YH3', 'Kompresör hava kaçağı tarama rutini', { owner: '1004', org: 'BKM' });
  await mk('OP4', 'PRIORITY', 'YH4', 'Teslimat planlama sistemi iyileştirmesi', { owner: '1002', org: 'URT' });
  await mk('OP5', 'PRIORITY', 'YH1', '5S yaygınlaştırma', { owner: '2002', org: 'URT-H2', kpi: 'SKOR_5S', objectiveId: obj.SA4, baseline: 78, targetValue: 80 });

  await mk('BH1', 'DEPARTMENT', 'YH1', 'Hat 1 OEE ≥ %85', { owner: '2001', org: 'URT-H1', kpi: 'OEE', baseline: 78, targetValue: 85 });
  await mk('BH2', 'DEPARTMENT', 'OP5', 'Hat 2 5S skoru ≥ 80', { owner: '2002', org: 'URT-H2', kpi: 'SKOR_5S', baseline: 78, targetValue: 80 });
  await mk('BH3', 'DEPARTMENT', 'YH4', 'Hat 2 zamanında teslimat ≥ %95', { owner: '2002', org: 'URT-H2', kpi: 'ZAMANINDA_TESLIMAT', baseline: 92, targetValue: 95 });
  await mk('BH4', 'DEPARTMENT', 'OP2', 'Hat 1 hurda oranı ≤ %2', { owner: '2001', org: 'URT-H1', kpi: 'HURDA_ORAN', baseline: 3, targetValue: 2 });

  // ---- Elle takip: SMED kalıp değişim süresi (kırmızı ay + karşı önlem) ----
  const plan12 = [88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 45];
  const actual = [87, 83, 79, 75, 82, 69, 63, 59, 55];
  await asUser('2001', async () => {
    await goals.setMonthly(g.OP1, {
      year: YEAR, months: actual.map((a, i) => ({ month: i + 1, actual: a, comment: i === 4 ? 'Mayıs: yeni kalıp seti devreye alınırken değişim süreleri uzadı' : undefined })),
    });
  });
  await goals.setMonthly(g.OP1, { year: YEAR, months: plan12.map((p, i) => ({ month: i + 1, plan: p })) });
  await asUser('2001', () =>
    goals.countermeasure(g.OP1, {
      period: `${YEAR}-05`, explanation: 'Yeni kalıp setinde operatörler SMED standardına alışmadı; ayar adımları ekipman üzerinde işaretli değildi.',
      title: 'Yeni kalıp seti için SMED standart iş talimatı ve ayar işaretlemeleri', ownerId: byNo['2001'], dueDate: ctx.day(14), priority: 'HIGH',
    }),
  );

  // ---- Catchball: 1002 → 2001 (IN_CATCHBALL) ----
  const cb = await asUser('1002', () =>
    goals.create({
      planId: plan.id, level: 'DEPARTMENT', parentId: g.YH1, title: 'Hat 1 planlı bakım uyumu ≥ %95', year: YEAR, ownerId: byNo['2001'], orgUnitId: unitIds['URT-H1'],
      unit: '%', baseline: 85, targetValue: 95, propose: true,
    } as CreateGoalDto),
  );
  g.BH5 = cb.id;
  await asUser('2001', () =>
    catchball.addEntry(g.BH5, { type: 'COUNTER_PROPOSAL', proposedTarget: 90, message: 'Yedek parça gecikmeleri nedeniyle ilk yıl %90 ile başlayalım, sonraki yıl %95.' }),
  );

  // ---- X-Matrix korelasyonları ----
  const items: Parameters<HoshinXMatrixService['set']>[1]['items'] = [];
  const goalLink = (from: string, to: string, strength: 'STRONG' | 'MEDIUM' | 'WEAK') => items.push({ fromGoalId: g[from], targetType: 'GOAL', targetId: g[to], strength });
  const kpiLink = (from: string, code: string, strength: 'STRONG' | 'MEDIUM' | 'WEAK') => items.push({ fromGoalId: g[from], targetType: 'KPI', targetId: kpiIds[code], strength });
  const userLink = (from: string, no: string, strength: 'STRONG' | 'MEDIUM' | 'WEAK', role: 'RESPONSIBLE' | 'SUPPORT') =>
    items.push({ fromGoalId: g[from], targetType: 'USER', targetId: byNo[no], strength, role });
  goalLink('YH1', 'AH1', 'STRONG'); goalLink('YH2', 'AH2', 'STRONG'); goalLink('YH3', 'AH3', 'STRONG'); goalLink('YH4', 'AH2', 'WEAK'); goalLink('YH1', 'AH3', 'WEAK');
  goalLink('OP1', 'YH1', 'STRONG'); goalLink('OP1', 'YH4', 'WEAK'); goalLink('OP2', 'YH2', 'STRONG'); goalLink('OP2', 'YH1', 'MEDIUM');
  goalLink('OP3', 'YH3', 'STRONG'); goalLink('OP4', 'YH4', 'STRONG'); goalLink('OP5', 'YH1', 'MEDIUM');
  kpiLink('OP1', 'OEE', 'STRONG'); kpiLink('OP2', 'HURDA_ORAN', 'STRONG'); kpiLink('OP2', 'MUSTERI_SIKAYETI', 'MEDIUM'); kpiLink('OP3', 'ENERJI_KWH', 'STRONG');
  kpiLink('OP4', 'ZAMANINDA_TESLIMAT', 'STRONG'); kpiLink('OP5', 'SKOR_5S', 'STRONG'); kpiLink('OP5', 'OEE', 'WEAK');
  kpiLink('AH1', 'OEE', 'STRONG'); kpiLink('AH2', 'MUSTERI_SIKAYETI', 'STRONG'); kpiLink('AH3', 'ENERJI_KWH', 'STRONG');
  userLink('OP1', '2001', 'STRONG', 'RESPONSIBLE'); userLink('OP1', '2002', 'MEDIUM', 'SUPPORT'); userLink('OP1', '1004', 'WEAK', 'SUPPORT');
  userLink('OP2', '1003', 'STRONG', 'RESPONSIBLE'); userLink('OP2', '2001', 'MEDIUM', 'SUPPORT'); userLink('OP3', '1004', 'STRONG', 'RESPONSIBLE');
  userLink('OP4', '1002', 'STRONG', 'RESPONSIBLE'); userLink('OP4', '2002', 'MEDIUM', 'SUPPORT'); userLink('OP5', '2002', 'STRONG', 'RESPONSIBLE');
  await xmatrix.set(plan.id, { year: YEAR, items });

  await plans.activate(plan.id);
}

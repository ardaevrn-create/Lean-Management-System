/**
 * Problem çözme (M5) demo verisi (seed.ts içinden, DEMO şirketi bağlamında çağrılır).
 * 4 problem: kapanmış (tam balık kılçığı + 5 Neden + aksiyon + etkin doğrulama), kök neden aşamasında, aksiyon aşamasında (gecikmiş aksiyon), yeni bildirim.
 */
import type { INestApplicationContext } from '@nestjs/common';
import type { ProblemActionKind, ProblemCauseCategory, ProblemMethod, ProblemPhase, ProblemSeverity, ProblemSource } from '@lean/shared';
import { ActionsService } from '../src/core/actions/actions.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SequenceService } from '../src/core/prisma/sequence.service';
import { RequestContext } from '../src/common/request-context';
import { problemCode } from '../src/modules/problems/problem-rules';

export interface ProblemSeedContext {
  /** Sicil no → user id */
  byNo: Record<string, string>;
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const dateStr = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

interface CauseSeed { category: ProblemCauseCategory; text: string; candidate?: boolean; children?: string[] }
interface ChainSeed { cause: string; steps: string[]; rootCause: string; confirmed?: boolean }
interface ActionSeed {
  kind: ProblemActionKind; title: string; owner: string; due: number; chain?: string; unit?: string;
  status?: 'IN_PROGRESS' | 'DONE' | 'VERIFIED'; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
interface ProblemSeed {
  title: string; description: string; source: ProblemSource; sourceLabel?: string; severity: ProblemSeverity; method: ProblemMethod;
  phase: ProblemPhase; unit: string; owner: string; reporter: string; members: [string, string][];
  createdDaysAgo: number; closedDaysAgo?: number; targetClose?: number;
  def: { what?: string; whereText?: string; occurredDaysAgo?: number; who?: string; how?: string; howMuch?: string; isNot?: string; customerName?: string; customerRef?: string; costImpact?: number };
  containment?: string;
  causes?: CauseSeed[]; chains?: ChainSeed[]; actions?: ActionSeed[];
  verification?: { result: 'EFFECTIVE' | 'NOT_EFFECTIVE'; note: string; daysAgo: number };
  /** Faz geçmişi: [faz, kaç gün önce] */
  history: [ProblemPhase, number][];
}

export async function seedProblems(app: INestApplicationContext, { byNo }: ProblemSeedContext) {
  const prisma = app.get(PrismaService);
  const ctx = app.get(RequestContext);
  const actions = app.get(ActionsService);
  const sequences = app.get(SequenceService);
  const tenantId = ctx.tenantId;

  const units: Record<string, string> = {};
  for (const u of await prisma.db.orgUnit.findMany({ select: { id: true, code: true } })) if (u.code) units[u.code] = u.id;

  const seeds: ProblemSeed[] = [
    {
      title: 'Müşteri iadesi: Kaynak dikişinde çatlak',
      description: 'Müşteri, teslim edilen 120 adet braketin 12 adetinde kaynak dikişinde çatlak tespit ederek iade etti.',
      source: 'CUSTOMER_COMPLAINT', sourceLabel: 'Müşteri şikayeti MS-2026-044', severity: 'CRITICAL', method: 'EIGHT_D', phase: 'CLOSED',
      unit: 'URT-H1', owner: '1003', reporter: '1003', members: [['2001', 'Hat şefi'], ['1004', 'Bakım'], ['3001', 'Operatör']],
      createdDaysAgo: 60, closedDaysAgo: 8, targetClose: -10,
      def: {
        what: 'Braket kaynak dikişinde çatlak', whereText: 'Hat 1 son kontrol istasyonu / müşteri sahası', occurredDaysAgo: 62, who: 'Vardiya A operatörleri',
        how: 'Müşteri giriş kontrolünde boya penetrant testi ile tespit edildi', howMuch: '120 adette 12 adet (%10)',
        isNot: 'Hat 2 ürünlerinde görülmedi; yalnız 3 mm sac kalınlığında görüldü.', customerName: 'Anadolu Otomotiv A.Ş.', customerRef: 'MS-2026-044', costImpact: 48500,
      },
      containment: 'Stoktaki ve sevk bekleyen tüm braketler %100 penetrant testinden geçirildi; müşteride kalan lot ayıklandı.',
      causes: [
        { category: 'MAN', text: 'Operatör ön ısıtma adımını atlıyor', candidate: true, children: ['Eğitim kaydı eksik'] },
        { category: 'MACHINE', text: 'Kaynak makinesi akım regülasyonu dalgalı' },
        { category: 'METHOD', text: 'Ön ısıtma prosedürü yok', candidate: true },
        { category: 'MATERIAL', text: 'Sac malzeme sertlik farkı' },
        { category: 'MEASUREMENT', text: 'Kaynak sonrası NDT örneklemesi yetersiz' },
        { category: 'ENVIRONMENT', text: 'Hat girişinde soğuk hava akımı' },
      ],
      chains: [
        { cause: 'Operatör ön ısıtma adımını atlıyor', steps: ['Parça soğukken kaynaklanıyor', 'İş talimatında ön ısıtma adımı geçmiyor', 'Talimat revizyonunda güncellenmemiş'], rootCause: 'İş talimatı ön ısıtma gereksinimini içermiyor', confirmed: true },
        { cause: 'Ön ısıtma prosedürü yok', steps: ['Prosedür tanımlı değil', 'Kaynak prosesi onayında kapsam dışı kalmış', 'Proses değişikliği yönetimi uygulanmamış'], rootCause: 'Proses değişikliği yönetiminde kalite onayı eksik', confirmed: true },
      ],
      actions: [
        { kind: 'CONTAINMENT', title: 'Stok ve sevk bekleyen braketlerin %100 penetrant testi', owner: '1003', due: -50, status: 'VERIFIED', priority: 'CRITICAL' },
        { kind: 'CORRECTIVE', title: 'Kaynak iş talimatına ön ısıtma adımının eklenmesi', owner: '2001', due: -30, chain: 'Operatör ön ısıtma adımını atlıyor', status: 'VERIFIED', priority: 'HIGH' },
        { kind: 'CORRECTIVE', title: 'Proses değişikliği formuna kalite onay adımı eklenmesi', owner: '1003', due: -25, chain: 'Ön ısıtma prosedürü yok', status: 'VERIFIED' },
        { kind: 'PREVENTIVE', title: 'Kaynakçılar için yeniden yetkilendirme eğitimi', owner: '2001', due: -15, status: 'VERIFIED' },
        { kind: 'HORIZONTAL', title: 'Hat 2 kaynak talimatlarının ön ısıtma açısından gözden geçirilmesi', owner: '2002', due: -20, unit: 'URT-H2', status: 'VERIFIED' },
      ],
      verification: { result: 'EFFECTIVE', note: 'Son 8 haftada aynı hatadan iade/ret yok; %100 NDT sonuçları temiz.', daysAgo: 9 },
      history: [['DEFINITION', 60], ['CONTAINMENT', 58], ['ROOT_CAUSE', 55], ['ACTIONS', 45], ['VERIFICATION', 20], ['CLOSED', 8]],
    },
    {
      title: 'Hat 2 boya yüzeyinde portakal kabuğu görünümü',
      description: 'Son iki haftada Hat 2 boyahane çıkışında portakal kabuğu hatası nedeniyle ret oranı arttı.',
      source: 'PROCESS', severity: 'MEDIUM', method: 'BASIC', phase: 'ROOT_CAUSE',
      unit: 'URT-H2', owner: '2002', reporter: '3003', members: [['3003', 'Operatör'], ['1003', 'Kalite']],
      createdDaysAgo: 14, targetClose: 20,
      def: { what: 'Boyalı yüzeyde portakal kabuğu', whereText: 'Hat 2 boyahane çıkışı', occurredDaysAgo: 15, who: 'Vardiya B', how: 'Görsel kontrolde fark edildi', howMuch: 'Günlük ortalama 18 parça ret' },
      containment: 'Boyahane çıkışında ek görsel kontrol noktası kuruldu; ret parçalar ayrı bölgede bekletiliyor.',
      causes: [
        { category: 'MAN', text: 'Boya karışım oranı vardiyaya göre değişiyor', candidate: true },
        { category: 'METHOD', text: 'Püskürtme mesafesi standardı yok', children: ['Talimatta mesafe belirtilmemiş'] },
        { category: 'MATERIAL', text: 'Yeni boya partisi viskozitesi yüksek', candidate: true },
      ],
      chains: [{ cause: 'Yeni boya partisi viskozitesi yüksek', steps: ['Boya partisi değişti', 'Giriş kontrolünde viskozite ölçülmedi'], rootCause: '' }],
      history: [['DEFINITION', 14], ['CONTAINMENT', 13], ['ROOT_CAUSE', 11]],
    },
    {
      title: 'Montaj hattında hava basıncı dalgalanması kaynaklı sıkma hataları',
      description: 'Pnömatik tork anahtarlarında basınç düşüşü nedeniyle eksik sıkma tespit edildi.',
      source: 'KPI_DEVIATION', sourceLabel: 'KPI: İlk geçiş verimi (FPY)', severity: 'HIGH', method: 'EIGHT_D', phase: 'ACTIONS',
      unit: 'BKM', owner: '1004', reporter: '2001', members: [['2001', 'Hat şefi'], ['3002', 'Operatör']],
      createdDaysAgo: 35, targetClose: 5,
      def: { what: 'Eksik sıkma (tork altı)', whereText: 'Montaj Hattı 1, istasyon 4-6', occurredDaysAgo: 36, who: 'Tüm vardiyalar', how: 'Tork kontrol cihazı alarm verdi', howMuch: 'FPY %96 → %91' },
      containment: 'Etkilenen istasyonlarda tork kontrolü %100 yapıldı; kompresör basıncı vardiya başında kayıt altına alınıyor.',
      causes: [
        { category: 'MACHINE', text: 'Kompresör hava kaçakları', candidate: true, children: ['Hortum bağlantılarında kaçak'] },
        { category: 'METHOD', text: 'Önleyici bakım planında hava hattı yok', candidate: true },
        { category: 'MAN', text: 'Basınç göstergesi vardiya başında kontrol edilmiyor' },
        { category: 'MEASUREMENT', text: 'Tork anahtarı kalibrasyon periyodu uzun' },
      ],
      chains: [
        { cause: 'Kompresör hava kaçakları', steps: ['Hortum bağlantıları gevşiyor', 'Bağlantılar periyodik kontrol edilmiyor', 'Hava hattı bakım planında yer almıyor'], rootCause: 'Hava hattı önleyici bakım planı kapsamında değil', confirmed: true },
      ],
      actions: [
        { kind: 'CONTAINMENT', title: 'İstasyon 4-6 tork kontrolünün %100 yapılması', owner: '2001', due: -25, status: 'VERIFIED' },
        { kind: 'CORRECTIVE', title: 'Hava hattı kaçak tespiti ve onarımı', owner: '1004', due: -4, chain: 'Kompresör hava kaçakları', priority: 'CRITICAL' },
        { kind: 'CORRECTIVE', title: 'Hava hattını önleyici bakım planına ekle', owner: '1004', due: 12, chain: 'Kompresör hava kaçakları', status: 'IN_PROGRESS' },
        { kind: 'PREVENTIVE', title: 'Vardiya başı basınç kontrol listesi', owner: '2001', due: 7 },
      ],
      history: [['DEFINITION', 35], ['CONTAINMENT', 34], ['ROOT_CAUSE', 30], ['ACTIONS', 18]],
    },
    {
      title: 'Hat 1 zemininde yağ sızıntısı, kayma riski',
      description: 'Hat 1 giriş bölgesinde hidrolik pres altında zemine yağ damlıyor; iki kez kaymaya ramak kaldı.',
      source: 'SAFETY', severity: 'HIGH', method: 'BASIC', phase: 'DEFINITION',
      unit: 'URT-H1', owner: '2001', reporter: '3001', members: [],
      createdDaysAgo: 1,
      def: {},
      history: [['DEFINITION', 1]],
    },
  ];

  for (const s of seeds) {
    const number = await sequences.next('problem');
    const code = problemCode(number);
    const created = await prisma.db.problem.create({
      data: {
        tenantId, number, title: s.title, description: s.description, source: s.source, sourceLabel: s.sourceLabel ?? null,
        orgUnitId: units[s.unit], severity: s.severity, method: s.method, phase: s.phase,
        ownerId: byNo[s.owner], reportedById: byNo[s.reporter],
        what: s.def.what ?? null, whereText: s.def.whereText ?? null,
        occurredAt: s.def.occurredDaysAgo !== undefined ? daysAgo(s.def.occurredDaysAgo) : null,
        who: s.def.who ?? null, how: s.def.how ?? null, howMuch: s.def.howMuch ?? null, isNot: s.def.isNot ?? null,
        customerName: s.def.customerName ?? null, customerRef: s.def.customerRef ?? null, costImpact: s.def.costImpact ?? null,
        containment: s.containment ?? null,
        targetCloseDate: s.targetClose !== undefined ? new Date(dateStr(s.targetClose)) : null,
        closedAt: s.closedDaysAgo !== undefined ? daysAgo(s.closedDaysAgo) : null,
        createdAt: daysAgo(s.createdDaysAgo),
        members: { create: s.members.map(([no, role]) => ({ tenantId, userId: byNo[no], role })) },
      },
    });

    // Faz geçmişi
    let prev: ProblemPhase | null = null;
    for (const [phase, ago] of s.history) {
      await prisma.db.problemHistory.create({
        data: {
          tenantId, problemId: created.id, fromPhase: prev, toPhase: phase, userId: prev === null ? byNo[s.reporter] : byNo[s.owner],
          note: prev === null ? 'Problem bildirildi' : null, createdAt: daysAgo(ago),
        },
      });
      prev = phase;
    }

    // Balık kılçığı
    const causeIds = new Map<string, string>();
    for (const [i, c] of (s.causes ?? []).entries()) {
      const row = await prisma.db.problemCause.create({
        data: { tenantId, problemId: created.id, category: c.category, text: c.text, isCandidate: !!c.candidate, sortOrder: i },
      });
      causeIds.set(c.text, row.id);
      for (const [j, child] of (c.children ?? []).entries()) {
        await prisma.db.problemCause.create({
          data: { tenantId, problemId: created.id, category: c.category, text: child, parentId: row.id, sortOrder: j },
        });
      }
    }

    // 5 Neden
    const chainIds = new Map<string, string>();
    for (const ch of s.chains ?? []) {
      const chain = await prisma.db.problemWhyChain.create({
        data: {
          tenantId, problemId: created.id, causeId: causeIds.get(ch.cause)!, rootCause: ch.rootCause || null, confirmed: !!ch.confirmed,
          steps: { create: ch.steps.map((answer, i) => ({ tenantId, order: i + 1, question: i === 0 ? 'Neden?' : null, answer })) },
        },
      });
      chainIds.set(ch.cause, chain.id);
    }

    // Aksiyonlar (çekirdek ActionsService)
    for (const a of s.actions ?? []) {
      const action = await actions.create({
        title: a.title, ownerId: byNo[a.owner], dueDate: dateStr(a.due), priority: a.priority ?? 'MEDIUM',
        orgUnitId: a.unit ? units[a.unit] : units[s.unit], sourceType: 'PROBLEM', sourceId: created.id, sourceLabel: `${code} ${s.title}`,
      });
      await prisma.db.problemAction.create({
        data: { tenantId, problemId: created.id, actionId: action.id, kind: a.kind, rootCauseChainId: a.chain ? chainIds.get(a.chain) ?? null : null },
      });
      if (a.status === 'IN_PROGRESS') await actions.changeStatus(action.id, 'IN_PROGRESS');
      if (a.status === 'DONE' || a.status === 'VERIFIED') {
        await actions.changeStatus(action.id, 'IN_PROGRESS');
        await actions.changeStatus(action.id, 'DONE', 'Tamamlandı');
        if (a.status === 'VERIFIED') await actions.changeStatus(action.id, 'VERIFIED');
      }
    }

    if (s.verification) {
      await prisma.db.problemVerification.create({
        data: {
          tenantId, problemId: created.id, result: s.verification.result, note: s.verification.note,
          verifiedById: byNo[s.owner], verifiedAt: daysAgo(s.verification.daysAgo),
        },
      });
    }
  }
}

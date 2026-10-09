/**
 * Öneri & Kaizen modülü demo verisi (seed.ts içinden, DEMO şirketi bağlamında çağrılır).
 * Gerçek servisler kullanılır: her adım ilgili kullanıcı olarak yürütülür (yetki kuralları + otomatik puanlar devrede),
 * ardından zaman damgaları son 6 aya yayılır (geriye dönük tarihleme).
 */
import type { INestApplicationContext } from '@nestjs/common';
import { SYSTEM_ROLES, type KaizenType, type SuggestionCategory } from '@lean/shared';
import { RequestContext } from '../src/common/request-context';
import { ActionsService } from '../src/core/actions/actions.service';
import { AccessService } from '../src/core/auth/access.service';
import { StorageService } from '../src/core/files/storage.service';
import { TeamsService } from '../src/core/org/teams.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { UsersService } from '../src/core/users/users.service';
import { KaizenService } from '../src/modules/suggestions/kaizen.service';
import { SuggestionSettingsService } from '../src/modules/suggestions/suggestion-settings.service';
import { SuggestionsService } from '../src/modules/suggestions/suggestions.service';

export interface SuggestionSeedContext {
  /** Sicil no → user id */
  byNo: Record<string, string>;
}

type End = 'PRE' | 'REVISE' | 'COMMITTEE' | 'HOLD' | 'ACCEPTED' | 'FAST' | 'REJECTED' | 'IN_IMPL' | 'IMPLEMENTED' | 'CLOSED' | 'WITHDRAWN';

interface SeedSuggestion {
  key: string;
  by: string;
  co?: string[];
  title: string;
  cat: SuggestionCategory;
  unit: string;
  current: string;
  proposed: string;
  benefit: string;
  cost?: number;
  saving?: number;
  self?: boolean;
  age: number;
  end: End;
  /** Değerlendirme puan seviyesi (1–5) */
  q?: number;
  implementer?: string;
  suggestionOfMonth?: string;
}

const COMMITTEE = ['1001', '1002', '1003', '4001'];
const DAY = 86_400_000;

const SUGGESTIONS: SeedSuggestion[] = [
  { key: 's1', by: '3001', title: 'Hat 1 aparat yuvalarına renk kodlaması', cat: 'QUALITY', unit: 'URT-H1', current: 'Aparatlar karışıyor, yanlış aparat takılınca ayar kaybı oluyor.', proposed: 'Her aparat ve yuvasına aynı renkte etiket/boya uygulanması.', benefit: 'Aparat değişim hatalarının sıfırlanması, ayar süresinin kısalması.', cost: 800, saving: 24000, self: true, age: 165, end: 'CLOSED', q: 4, implementer: '3001', suggestionOfMonth: 'prev' },
  { key: 's2', by: '3002', co: ['3001'], title: 'Montaj istasyonlarına anti-yorgunluk paspası', cat: 'ERGONOMICS', unit: 'URT-H1', current: 'Operatörler 8 saat sert zeminde ayakta çalışıyor, bel ve diz şikayeti var.', proposed: 'Sabit istasyonlara anti-yorgunluk paspası serilmesi.', benefit: 'Ergonomik şikayetlerde ve devamsızlıkta azalma.', cost: 6000, age: 130, end: 'IMPLEMENTED', q: 4, implementer: '2001' },
  { key: 's3', by: '3003', title: 'Hat 2 stok kutularına renkli etiketleme', cat: 'PRODUCTIVITY', unit: 'URT-H2', current: 'Kutu içeriği her seferinde açılıp kontrol ediliyor.', proposed: 'Parça kodu ve miktarını gösteren renkli etiket.', benefit: 'Parça arama süresinde azalma.', cost: 300, saving: 9000, self: true, age: 70, end: 'FAST', q: 5, implementer: '3003' },
  { key: 's4', by: '2001', title: 'Tork anahtarı kalibrasyon hatırlatıcısı', cat: 'QUALITY', unit: 'URT-H1', current: 'Kalibrasyon tarihleri elle takip ediliyor, geciken anahtarlar oluyor.', proposed: 'Anahtar üzerine QR etiket ve vadesi gelince panoda uyarı.', benefit: 'Kalibrasyon uygunsuzluklarının önlenmesi.', cost: 1200, age: 42, end: 'ACCEPTED', q: 4 },
  { key: 's5', by: '2002', title: 'Hat 2 basınçlı hava kaçağı tespit rutini', cat: 'COST', unit: 'URT-H2', current: 'Hava kaçakları vardiya sonunda fark ediliyor, kompresör sürekli yüklenmede.', proposed: 'Haftalık ultrasonik kaçak taraması ve kaçak etiketleme.', benefit: 'Enerji tüketiminde azalma.', cost: 2500, saving: 85000, age: 100, end: 'IN_IMPL', q: 5, implementer: '1004' },
  { key: 's6', by: '3001', title: 'Forklift yaya yolu zemin çizgisi', cat: 'SAFETY', unit: 'URT', current: 'Forklift ve yaya trafiği aynı koridorda kesişiyor.', proposed: 'Yaya yollarının sarı çizgiyle ayrılması ve kavşaklara ayna.', benefit: 'İş kazası riskinin azalması.', cost: 4500, age: 12, end: 'COMMITTEE', q: 4 },
  { key: 's7', by: '3003', title: 'Vardiya devir teslim formunun dijitalleştirilmesi', cat: 'PRODUCTIVITY', unit: 'URT-H2', current: 'Vardiya notları kağıtta kalıyor, bilgi kaybı yaşanıyor.', proposed: 'Tablet üzerinden devir teslim formu.', benefit: 'Bilgi kaybının önlenmesi.', cost: 9000, age: 3, end: 'PRE' },
  { key: 's8', by: '3002', title: 'Atık ayrıştırma istasyonu kurulması', cat: 'ENVIRONMENT', unit: 'URT-H1', current: 'Hat yanında atıklar karışık toplanıyor.', proposed: 'Üç bölmeli ayrıştırma istasyonu.', benefit: 'Geri dönüşüm gelirinde artış, atık maliyetinde azalma.', cost: 7000, saving: 12000, age: 55, end: 'HOLD', q: 3 },
  { key: 's9', by: '3003', title: 'Üretim alanında müzik yayını', cat: 'OTHER', unit: 'URT-H2', current: 'Çalışma ortamı sessiz ve monoton.', proposed: 'Hoparlörle müzik yayını.', benefit: 'Motivasyon artışı.', cost: 1500, age: 105, end: 'REJECTED', q: 2 },
  { key: 's10', by: '2001', title: 'Gece vardiyası aydınlatma iyileştirmesi', cat: 'SAFETY', unit: 'URT-H1', current: 'Montaj hattı sonunda aydınlatma yetersiz, kalite kontrolü zorlaşıyor.', proposed: 'LED aydınlatma armatürleri ve lux ölçümü.', benefit: 'Hatalı parçanın erken yakalanması.', cost: 12000, age: 8, end: 'PRE' },
  { key: 's11', by: '3002', title: 'Operatör eğitim videoları', cat: 'CUSTOMER', unit: 'URT-H1', current: 'Yeni başlayanlar eğitimi sadece yanında çalışarak alıyor.', proposed: 'QR kodla açılan kısa eğitim videoları.', benefit: 'Eğitim süresinde kısalma.', age: 32, end: 'WITHDRAWN' },
  { key: 's12', by: '3001', title: 'Paketlemede poka-yoke ile eksik parça kontrolü', cat: 'QUALITY', unit: 'URT-H1', current: 'Paketlemede eksik parça müşteri şikayetine dönüşüyor.', proposed: 'Ağırlık sensörlü paketleme tablası.', benefit: 'Eksik sevkiyatların önlenmesi.', cost: 1500, saving: 60000, age: 175, end: 'CLOSED', q: 5, implementer: '2001' },
  { key: 's13', by: '3003', title: 'Kalite etiketinin okunabilirliği', cat: 'QUALITY', unit: 'URT-H2', current: 'Etiket yazıcısı silik basıyor.', proposed: 'Yazıcı kafası bakım periyodu.', benefit: 'Etiket kaynaklı iade azalır.', cost: 400, age: 6, end: 'REVISE', q: 3 },
  { key: 's14', by: '4001', title: 'Saha panolarına QR kodlu öneri kutusu', cat: 'OTHER', unit: 'IK', current: 'Öneri vermek isteyen saha çalışanı formu bulamıyor.', proposed: 'Panolara QR kod yerleştirilmesi.', benefit: 'Öneri katılımının artması.', cost: 200, age: 20, end: 'COMMITTEE', q: 4 },
];

const svg = (label: string, bg: string, fg: string, sub: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="${bg}"/>` +
      `<rect x="40" y="260" width="560" height="100" rx="10" fill="${fg}" opacity="0.18"/><circle cx="320" cy="150" r="70" fill="${fg}" opacity="0.28"/>` +
      `<text x="320" y="170" font-family="Arial, sans-serif" font-size="56" font-weight="700" text-anchor="middle" fill="${fg}">${label}</text>` +
      `<text x="320" y="320" font-family="Arial, sans-serif" font-size="26" text-anchor="middle" fill="${fg}">${sub}</text></svg>`,
  );

export async function seedSuggestions(app: INestApplicationContext, { byNo }: SuggestionSeedContext) {
  const prisma = app.get(PrismaService);
  const ctx = app.get(RequestContext);
  const access = app.get(AccessService);
  const suggestions = app.get(SuggestionsService);
  const kaizens = app.get(KaizenService);
  const settings = app.get(SuggestionSettingsService);
  const storage = app.get(StorageService);
  const actions = app.get(ActionsService);
  const tenantId = ctx.tenantId;
  const admin = ctx.user;

  /** Verilen kullanıcı olarak çalıştırır (yetki kuralları gerçek kullanıcıyla uygulanır). */
  async function as<T>(no: string, fn: () => Promise<T>): Promise<T> {
    const userId = byNo[no];
    const u = await prisma.raw.user.findUniqueOrThrow({ where: { id: userId } });
    const assignments = await access.loadAssignments(userId, tenantId);
    ctx.setUser({
      id: u.id, tenantId, username: u.username, fullName: u.fullName, employeeId: u.employeeId, isPlatformAdmin: false, isApiKey: false,
      mustChangePassword: false, permissions: new Set(assignments.flatMap((a) => a.permissions)), assignments,
    });
    try {
      return await fn();
    } finally {
      ctx.setUser(admin);
    }
  }

  const unitId = async (code: string) => (await prisma.db.orgUnit.findFirstOrThrow({ where: { code } })).id;

  /* ---- Komite ekibi, roller, ayarlar ---- */
  const employees = await prisma.db.employee.findMany({ where: { employeeNo: { in: COMMITTEE } } });
  const empId = (no: string) => employees.find((e) => e.employeeNo === no)!.id;
  const team = await app.get(TeamsService).create({
    name: 'Öneri Değerlendirme Komitesi', type: 'COMMITTEE', description: 'Önerileri puanlayan ve karara bağlayan komite',
    members: COMMITTEE.map((no) => ({ employeeId: empId(no), role: no === '1001' ? 'CHAIR' : 'MEMBER' })),
  });
  const committeeRole = await prisma.db.role.findFirstOrThrow({ where: { code: SYSTEM_ROLES.COMMITTEE_MEMBER } });
  const users = app.get(UsersService);
  for (const no of COMMITTEE) {
    const existing = await prisma.db.userRole.findMany({ where: { userId: byNo[no] } });
    if (existing.some((r) => r.roleId === committeeRole.id && !r.orgUnitId)) continue;
    await users.setRoles(byNo[no], [...existing.map((r) => ({ roleId: r.roleId, orgUnitId: r.orgUnitId })), { roleId: committeeRole.id }]);
  }
  const current = await settings.get();
  await settings.update({
    criteria: current.criteria, preEvaluation: 'DIRECT_MANAGER', committeeTeamId: team.id, autoAcceptMinScore: 85, autoAcceptMaxCost: 2000,
    pointRules: current.pointRules, rewardTiers: current.rewardTiers,
  });
  const criteria = current.criteria;
  const scoresFor = (q: number, salt: number) =>
    Object.fromEntries(criteria.map((c, i) => [c.key, Math.max(0, Math.min(c.max, Math.round(((q + (((i + salt) % 3) - 1) * 0.5) / 5) * c.max)))]));

  /* ---- Öneriler ---- */
  const created: { def: SeedSuggestion; id: string }[] = [];
  for (const def of SUGGESTIONS) {
    const co = (def.co ?? []).map((n) => byNo[n]);
    const detail = await as(def.by, () =>
      suggestions.create({
        title: def.title, currentState: def.current, proposedState: def.proposed, expectedBenefit: def.benefit, category: def.cat,
        orgUnitId: undefined, estimatedCost: def.cost ?? null, estimatedSaving: def.saving ?? null, selfImplementable: def.self ?? false,
        coSubmitterIds: co,
      }),
    );
    // Alan (birim) verilen koda göre ayarlanır
    await prisma.db.suggestion.update({ where: { id: detail.id }, data: { orgUnitId: await unitId(def.unit) } });
    created.push({ def, id: detail.id });

    const pre = detail.preEvaluator?.id;
    const preNo = Object.entries(byNo).find(([, id]) => id === pre)?.[0];
    const q = def.q ?? 3;
    const owners = new Set([def.by, ...(def.co ?? [])]);
    const members = COMMITTEE.filter((n) => !owners.has(n));
    const forward = async () => {
      if (!preNo) throw new Error(`no pre-evaluator for ${def.key}`);
      await as(preNo, () => suggestions.preEvaluate(detail.id, { scores: scoresFor(q, 0), decision: 'FORWARD', comment: 'Konu uygun, komiteye iletildi.' }));
    };
    const scoreAll = async () => {
      for (const [i, no] of members.entries()) await as(no, () => suggestions.committeeScore(detail.id, { scores: scoresFor(q, i + 1), comment: i === 0 ? 'Katkısı net.' : undefined }));
    };
    const accept = async () => {
      await forward();
      await scoreAll();
      await as('1001', () => suggestions.decide(detail.id, { decision: 'ACCEPT', note: 'Komite kararıyla kabul edildi.' }));
    };
    const implement = async (finish: boolean) => {
      const impl = def.implementer ?? def.by;
      await as(preNo ?? '1003', () => suggestions.assignImplementer(detail.id, { implementerId: byNo[impl], targetDate: new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10) }));
      const due = new Date(Date.now() + (finish ? -20 : 15) * DAY).toISOString().slice(0, 10);
      const action = await as(preNo ?? '1003', () => suggestions.createAction(detail.id, { title: `${def.title} — uygulama`, ownerId: byNo[impl], dueDate: due, priority: 'MEDIUM' }));
      if (finish) {
        await as(impl, async () => {
          await actions.changeStatus(action.id, 'DONE', 'Uygulama tamamlandı.');
        });
        await as(impl, () => suggestions.markImplemented(detail.id, { note: 'Uygulama tamamlandı, sonuçlar izleniyor.' }));
      }
    };

    switch (def.end) {
      case 'PRE': break;
      case 'REVISE':
        await as(preNo!, () => suggestions.preEvaluate(detail.id, { scores: scoresFor(q, 0), decision: 'REVISE', comment: 'Maliyet ve beklenen fayda sayısal olarak belirtilmeli.' }));
        break;
      case 'COMMITTEE':
        await forward();
        if (def.key === 's14') await scoreAll();
        break;
      case 'HOLD':
        await forward();
        await scoreAll();
        await as('1001', () => suggestions.decide(detail.id, { decision: 'HOLD', note: 'Bütçe dönemi bekleniyor, bir sonraki çeyrekte tekrar değerlendirilecek.' }));
        break;
      case 'ACCEPTED':
        await accept();
        break;
      case 'FAST':
        await as(preNo!, () => suggestions.preEvaluate(detail.id, { scores: scoresFor(5, 0), decision: 'ACCEPT', comment: 'Düşük maliyet, yüksek etki: hızlı onay.' }));
        await implement(false);
        break;
      case 'REJECTED':
        await forward();
        await scoreAll();
        await as('1001', () => suggestions.decide(detail.id, { decision: 'REJECT', reason: 'İş güvenliği gereği üretim alanında dikkat dağıtıcı ses yayını yapılamaz.' }));
        break;
      case 'IN_IMPL':
        await accept();
        await implement(false);
        break;
      case 'IMPLEMENTED':
        await accept();
        await implement(true);
        break;
      case 'CLOSED':
        await accept();
        await implement(true);
        await as(preNo ?? '1003', () => suggestions.close(detail.id));
        break;
      case 'WITHDRAWN':
        await as(def.by, () => suggestions.withdraw(detail.id));
        break;
    }
    if (def.suggestionOfMonth) {
      const d = new Date(Date.now() - 30 * DAY);
      await as('1003', () => suggestions.setSuggestionOfMonth(detail.id, true, d.toISOString().slice(0, 7)));
    }
  }

  /* ---- Geriye dönük tarihleme ---- */
  const now = Date.now();
  const clamp = (t: number) => new Date(Math.min(t, now - 3_600_000));
  for (const { def, id } of created) {
    const row = await prisma.raw.suggestion.findUniqueOrThrow({ where: { id } });
    const submittedAt = new Date(now - def.age * DAY);
    const preAt = row.preEvaluatedAt ? clamp(submittedAt.getTime() + Math.min(2, Math.max(def.age - 1, 0)) * DAY) : null;
    const decidedAt = row.decidedAt ? clamp((preAt ?? submittedAt).getTime() + 5 * DAY) : null;
    const implAt = row.implementedAt && decidedAt ? clamp(decidedAt.getTime() + 25 * DAY) : null;
    const closedAt = row.closedAt && implAt ? clamp(implAt.getTime() + 6 * DAY) : null;
    await prisma.raw.suggestion.update({
      where: { id },
      data: { submittedAt, preEvaluatedAt: preAt, decidedAt, implementedAt: implAt, closedAt, withdrawnAt: row.withdrawnAt ? clamp(submittedAt.getTime() + 2 * DAY) : null, createdAt: submittedAt },
    });
    const at = (t: Date | null, fallback: Date) => t ?? fallback;
    const eventTimes: Record<string, Date> = {
      SUBMITTED: submittedAt, FORWARDED: at(preAt, submittedAt), REVISION_REQUESTED: at(preAt, submittedAt), FAST_TRACK_ACCEPTED: at(decidedAt, submittedAt),
      ACCEPTED: at(decidedAt, submittedAt), REJECTED: at(decidedAt, submittedAt), ON_HOLD: clamp(submittedAt.getTime() + 8 * DAY),
      IMPLEMENTER_ASSIGNED: clamp(at(decidedAt, submittedAt).getTime() + DAY), IMPLEMENTATION_STARTED: clamp(at(decidedAt, submittedAt).getTime() + DAY),
      IMPLEMENTED: at(implAt, submittedAt), CLOSED: at(closedAt, submittedAt), WITHDRAWN: clamp(submittedAt.getTime() + 2 * DAY),
      SUGGESTION_OF_MONTH: at(closedAt, submittedAt),
    };
    for (const [type, t] of Object.entries(eventTimes)) await prisma.raw.suggestionEvent.updateMany({ where: { suggestionId: id, type }, data: { createdAt: t } });
    await prisma.raw.suggestionEvaluation.updateMany({ where: { suggestionId: id, stage: 'PRE' }, data: { createdAt: at(preAt, submittedAt), updatedAt: at(preAt, submittedAt) } });
    const cAt = decidedAt ? clamp(decidedAt.getTime() - DAY) : clamp(submittedAt.getTime() + 6 * DAY);
    await prisma.raw.suggestionEvaluation.updateMany({ where: { suggestionId: id, stage: 'COMMITTEE' }, data: { createdAt: cAt, updatedAt: cAt } });
    const ledger: Record<string, Date> = { SUBMISSION: submittedAt, ACCEPTANCE: at(decidedAt, submittedAt), IMPLEMENTATION: at(implAt, submittedAt) };
    for (const [reason, t] of Object.entries(ledger)) await prisma.raw.pointsLedger.updateMany({ where: { sourceId: id, reason }, data: { createdAt: t } });
  }

  /* ---- Kaizenler ---- */
  const idOf = (key: string) => created.find((c) => c.def.key === key)!.id;
  const photo = async (kaizenId: string, uploader: string, kind: 'KAIZEN_BEFORE' | 'KAIZEN_AFTER', title: string) => {
    const before = kind === 'KAIZEN_BEFORE';
    const key = `${tenantId}/seed/${kaizenId}-${kind}.svg`;
    await storage.put(key, svg(before ? 'ÖNCE' : 'SONRA', before ? '#fee2e2' : '#dcfce7', before ? '#b91c1c' : '#15803d', title));
    await prisma.db.attachment.create({
      data: { tenantId, entityType: kind, entityId: kaizenId, fileName: `${before ? 'once' : 'sonra'}.svg`, mimeType: 'image/svg+xml', size: 900, storageKey: key, uploadedById: byNo[uploader] },
    });
  };
  const ago = (d: number) => new Date(now - d * DAY);
  const backdate = async (id: string, createdDays: number, publishedDays?: number) => {
    await prisma.raw.kaizen.update({ where: { id }, data: { createdAt: ago(createdDays), ...(publishedDays !== undefined ? { approvedAt: ago(publishedDays), publishedAt: ago(publishedDays) } : {}) } });
    if (publishedDays !== undefined) await prisma.raw.pointsLedger.updateMany({ where: { sourceId: id, reason: 'KAIZEN_PUBLISHED' }, data: { createdAt: ago(publishedDays) } });
  };

  // K1: Hızlı kaizen (yayında) — S1 önerisinden; finans onaylı
  const k1 = await as('3001', async () => {
    const k = await kaizens.createFromSuggestion(idOf('s1'), { type: 'QUICK' });
    await kaizens.update(k.id, {
      problem: 'Aparat değişiminde yanlış aparat takılıyor; ayar için ortalama 12 dk kayıp.',
      rootCause: 'Aparat ve yuvaları arasında görsel eşleştirme yok.',
      beforeDescription: 'Aparatlar rafta karışık duruyor, etiket yok.', afterDescription: 'Her aparat ve yuvası aynı renkle kodlandı, yanlış takma imkânsız.',
      standardization: 'Aparat değişim talimatı (TLM-112) renk kodlarıyla güncellendi.', horizontalDeployment: 'Hat 2 ve Hat 3 aparat yuvalarına uygulanacak.',
      startDate: ago(150).toISOString().slice(0, 10), endDate: ago(140).toISOString().slice(0, 10),
    });
    await kaizens.addGain(k.id, { type: 'TANGIBLE', metric: 'TIME_MIN', description: 'Ayar süresi 12 dk → 4 dk', beforeValue: 12, afterValue: 4, annualSaving: 38400 });
    await kaizens.addGain(k.id, { type: 'INTANGIBLE', metric: 'QUALITY', description: 'Aparat kaynaklı hatalar sıfırlandı' });
    await kaizens.submit(k.id);
    return k.id;
  });
  await as('2001', () => kaizens.approve(k1, { publish: true }));
  await as('1003', async () => {
    const d = await kaizens.get(k1);
    for (const g of d.gains.filter((x) => x.type === 'TANGIBLE')) await kaizens.financeApprove(k1, g.id, true);
  });
  await photo(k1, '3001', 'KAIZEN_BEFORE', 'Karışık aparatlar');
  await photo(k1, '3001', 'KAIZEN_AFTER', 'Renk kodlu yuvalar');
  await backdate(k1, 140, 120);

  // K2: Kaizen projesi (yayında) — Hat 2 basınçlı hava
  const k2 = await as('2002', async () => {
    const k = await kaizens.create({
      type: 'PROJECT', title: 'Hat 2 basınçlı hava tüketiminin azaltılması', problem: 'Kompresör yük süresi yüksek, enerji maliyeti artıyor.',
      rootCause: 'Hat sonu kaçaklar ve açık bırakılan üfleme tabancaları.', beforeDescription: 'Hava tüketimi 14 m³/dk, kaçak oranı %28.',
      afterDescription: 'Kaçaklar giderildi, üfleme tabancaları otomatik kapanır hale getirildi; tüketim 9 m³/dk.', orgUnitId: await unitId('URT-H2'),
      memberIds: [byNo['1004'], byNo['3003']], startDate: ago(110).toISOString().slice(0, 10), endDate: ago(60).toISOString().slice(0, 10),
      standardization: 'Haftalık kaçak tarama rutini bakım planına eklendi.', horizontalDeployment: 'Hat 1 ve paketleme alanına yaygınlaştırma planlandı.',
      suggestionId: idOf('s5'),
      gains: [
        { type: 'TANGIBLE', metric: 'ENERGY_KWH', description: 'Yıllık elektrik tasarrufu', beforeValue: 14, afterValue: 9, annualSaving: 152000 },
        { type: 'TANGIBLE', metric: 'COST_TL', description: 'Kompresör bakım maliyeti azalması', annualSaving: 28000 },
        { type: 'INTANGIBLE', metric: 'SAFETY', description: 'Gürültü seviyesinde azalma' },
      ],
    });
    await kaizens.submit(k.id);
    return k.id;
  });
  await as('1002', () => kaizens.approve(k2, { publish: true }));
  await as('1003', async () => {
    const d = await kaizens.get(k2);
    await kaizens.financeApprove(k2, d.gains.find((g) => g.metric === 'ENERGY_KWH')!.id, true);
  });
  await photo(k2, '2002', 'KAIZEN_BEFORE', 'Kaçaklı hava hattı');
  await photo(k2, '2002', 'KAIZEN_AFTER', 'Yenilenen bağlantılar');
  await backdate(k2, 70, 45);

  // K3: Kaizen etkinliği (onay bekliyor)
  const k3 = await as('1004', async () => {
    const k = await kaizens.create({
      type: 'EVENT' as KaizenType, title: 'Bakım atölyesi 5S Kaizen etkinliği (3 gün)', problem: 'Atölyede yedek parça ve aletler düzensiz, arama süresi uzun.',
      rootCause: 'Yerleşim planı ve gölge pano yok.', beforeDescription: 'Aletler çekmecelerde karışık, ortalama arama süresi 9 dk.',
      afterDescription: 'Gölge panolar kuruldu, yedek parça rafları kodlandı; arama süresi 2 dk.', orgUnitId: await unitId('BKM'),
      memberIds: [byNo['2001'], byNo['3002'], byNo['1003']], startDate: ago(16).toISOString().slice(0, 10), endDate: ago(14).toISOString().slice(0, 10),
      standardization: '5S denetim listesine atölye eklendi.',
      gains: [
        { type: 'TANGIBLE', metric: 'TIME_MIN', description: 'Arama süresi 9 dk → 2 dk', beforeValue: 9, afterValue: 2, annualSaving: 21000 },
        { type: 'TANGIBLE', metric: 'AREA_M2', description: 'Boşalan alan', beforeValue: 0, afterValue: 6 },
      ],
    });
    await kaizens.submit(k.id);
    return k.id;
  });
  await photo(k3, '1004', 'KAIZEN_BEFORE', 'Düzensiz atölye');
  await photo(k3, '1004', 'KAIZEN_AFTER', 'Gölge panolar');
  await backdate(k3, 15);

  // K4: Taslak — kabul edilmiş S4 önerisine bağlı
  const k4 = await as('2001', () => kaizens.createFromSuggestion(idOf('s4'), { type: 'QUICK' }));
  await backdate(k4.id, 6);

  // K5: Reddedilmiş hızlı kaizen
  const k5 = await as('3002', async () => {
    const k = await kaizens.create({
      type: 'QUICK', title: 'Hat 1 çalışma masası yüksekliği ayarı', problem: 'Masa yüksekliği ortalama boydan düşük.', beforeDescription: 'Sabit masa.',
      afterDescription: 'Ayarlanabilir ayaklar takıldı.', orgUnitId: await unitId('URT-H1'), gains: [{ type: 'INTANGIBLE', metric: 'SAFETY', description: 'Duruş ergonomisi' }],
    });
    await kaizens.submit(k.id);
    return k.id;
  });
  await as('2001', () => kaizens.reject(k5, { reason: 'Önce/sonra ölçümü ve fotoğraf eksik; tamamlayıp yeniden gönderin.' }));
  await backdate(k5, 25);
}

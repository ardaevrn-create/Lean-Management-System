/**
 * 5S & TPM denetim modülü demo verisi (seed.ts içinden, DEMO şirketi bağlamında çağrılır).
 * Yerleşik şablonlar, alanlar, ekipman, aylık plan (rotasyon + çapraz denetim), son 5 ayın tamamlanmış denetimleri
 * (trend görünsün diye farklı skorlarla), bulgu aksiyonları, geciken bir denetim ve TPM etiketleri.
 */
import type { INestApplicationContext } from '@nestjs/common';
import { auditScaleMax } from '@lean/shared';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { SequenceService } from '../src/core/prisma/sequence.service';
import { RequestContext } from '../src/common/request-context';
import { computeAuditScore } from '../src/modules/audits/audit-rules';
import { AuditMastersService } from '../src/modules/audits/audit-masters.service';
import { AuditPlansService } from '../src/modules/audits/audit-plans.service';
import { AuditTemplatesService } from '../src/modules/audits/audit-templates.service';
import { AuditsService } from '../src/modules/audits/audits.service';

export interface AuditSeedContext {
  /** Sicil no → user id */
  byNo: Record<string, string>;
  /** Birim id'leri */
  units: { hat1: string; hat2: string; kalite: string; bakim: string; ik: string };
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Deterministik sözde rastgele sayı (0..1). */
function rnd(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export async function seedAudits(app: INestApplicationContext, { byNo, units }: AuditSeedContext) {
  const prisma = app.get(PrismaService);
  const templates = app.get(AuditTemplatesService);
  const masters = app.get(AuditMastersService);
  const plans = app.get(AuditPlansService);
  const audits = app.get(AuditsService);
  const sequences = app.get(SequenceService);
  const tenantId = app.get(RequestContext).tenantId;

  // Yerleşik şablonlar
  const prod = await templates.createBuiltin('5S_PRODUCTION', {});
  const office = await templates.createBuiltin('5S_OFFICE', {});
  await templates.createBuiltin('5S_WAREHOUSE', {});
  await templates.createBuiltin('TPM_AM_STEP1_3', {});
  await templates.createBuiltin('EQUIPMENT_DAILY', {});

  // Alanlar ve ekipman
  const area = (code: string, name: string, orgUnitId: string, responsibleNo: string, areaType: 'PRODUCTION' | 'OFFICE') =>
    masters.createArea({ code, name, orgUnitId, responsibleId: byNo[responsibleNo], areaType });
  const a1 = await area('URT-H1', 'Montaj Hattı 1 Üretim Alanı', units.hat1, '2001', 'PRODUCTION');
  const a2 = await area('URT-H2', 'Montaj Hattı 2 Üretim Alanı', units.hat2, '2002', 'PRODUCTION');
  const a3 = await area('KAL-LAB', 'Kalite Laboratuvarı', units.kalite, '1003', 'PRODUCTION');
  const a4 = await area('BKM-ATL', 'Bakım Atölyesi', units.bakim, '1004', 'PRODUCTION');
  const a5 = await area('IK-OFIS', 'İK Ofisi', units.ik, '4001', 'OFFICE');

  const eq = (code: string, name: string, areaId: string, criticality: 'A' | 'B' | 'C') => masters.createEquipment({ code, name, areaId, criticality });
  const pres = await eq('PRS-01', 'Hidrolik Pres 01', a1.id, 'A');
  await eq('CNC-01', 'CNC İşleme Merkezi 01', a1.id, 'A');
  const konveyor = await eq('KNV-02', 'Montaj Konveyörü Hat 2', a2.id, 'B');
  await eq('PKT-02', 'Paketleme Makinesi Hat 2', a2.id, 'B');
  const kompresor = await eq('KMP-01', 'Vidalı Kompresör 01', a4.id, 'A');

  // Aylık 5S planları: rotasyon (1003, 1004, 2001, 2002) + çapraz denetim
  const now = new Date();
  const firstOfMonth = (back: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  const start = iso(firstOfMonth(5));
  const rotation = [byNo['1003'], byNo['1004'], byNo['2001'], byNo['2002']];
  const prodPlan = await plans.create({
    name: 'Aylık 5S Denetimi — Üretim ve Teknik Alanlar', templateId: prod.id, frequency: 'MONTHLY',
    areaIds: [a1.id, a2.id, a3.id, a4.id], assignMode: 'ROTATION', auditorIds: rotation, crossAudit: true, startDate: start,
  });
  const officePlan = await plans.create({
    name: 'Aylık 5S Denetimi — Ofis', templateId: office.id, frequency: 'MONTHLY',
    areaIds: [a5.id], assignMode: 'ROTATION', auditorIds: rotation, crossAudit: true, startDate: start,
  });
  await plans.generate(prodPlan.id);
  await plans.generate(officePlan.id);

  // Geçmiş aylar: bir alan hariç tamamlanır (Bakım Atölyesi geçen ay → geciken denetim)
  const target: Record<string, number[]> = {
    [a1.id]: [58, 63, 69, 72, 78],
    [a2.id]: [66, 61, 59, 67, 71],
    [a3.id]: [81, 84, 83, 88, 90],
    [a4.id]: [47, 52, 58, 55, 64],
    [a5.id]: [72, 70, 76, 79, 83],
  };
  const sectionBias = [0, -6, 4, -10, -4]; // 5S bölümleri farklı seviyede (radar grafiği için)
  const pastAudits = await prisma.db.audit.findMany({
    where: { planId: { in: [prodPlan.id, officePlan.id] }, dueDate: { lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } },
    orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
  });
  const completedByArea = new Map<string, string[]>();
  let seq = 0;
  for (const a of pastAudits) {
    const monthsBack = (now.getUTCFullYear() - a.dueDate.getUTCFullYear()) * 12 + now.getUTCMonth() - a.dueDate.getUTCMonth(); // 1..5
    if (a.areaId === a4.id && monthsBack === 1) continue; // geciken denetim
    const base = target[a.areaId][5 - monthsBack];
    const started = await audits.start(a.id);
    const max = auditScaleMax(started.scaleType);
    const answered = started.answers.map((ans, i) => {
      const sIdx = Math.max(0, started.sectionScores.findIndex((s) => s.title === ans.sectionTitle));
      const pct = Math.min(100, Math.max(5, base + (sectionBias[sIdx] ?? 0) + (rnd(++seq) - 0.5) * 30));
      return { ...ans, score: Math.min(max, Math.max(0, Math.round((pct / 100) * max))), idx: i };
    });
    const result = computeAuditScore(answered, started.scaleType);
    const doneAt = new Date(a.dueDate.getTime() - Math.floor(rnd(++seq) * 6) * DAY + 10 * 3600_000);
    const lowest = [...answered].sort((x, y) => x.score - y.score).slice(0, 2).filter((x) => x.score < max);
    for (const ans of answered) {
      const isFinding = lowest.some((l) => l.id === ans.id);
      await prisma.db.auditAnswer.update({
        where: { id: ans.id },
        data: { score: ans.score, isFinding, comment: isFinding ? 'Standarda uygun değil, iyileştirme gerekli.' : null },
      });
    }
    await prisma.db.audit.update({
      where: { id: a.id },
      data: {
        status: 'COMPLETED', startedAt: new Date(doneAt.getTime() - 2 * 3600_000), completedAt: doneAt, scorePct: result.scorePct,
        sectionScores: JSON.parse(JSON.stringify(result.sections)),
      },
    });
    completedByArea.set(a.areaId, [...(completedByArea.get(a.areaId) ?? []), a.id]);
  }

  // Son tamamlanan denetimlerin bulgularından aksiyonlar
  for (const areaId of [a1.id, a4.id, a2.id]) {
    const last = completedByArea.get(areaId)?.at(-1);
    if (!last) continue;
    const detail = await audits.get(last);
    const findings = detail.answers.filter((x) => x.isFinding);
    for (const [i, f] of findings.entries()) {
      await audits.createFindingAction(last, f.id, {
        dueDate: iso(new Date(now.getTime() + (i === 0 ? -3 : 12) * DAY)), priority: i === 0 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  // Bu ay: bir denetim devam ediyor (saha ekranı denemesi için)
  const current = await prisma.db.audit.findFirst({ where: { planId: prodPlan.id, areaId: a1.id, status: 'PLANNED' }, orderBy: { dueDate: 'desc' } });
  if (current) await audits.start(current.id);

  // TPM etiketleri
  const tag = async (d: {
    areaId: string; equipmentId?: string; color: 'RED' | 'BLUE'; category: 'LEAK' | 'LOOSENESS' | 'CONTAMINATION' | 'DAMAGE' | 'SAFETY' | 'MISSING_PART' | 'OTHER';
    description: string; openedNo: string; assignedNo: string; createdAgo: number; dueIn: number; closedAfter?: number; closeNote?: string; inProgress?: boolean;
  }) => {
    const created = new Date(now.getTime() - d.createdAgo * DAY);
    await prisma.db.abnormalityTag.create({
      data: {
        tenantId, number: await sequences.next('tag'), areaId: d.areaId, equipmentId: d.equipmentId ?? null, color: d.color, category: d.category,
        description: d.description, openedById: byNo[d.openedNo], assignedToId: byNo[d.assignedNo],
        dueDate: new Date(iso(new Date(now.getTime() + d.dueIn * DAY))), createdAt: created,
        status: d.closedAfter !== undefined ? 'CLOSED' : d.inProgress ? 'IN_PROGRESS' : 'OPEN',
        closedAt: d.closedAfter !== undefined ? new Date(created.getTime() + d.closedAfter * DAY) : null,
        closedById: d.closedAfter !== undefined ? byNo[d.assignedNo] : null, closeNote: d.closeNote ?? null,
      },
    });
  };
  await tag({ areaId: a1.id, equipmentId: pres.id, color: 'RED', category: 'LEAK', description: 'Pres hidrolik bağlantısında yağ sızıntısı var, zemine damlıyor.', openedNo: '3001', assignedNo: '1004', createdAgo: 9, dueIn: -4 });
  await tag({ areaId: a1.id, color: 'BLUE', category: 'LOOSENESS', description: 'Hat girişi koruyucu sacının cıvataları gevşemiş.', openedNo: '3002', assignedNo: '2001', createdAgo: 2, dueIn: 5 });
  await tag({ areaId: a2.id, equipmentId: konveyor.id, color: 'RED', category: 'DAMAGE', description: 'Konveyör kayışında yırtılma başlangıcı görülüyor.', openedNo: '3003', assignedNo: '1004', createdAgo: 5, dueIn: -1, inProgress: true });
  await tag({ areaId: a4.id, equipmentId: kompresor.id, color: 'RED', category: 'SAFETY', description: 'Kompresör kayış kapağı eksik, dönen parça açıkta.', openedNo: '2002', assignedNo: '1004', createdAgo: 1, dueIn: 2 });
  await tag({ areaId: a2.id, color: 'BLUE', category: 'CONTAMINATION', description: 'Makine tablasında talaş birikimi, temizlik standardı uygulanmamış.', openedNo: '3003', assignedNo: '2002', createdAgo: 12, dueIn: -6, closedAfter: 3, closeNote: 'Temizlendi, talaş toplama tavası eklendi.' });
  await tag({ areaId: a1.id, color: 'RED', category: 'MISSING_PART', description: 'Emniyet sensörü bağlantı kelepçesi eksik.', openedNo: '3001', assignedNo: '1004', createdAgo: 20, dueIn: -15, closedAfter: 2, closeNote: 'Yeni kelepçe takıldı, sensör testi yapıldı.' });
  await tag({ areaId: a4.id, color: 'BLUE', category: 'OTHER', description: 'Yağlama noktası etiketi okunmuyor.', openedNo: '1004', assignedNo: '1004', createdAgo: 8, dueIn: -2, closedAfter: 1, closeNote: 'Etiket yenilendi.' });
  await tag({ areaId: a3.id, color: 'RED', category: 'LEAK', description: 'Hava hattı bağlantısından kaçak sesi geliyor.', openedNo: '1003', assignedNo: '1004', createdAgo: 4, dueIn: 3 });
}

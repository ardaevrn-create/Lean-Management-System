/**
 * Toplantı modülü demo verisi (seed.ts içinden, DEMO şirketi bağlamında çağrılır).
 * Gerçek servisleri kullanır: tipler şablondan, seriler tekrarlama kuralıyla, geçmiş toplantılar katılım/karar/aksiyonla tamamlanır.
 */
import type { INestApplicationContext } from '@nestjs/common';
import type { MeetingAttendance } from '@lean/shared';
import { ActionsService } from '../src/core/actions/actions.service';
import { MeetingTypesService } from '../src/modules/meetings/meeting-types.service';
import { MeetingsService } from '../src/modules/meetings/meetings.service';

export interface MeetingSeedContext {
  /** Sicil no → user id */
  byNo: Record<string, string>;
  /** Birim id'leri */
  units: { fabrika: string; uretim: string; hat1: string; kalite: string };
}

const DAY = 86_400_000;
const dateStr = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

export async function seedMeetings(app: INestApplicationContext, { byNo, units }: MeetingSeedContext) {
  const types = app.get(MeetingTypesService);
  const meetings = app.get(MeetingsService);
  const actions = app.get(ActionsService);

  const tier1 = await types.createFromTemplate('TIER1_DAILY', {
    name: 'Montaj Hattı 1 — Günlük Tier 1', code: 'T1-HAT1', orgUnitId: units.hat1, facilitatorId: byNo['2001'],
    defaultLocation: 'Hat 1 Tier panosu', participantIds: [byNo['3001'], byNo['3002']],
  });
  const weekly = await types.createFromTemplate('WEEKLY_DEPARTMENT', {
    name: 'Haftalık Üretim Toplantısı', code: 'URT-HAFTALIK', orgUnitId: units.uretim, facilitatorId: byNo['1002'],
    defaultLocation: 'Toplantı Salonu A', participantIds: [byNo['2001'], byNo['2002'], byNo['1003'], byNo['1004']],
  });
  const ygg = await types.createFromTemplate('MANAGEMENT_REVIEW', {
    name: 'Yönetimin Gözden Geçirmesi (YGG)', code: 'YGG', orgUnitId: units.fabrika, facilitatorId: byNo['1003'],
    defaultLocation: 'Yönetim Kurulu Odası', participantIds: [byNo['1001'], byNo['1002'], byNo['1004'], byNo['2001'], byNo['4001']],
  });
  await types.createFromTemplate('MONTHLY_PERFORMANCE', { name: 'Aylık Performans Toplantısı', code: 'AYLIK-PERF', orgUnitId: units.fabrika });

  /** Geçmiş toplantıyı gündem notu, karar, aksiyon ve katılım kaydıyla tamamlar. */
  async function runPast(
    id: string,
    index: number,
    opts: { decisions?: string[]; actions?: { title: string; ownerNo: string; due: number; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; close?: 'DONE' | 'VERIFIED'; progress?: number }[] } = {},
  ) {
    const detail = await meetings.get(id);
    await meetings.start(id);
    for (const [i, item] of detail.agenda.slice(0, 3).entries()) {
      await meetings.updateAgendaItem(id, item.id, { discussion: `${item.title}: durum gözden geçirildi, ${i === 0 ? 'ek önlem gerekmiyor' : 'takip edilecek'}.`, isCompleted: true });
    }
    for (const text of opts.decisions ?? []) await meetings.addDecision(id, { text, agendaItemId: detail.agenda[1]?.id });
    for (const a of opts.actions ?? []) {
      const created = await meetings.createAction(id, {
        title: a.title, ownerId: byNo[a.ownerNo], dueDate: dateStr(a.due), priority: a.priority ?? 'MEDIUM',
      });
      if (a.progress) await actions.update(created.id, { progress: a.progress });
      if (a.close) {
        await actions.changeStatus(created.id, 'DONE', 'Çalışma tamamlandı');
        if (a.close === 'VERIFIED') await actions.changeStatus(created.id, 'VERIFIED');
      }
    }
    const attendance = detail.participants.map<{ userId: string; attendance: MeetingAttendance }>((p, i) => ({
      userId: p.userId,
      attendance: (i + index) % 7 === 3 ? 'ABSENT' : (i + index) % 5 === 4 ? 'EXCUSED' : (i + index) % 6 === 2 ? 'LATE' : 'PRESENT',
    }));
    await meetings.setAttendance(id, { items: attendance });
    await meetings.update(id, { summary: 'Gündem maddeleri görüşüldü, kararlar ve aksiyonlar kaydedildi.' });
    await meetings.complete(id);
  }

  // Haftalık üretim toplantısı: son 3 hafta + gelecek 3 hafta
  const weeklySeries = await meetings.createSeries({
    typeId: weekly.id, firstDate: dateStr(-21), untilDate: dateStr(21), time: '10:00', frequency: 'WEEKLY', organizerId: byNo['1002'],
  });
  // Bugünkü toplantı canlı gösterim için planlı bırakılır
  const isPast = (startAt: string) => new Date(startAt).getTime() < Date.now() - 12 * 3_600_000;
  const past = weeklySeries.meetings.filter((m) => isPast(m.startAt));
  const plans: Parameters<typeof runPast>[2][] = [
    {
      decisions: ['Hat 1 emniyet sensörleri her vardiya başında kontrol edilecek', 'Duruş kodları tüm hatlarda standartlaştırılacak'],
      actions: [
        { title: 'Hat 1 emniyet bariyeri sensör kalibrasyonunun tamamlanması', ownerNo: '2001', due: -10, priority: 'HIGH' },
        { title: 'Duruş kodlarının standartlaştırılması', ownerNo: '2002', due: -15, close: 'VERIFIED' },
      ],
    },
    {
      decisions: ['Operatör çok yönlülük matrisi aylık güncellenecek'],
      actions: [{ title: 'Operatör çok yönlülük matrisinin güncellenmesi', ownerNo: '2001', due: 5, progress: 40 }],
    },
    {
      decisions: ['Hurda oranı artışı için kök neden analizi başlatılacak'],
      actions: [
        { title: 'Hurda oranı artışı kök neden analizi', ownerNo: '1003', due: 9, priority: 'HIGH' },
        { title: 'Hat 2 kalıp değişim süresinin ölçülmesi (SMED ön çalışma)', ownerNo: '2002', due: -2 },
      ],
    },
  ];
  for (const [i, m] of past.entries()) await runPast(m.id, i, plans[i] ?? {});

  // Montaj Hattı 1 günlük Tier 1: son 10 gün (hafta içi) + yakın gelecek
  const tier1Series = await meetings.createSeries({
    typeId: tier1.id, firstDate: dateStr(-10), untilDate: dateStr(3), time: '08:00', frequency: 'DAILY', skipWeekends: true, organizerId: byNo['2001'],
  });
  for (const [i, m] of tier1Series.meetings.filter((x) => isPast(x.startAt)).entries()) {
    await runPast(m.id, i + 10, i === 1 ? { actions: [{ title: 'Hat 1 yedek tork anahtarı temini', ownerNo: '3001', due: -3, priority: 'MEDIUM' }] } : {});
  }

  // YGG: geçen çeyrekte yapılan + önümüzdeki ay planlı
  const past1 = await meetings.create({ typeId: ygg.id, startAt: `${dateStr(-75)}T07:00:00.000Z`, organizerId: byNo['1003'] });
  await runPast(past1.id, 3, {
    decisions: ['Kalite hedefleri 2027 için yeniden belirlenecek', 'Tedarikçi değerlendirme periyodu 6 aya düşürülecek'],
    actions: [{ title: 'Tedarikçi değerlendirme prosedürünün revize edilmesi', ownerNo: '1003', due: 20, priority: 'HIGH' }],
  });
  await meetings.create({ typeId: ygg.id, startAt: `${dateStr(25)}T07:00:00.000Z`, organizerId: byNo['1003'] });
}

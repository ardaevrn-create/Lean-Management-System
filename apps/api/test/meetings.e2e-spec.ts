import { INestApplication } from '@nestjs/common';
import { RequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { MeetingsReminderJob } from '../src/modules/meetings/meetings-reminder.job';
import { client, createTestApp, login } from './helpers';

type Api = ReturnType<typeof client>;
interface Person { employeeId: string; userId: string; username: string; password: string; api: Api }

describe('Meetings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Api;
  let otherAdmin: Api;
  let chief: Person;
  let w1: Person;
  let w2: Person;
  let outsider: Person;
  let lineId: string;
  let tier1TypeId: string;
  let m1: string; // geçmiş toplantı (tamamlanacak)
  let m2: string; // sonraki toplantı (aynı tip)
  let actionId: string;

  async function makePerson(employeeNo: string, firstName: string, managerId?: string): Promise<Person> {
    const e = (await admin.post('/employees', { employeeNo, firstName, lastName: 'Test', orgUnitId: lineId, managerId, createUser: true }).expect(201)).body;
    const p = { employeeId: e.id, userId: e.credential.userId, username: e.credential.username, password: 'Yeni12345' };
    const tmp = client(app, await login(app, 'MEET', p.username, e.credential.temporaryPassword));
    await tmp.post('/auth/change-password', { currentPassword: e.credential.temporaryPassword, newPassword: p.password }).expect(204);
    return { ...p, api: client(app, await login(app, 'MEET', p.username, p.password)) };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const prov = app.get(TenantProvisioningService);
    await prov.provision({ code: 'MEET', name: 'Meet Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Meet Admin' });
    await prov.provision({ code: 'MOTHER', name: 'Other Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Other Admin' });
    admin = client(app, await login(app, 'MEET', 'admin', 'Admin123!'));
    otherAdmin = client(app, await login(app, 'MOTHER', 'admin', 'Admin123!'));

    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    lineId = (await admin.post('/org-units', { name: 'Hat 1', code: 'H1', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    chief = await makePerson('S1', 'Sef');
    w1 = await makePerson('O1', 'Operator1', chief.employeeId);
    w2 = await makePerson('O2', 'Operator2', chief.employeeId);
    outsider = await makePerson('X1', 'Disarida');
  });

  afterAll(() => app.close());

  it('lists built-in templates and creates meeting types from them', async () => {
    const templates = (await admin.get('/meetings/types/templates').expect(200)).body;
    expect(templates.map((t: { key: string }) => t.key)).toEqual(['TIER1_DAILY', 'WEEKLY_DEPARTMENT', 'MONTHLY_PERFORMANCE', 'MANAGEMENT_REVIEW']);
    const tier1 = templates.find((t: { key: string }) => t.key === 'TIER1_DAILY');
    expect(tier1.agenda.map((a: { title: string }) => a.title[0])).toEqual(['G', 'K', 'T', 'M', 'İ']);

    // Yetkisiz kullanıcı tip oluşturamaz
    await chief.api.post('/meetings/types/templates/TIER1_DAILY', {}).expect(403);

    const type = (await admin.post('/meetings/types/templates/TIER1_DAILY', { orgUnitId: lineId, facilitatorId: chief.userId, participantIds: [w1.userId, w2.userId] }).expect(201)).body;
    tier1TypeId = type.id;
    expect(type.code).toBe('TIER1_DAILY');
    expect(type.agendaTemplate).toHaveLength(5);
    expect(type.defaultDurationMin).toBe(15);
    expect(type.members).toHaveLength(2);

    const ygg = (await admin.post('/meetings/types/templates/MANAGEMENT_REVIEW', {}).expect(201)).body;
    expect(ygg.category).toBe('MANAGEMENT_REVIEW');
    expect(ygg.agendaTemplate.length).toBeGreaterThanOrEqual(12);
    // Aynı şablon tekrar: kod çakışması otomatik çözülür
    const again = (await admin.post('/meetings/types/templates/MANAGEMENT_REVIEW', {}).expect(201)).body;
    expect(again.code).toBe('MANAGEMENT_REVIEW-2');

    // Tip pasife alma (silme) ve yeniden etkinleştirme
    await admin.del(`/meetings/types/${again.id}`).expect(200);
    const active = (await admin.get('/meetings/types').expect(200)).body;
    expect(active.map((t: { id: string }) => t.id)).not.toContain(again.id);
    expect((await admin.get('/meetings/types?includeInactive=true').expect(200)).body.map((t: { id: string }) => t.id)).toContain(again.id);
    await admin.patch(`/meetings/types/${again.id}`, { isActive: true }).expect(200);
  });

  it('creates a meeting from a type: copies agenda/participants and notifies invitees', async () => {
    const created = (await admin.post('/meetings', { typeId: tier1TypeId, startAt: '2026-09-01T05:00:00.000Z', organizerId: chief.userId }).expect(201)).body;
    m1 = created.id;
    expect(created.code).toMatch(/^TOP-\d{5}$/);
    expect(created.title).toContain('Tier 1');
    expect(created.agenda).toHaveLength(5);
    expect(created.endAt).toBe('2026-09-01T05:15:00.000Z');
    const roles = Object.fromEntries(created.participants.map((p: { userId: string; role: string }) => [p.userId, p.role]));
    expect(roles[chief.userId]).toBe('ORGANIZER');
    expect(roles[w1.userId]).toBe('PARTICIPANT');
    expect(created.orgUnit.id).toBe(lineId);

    expect((await w1.api.get('/notifications/unread-count').expect(200)).body.count).toBe(1);
    const notif = (await w1.api.get('/notifications').expect(200)).body.items[0];
    expect(notif.type).toBe('MEETING_INVITED');
    expect(notif.link).toBe(`/meetings/${m1}`);

    const second = (await admin.post('/meetings', { typeId: tier1TypeId, startAt: '2026-09-08T05:00:00.000Z', organizerId: chief.userId }).expect(201)).body;
    m2 = second.id;
    expect(second.number).toBe(created.number + 1);
    await admin.post('/meetings', { startAt: '2026-09-08T05:00:00.000Z' }).expect(422);
  });

  it('hides meetings from users who are neither participants nor in view scope', async () => {
    await outsider.api.get(`/meetings/${m1}`).expect(403);
    expect((await outsider.api.get('/meetings?view=mine').expect(200)).body.total).toBe(0);
    expect((await outsider.api.get('/meetings?view=all').expect(200)).body.total).toBe(0);
    await outsider.api.get(`/meetings/${m1}/carried-actions`).expect(403);
    await outsider.api.post('/meetings', { title: 'x', startAt: '2026-10-01T05:00:00.000Z' }).expect(403);

    // Katılımcı ve organizatör görür; kolaylaştırıcı/organizatör yürütebilir, katılımcı yürütemez
    const asChief = (await chief.api.get(`/meetings/${m1}`).expect(200)).body;
    expect(asChief.can).toEqual({ edit: true, run: true, manage: false });
    const asW1 = (await w1.api.get(`/meetings/${m1}`).expect(200)).body;
    expect(asW1.can).toEqual({ edit: false, run: false, manage: false });
    expect((await w1.api.get('/meetings?view=mine').expect(200)).body.total).toBe(2);
    await w1.api.patch(`/meetings/${m1}`, { summary: 'hack' }).expect(403);
    await w1.api.post(`/meetings/${m1}/decisions`, { text: 'x' }).expect(403);
    expect((await admin.get(`/meetings/${m1}`).expect(200)).body.can.manage).toBe(true);
  });

  it('applies org-unit scope to meeting.view / meeting.manage', async () => {
    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    const hat2 = (await admin.post('/org-units', { name: 'Hat 2', code: 'H2', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    const rolesRes = (await admin.get('/roles').expect(200)).body;
    const roles: { id: string; code: string }[] = Array.isArray(rolesRes) ? rolesRes : rolesRes.items;
    const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
    const scoped = async (unitId: string, no: string) => {
      const p = await makePerson(no, `Mudur${no}`);
      await admin.put(`/users/${p.userId}/roles`, { assignments: [{ roleId: roleId('EMPLOYEE') }, { roleId: roleId('MANAGER'), orgUnitId: unitId }] }).expect(200);
      return client(app, await login(app, 'MEET', p.username, p.password));
    };
    const mgrHat2 = await scoped(hat2, 'M2');
    const mgrHat1 = await scoped(lineId, 'M1');

    // Hat 2 yöneticisi Hat 1 toplantısını göremez; Hat 1 yöneticisi görür
    await mgrHat2.get(`/meetings/${m1}`).expect(403);
    expect((await mgrHat2.get('/meetings?view=all').expect(200)).body.total).toBe(0);
    expect((await mgrHat1.get(`/meetings/${m1}`).expect(200)).body.can.manage).toBe(true);
    expect((await mgrHat1.get('/meetings?view=all').expect(200)).body.total).toBeGreaterThanOrEqual(2);

    // Kapsam dışı birimde toplantı / tip açılamaz; kapsam içinde açılabilir
    await mgrHat2.post('/meetings', { title: 'Yetkisiz', startAt: '2030-01-01T05:00:00.000Z', orgUnitId: lineId }).expect(403);
    await mgrHat2.post('/meetings/types', { name: 'Hat 2 Günlük', code: 'H2D', orgUnitId: lineId }).expect(403);
    const mine = (await mgrHat2.post('/meetings', { title: 'Hat 2 toplantısı', startAt: '2030-01-01T05:00:00.000Z', orgUnitId: hat2 }).expect(201)).body;
    expect(mine.can.manage).toBe(true);
    await mgrHat1.get(`/meetings/${mine.id}`).expect(403);
    await mgrHat2.post(`/meetings/${m1}/start`).expect(403);
  });

  it('records agenda, decisions and discussion notes', async () => {
    const detail = (await chief.api.get(`/meetings/${m1}`).expect(200)).body;
    const first = detail.agenda[0];
    const agenda = (await chief.api.put(`/meetings/${m1}/agenda`, {
      items: [...detail.agenda.map((a: { id: string; title: string }) => ({ id: a.id, title: a.title })), { title: 'Çeşitli konular', durationMin: 2 }],
    }).expect(200)).body;
    expect(agenda).toHaveLength(6);
    expect(agenda[5].title).toBe('Çeşitli konular');

    const upd = (await chief.api.patch(`/meetings/${m1}/agenda/${first.id}`, { discussion: 'Kaza yok', isCompleted: true }).expect(200)).body;
    expect(upd.discussion).toBe('Kaza yok');
    expect(upd.isCompleted).toBe(true);

    const d = (await chief.api.post(`/meetings/${m1}/decisions`, { text: 'Hat 1 sensörleri haftalık kontrol edilecek', agendaItemId: first.id }).expect(201)).body;
    await chief.api.post(`/meetings/${m1}/decisions`, { text: 'İkinci karar' }).expect(201);
    await chief.api.patch(`/meetings/${m1}/decisions/${d.id}`, { text: 'Hat 1 sensörleri günlük kontrol edilecek' }).expect(200);
    await chief.api.post(`/meetings/${m1}/decisions`, { text: 'geçersiz', agendaItemId: 'nope' }).expect(422);
    const extra = (await chief.api.post(`/meetings/${m1}/decisions`, { text: 'Silinecek' }).expect(201)).body;
    await chief.api.del(`/meetings/${m1}/decisions/${extra.id}`).expect(204);

    await chief.api.patch(`/meetings/${m1}`, { summary: 'Genel notlar', location: 'Hat 1 panosu' }).expect(200);
    const after = (await chief.api.get(`/meetings/${m1}`).expect(200)).body;
    expect(after.decisions.map((x: { text: string }) => x.text)).toEqual(['Hat 1 sensörleri günlük kontrol edilecek', 'İkinci karar']);
    expect(after.summary).toBe('Genel notlar');
  });

  it('creates actions from the meeting with MEETING source', async () => {
    await w1.api.post(`/meetings/${m1}/actions`, { title: 'x', ownerId: w1.userId, dueDate: '2020-01-10' }).expect(403);
    const a = (await chief.api.post(`/meetings/${m1}/actions`, {
      title: 'Sensör kalibrasyonu', ownerId: w1.userId, dueDate: '2020-01-10', priority: 'HIGH',
    }).expect(201)).body;
    actionId = a.id;
    expect(a.sourceType).toBe('MEETING');
    expect(a.sourceId).toBe(m1);
    expect(a.sourceLabel).toMatch(/^TOP-\d{5} .+ \(01\.09\.2026\)$/);
    expect(a.orgUnit.id).toBe(lineId);

    const mine = (await w1.api.get('/actions?view=mine&sourceType=MEETING').expect(200)).body;
    expect(mine.items.map((x: { id: string }) => x.id)).toContain(actionId);
    const listed = (await chief.api.get(`/meetings/${m1}/actions`).expect(200)).body;
    expect(listed).toHaveLength(1);
    expect((await chief.api.get(`/meetings/${m1}`).expect(200)).body.actionCount).toBe(1);
  });

  it('requires attendance before completion, then locks the minutes', async () => {
    const early = await chief.api.post(`/meetings/${m1}/complete`).expect(422);
    expect(early.body.code).toBe('ATTENDANCE_REQUIRED');

    await chief.api.post(`/meetings/${m1}/start`).expect(200);
    await chief.api.post(`/meetings/${m1}/start`).expect(422);
    await chief.api.patch(`/meetings/${m1}/attendance`, { items: [{ userId: outsider.userId, attendance: 'PRESENT' }] }).expect(422);
    await chief.api.patch(`/meetings/${m1}/attendance`, {
      items: [{ userId: chief.userId, attendance: 'PRESENT' }, { userId: w1.userId, attendance: 'PRESENT' }],
    }).expect(200);
    expect((await chief.api.post(`/meetings/${m1}/complete`).expect(422)).body.code).toBe('ATTENDANCE_REQUIRED');

    await chief.api.patch(`/meetings/${m1}/attendance`, { items: [{ userId: w2.userId, attendance: 'ABSENT' }] }).expect(200);
    const done = (await chief.api.post(`/meetings/${m1}/complete`).expect(200)).body;
    expect(done.status).toBe('COMPLETED');
    expect(done.locked).toBe(true);
    expect(done.attendanceRate).toBe(66.7);
    expect(done.can).toEqual({ edit: false, run: false, manage: false });

    // Tutanak dağıtımı: katılımcılar bilgilendirilir
    const minutes = (await w2.api.get('/notifications').expect(200)).body.items.find((n: { title: string }) => n.title.startsWith('Toplantı tutanağı hazır'));
    expect(minutes.link).toBe(`/meetings/${m1}/print`);

    // Kilitli
    for (const res of [
      await chief.api.patch(`/meetings/${m1}`, { summary: 'değişiklik' }),
      await chief.api.post(`/meetings/${m1}/decisions`, { text: 'geç karar' }),
      await chief.api.put(`/meetings/${m1}/agenda`, { items: [] }),
      await chief.api.patch(`/meetings/${m1}/attendance`, { items: [{ userId: w2.userId, attendance: 'PRESENT' }] }),
      await chief.api.post(`/meetings/${m1}/actions`, { title: 'geç', ownerId: w1.userId, dueDate: '2030-01-01' }),
    ]) {
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('MEETING_LOCKED');
    }

    // Yeniden açma yalnız meeting.manage ile
    await chief.api.post(`/meetings/${m1}/reopen`).expect(403);
    const reopened = (await admin.post(`/meetings/${m1}/reopen`).expect(200)).body;
    expect(reopened.status).toBe('IN_PROGRESS');
    const audit = (await admin.get(`/audit-logs?entity=meeting&entityId=${m1}`).expect(200)).body.items;
    expect(audit.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['completed', 'reopened']));
    await chief.api.patch(`/meetings/${m1}`, { summary: 'Düzeltilmiş notlar' }).expect(200);
    await chief.api.post(`/meetings/${m1}/complete`).expect(200);
  });

  it('lists open actions from earlier meetings of the same type as carried-over', async () => {
    expect((await chief.api.get(`/meetings/${m1}/carried-actions`).expect(200)).body).toEqual([]);
    const carried = (await chief.api.get(`/meetings/${m2}/carried-actions`).expect(200)).body;
    expect(carried).toHaveLength(1);
    expect(carried[0].id).toBe(actionId);
    expect(carried[0].meeting.id).toBe(m1);
    expect(carried[0].isOverdue).toBe(true);
    expect(carried[0].closedSinceLast).toBe(false);

    // Tipi olmayan toplantıda devreden yoktur
    const adhoc = (await admin.post('/meetings', { title: 'Plansız', startAt: '2026-09-15T05:00:00.000Z' }).expect(201)).body;
    expect((await admin.get(`/meetings/${adhoc.id}/carried-actions`).expect(200)).body).toEqual([]);

    // Kapanan aksiyon, önceki toplantıdan bu yana kapanmış olarak gösterilir
    await w1.api.post(`/actions/${actionId}/status`, { status: 'DONE', note: 'Yapıldı' }).expect(201);
    expect((await chief.api.get(`/meetings/${m2}/carried-actions`).expect(200)).body[0].status).toBe('DONE');
    await chief.api.post(`/actions/${actionId}/status`, { status: 'VERIFIED' }).expect(201);
    const closed = (await chief.api.get(`/meetings/${m2}/carried-actions`).expect(200)).body;
    expect(closed[0].status).toBe('VERIFIED');
    expect(closed[0].closedSinceLast).toBe(true);
  });

  it('creates and cancels recurring series', async () => {
    const res = (await admin.post('/meetings/series', {
      typeId: tier1TypeId, firstDate: '2030-03-04', untilDate: '2030-03-31', time: '09:00', frequency: 'WEEKLY', weekdays: [1, 3], organizerId: chief.userId,
    }).expect(201)).body;
    expect(res.count).toBe(8);
    expect(res.meetings).toHaveLength(8);
    expect(new Set(res.meetings.map((m: { seriesId: string }) => m.seriesId)).size).toBe(1);
    expect(res.meetings[0].startAt).toBe('2030-03-04T06:00:00.000Z'); // 09:00 Europe/Istanbul

    const tooMany = await admin.post('/meetings/series', { typeId: tier1TypeId, firstDate: '2030-01-01', untilDate: '2032-12-31', time: '09:00', frequency: 'DAILY' }).expect(422);
    expect(tooMany.body.code).toBe('SERIES_TOO_LARGE');
    const monthly = (await admin.post('/meetings/series', { title: 'Aylık', firstDate: '2030-01-31', untilDate: '2030-04-30', time: '10:00', frequency: 'MONTHLY' }).expect(201)).body;
    expect(monthly.meetings.map((m: { startAt: string }) => m.startAt.slice(0, 10))).toEqual(['2030-01-31', '2030-02-28', '2030-03-31', '2030-04-30']);

    // Toplam davet: tek bir seri bildirimi
    const invites = await prisma.raw.notification.count({ where: { userId: w1.userId, dedupeKey: `series-invite:${res.seriesId}` } });
    expect(invites).toBe(1);

    await w1.api.patch(`/meetings/series/${res.seriesId}`, { action: 'CANCEL' }).expect(403);
    const cancelled = (await chief.api.patch(`/meetings/series/${res.seriesId}`, { action: 'CANCEL', reason: 'Plan değişti' }).expect(200)).body;
    expect(cancelled.cancelled).toBe(8);
    const after = (await admin.get(`/meetings/series/${res.seriesId}`).expect(200)).body;
    expect(after.every((m: { status: string }) => m.status === 'CANCELLED')).toBe(true);
  });

  it('computes meeting statistics', async () => {
    const stats = (await admin.get(`/meetings/stats?typeId=${tier1TypeId}&from=2026-08-01T00:00:00Z&to=2026-12-31T00:00:00Z`).expect(200)).body;
    expect(stats.held).toBe(1);
    expect(stats.planned).toBe(1); // m2
    expect(stats.cancelled).toBe(0);
    expect(stats.attendanceRate).toBe(66.7);
    expect(stats.actionsOpened).toBe(1);
    expect(stats.actionsClosed).toBe(1);
    expect(stats.byType).toHaveLength(1);
    expect(stats.byType[0].typeId).toBe(tier1TypeId);
    expect(stats.byType[0].attendanceRate).toBe(66.7);

    const all = (await admin.get('/meetings/stats').expect(200)).body;
    expect(all.cancelled).toBe(8);
    expect(all.total).toBeGreaterThan(stats.total);
  });

  it('cancels a meeting with reason and serves calendar, ics and excel export', async () => {
    const adhoc = (await admin.get('/meetings?view=all&q=Plansız').expect(200)).body.items[0];
    await chief.api.post(`/meetings/${adhoc.id}/cancel`, { reason: 'x' }).expect(403);
    await admin.post(`/meetings/${adhoc.id}/cancel`, {}).expect(400);
    const c = (await admin.post(`/meetings/${adhoc.id}/cancel`, { reason: 'Gündem yok' }).expect(200)).body;
    expect(c.status).toBe('CANCELLED');
    expect(c.cancelledReason).toBe('Gündem yok');
    await admin.post(`/meetings/${adhoc.id}/complete`).expect(422);

    const cal = (await chief.api.get('/meetings/calendar?from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z').expect(200)).body;
    expect(cal.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([m1, m2]));
    expect(cal[0]).toEqual(expect.objectContaining({ code: expect.stringMatching(/^TOP-/), isParticipant: true }));

    const ics = await w1.api.get(`/meetings/${m1}/ics`).expect(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.headers['content-disposition']).toContain('.ics');
    expect(ics.text).toContain('BEGIN:VCALENDAR');
    expect(ics.text).toContain('DTSTART:20260901T050000Z');
    expect(ics.text).toContain('SUMMARY:');
    await outsider.api.get(`/meetings/${m1}/ics`).expect(403);

    const xlsx = await admin.get('/meetings/export?view=all').expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  });

  it('sends daily reminders once, and shows the dashboard widget', async () => {
    const today = (await admin.post('/meetings', { typeId: tier1TypeId, startAt: '2031-05-05T07:00:00.000Z', organizerId: chief.userId }).expect(201)).body;
    const stale = (await admin.post('/meetings', { title: 'Dünkü', startAt: '2031-05-04T07:00:00.000Z', organizerId: chief.userId, participantIds: [w1.userId] }).expect(201)).body;
    const tenant = await prisma.raw.tenant.findUniqueOrThrow({ where: { code: 'MEET' } });
    const job = app.get(MeetingsReminderJob);
    const ctx = app.get(RequestContext);
    const now = new Date('2031-05-05T04:00:00.000Z'); // 07:00 İstanbul
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant(now));
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant(now));

    expect(await prisma.raw.notification.count({ where: { userId: w1.userId, dedupeKey: `meeting-today:${today.id}` } })).toBe(1);
    expect(await prisma.raw.notification.count({ where: { userId: chief.userId, dedupeKey: { startsWith: `meeting-minutes-pending:${stale.id}` } } })).toBe(1);
    expect(await prisma.raw.notification.count({ where: { userId: w1.userId, dedupeKey: { startsWith: 'meeting-minutes-pending:' } } })).toBe(0);

    const dash = (await w1.api.get('/dashboard/me').expect(200)).body;
    expect(dash.widgets.meetings.upcoming.length).toBeGreaterThan(0);
    expect(dash.widgets.meetings.upcoming[0]).toEqual(expect.objectContaining({ code: expect.stringMatching(/^TOP-/) }));
    expect(typeof dash.widgets.meetings.todayCount).toBe('number');
    expect(typeof dash.widgets.meetings.minutesPending).toBe('number');
  });

  it('isolates tenants', async () => {
    await otherAdmin.get(`/meetings/${m1}`).expect(404);
    await otherAdmin.get(`/meetings/${m1}/carried-actions`).expect(404);
    await otherAdmin.post(`/meetings/${m1}/start`).expect(404);
    expect((await otherAdmin.get('/meetings?view=all').expect(200)).body.total).toBe(0);
    expect((await otherAdmin.get('/meetings/types').expect(200)).body).toEqual([]);
    await otherAdmin.get(`/meetings/types/${tier1TypeId}`).expect(404);
    expect((await otherAdmin.get('/meetings/stats').expect(200)).body.total).toBe(0);
    // Başka şirketin tipiyle toplantı açılamaz
    await otherAdmin.post('/meetings', { typeId: tier1TypeId, startAt: '2030-01-01T05:00:00.000Z' }).expect(422);
  });
});

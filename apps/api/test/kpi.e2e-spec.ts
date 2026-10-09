import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { addPeriods, currentPeriod, periodEnd } from '@lean/shared';
import { RequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { KpiReminderJob } from '../src/modules/kpi/kpi-reminder.job';
import { client, createTestApp, login } from './helpers';

type Api = ReturnType<typeof client>;

describe('KPI (e2e)', () => {
  let app: INestApplication;
  let admin: Api;
  let otherAdmin: Api;
  let chief: Api; // birim yöneticisi (MANAGER rolü, Hat K kapsamı)
  let entry: Api; // veri giriş sorumlusu (yalnız EMPLOYEE rolü → kpi.view yok)
  let owner: Api;
  const ids = { unit: '', chiefUser: '', ownerUser: '', entryUser: '', adminUser: '' };
  const kpi: Record<string, string> = {};

  const now = new Date();
  const p0 = currentPeriod('MONTHLY', now);
  const p1 = addPeriods(p0, -1); // son tamamlanan dönem
  const p2 = addPeriods(p0, -2);
  const p3 = addPeriods(p0, -3);

  async function activate(cred: { username: string; temporaryPassword: string }): Promise<Api> {
    const token = await login(app, 'KPIT', cred.username, cred.temporaryPassword);
    const c = client(app, token);
    await c.post('/auth/change-password', { currentPassword: cred.temporaryPassword, newPassword: 'Yeni12345' }).expect(204);
    return client(app, await login(app, 'KPIT', cred.username, 'Yeni12345'));
  }

  beforeAll(async () => {
    app = await createTestApp();
    const prov = app.get(TenantProvisioningService);
    await prov.provision({ code: 'KPIT', name: 'Kpi Test', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Kpi Admin' });
    await prov.provision({ code: 'KPIX', name: 'Kpi Other', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Other Admin' });
    admin = client(app, await login(app, 'KPIT', 'admin', 'Admin123!'));
    otherAdmin = client(app, await login(app, 'KPIX', 'admin', 'Admin123!'));

    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    ids.unit = (await admin.post('/org-units', { name: 'Hat K', code: 'HK', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    const mk = async (no: string, name: string, managerId?: string) =>
      (await admin.post('/employees', { employeeNo: no, firstName: name, lastName: 'Test', orgUnitId: ids.unit, managerId, createUser: true }).expect(201)).body;
    const c = await mk('K1', 'Şef');
    const o = await mk('K2', 'Sahip', c.id);
    const e = await mk('K3', 'Giriş', c.id);
    await admin.patch(`/org-units/${ids.unit}`, { managerEmployeeId: c.id }).expect(200);

    const roles = (await admin.get('/roles').expect(200)).body as { id: string; code: string }[];
    const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
    ids.chiefUser = c.credential.userId;
    ids.ownerUser = o.credential.userId;
    ids.entryUser = e.credential.userId;
    await admin.put(`/users/${ids.chiefUser}/roles`, {
      assignments: [{ roleId: roleId('EMPLOYEE') }, { roleId: roleId('MANAGER'), orgUnitId: ids.unit }],
    }).expect(200);

    chief = await activate(c.credential);
    owner = await activate(o.credential);
    entry = await activate(e.credential);
    ids.adminUser = (await admin.get('/auth/me').expect(200)).body.id;
  });

  afterAll(() => app.close());

  it('creates KPI definitions with validation', async () => {
    const base = {
      name: 'Hat verimliliği', category: 'PRODUCTIVITY', unit: '%', direction: 'HIGHER_BETTER', frequency: 'MONTHLY',
      orgUnitId: ids.unit, ownerId: ids.ownerUser, dataEntryUserId: ids.entryUser, warningTolerancePct: 5, entryDueDays: 0, startPeriod: p3,
    };
    const a = (await admin.post('/kpi/definitions', { ...base, code: 'oee_k' }).expect(201)).body;
    kpi.A = a.id;
    expect(a.code).toBe('OEE_K');
    expect(a.can.manage).toBe(true);
    expect(a.entryState).toBe('MISSING'); // son tamamlanan dönem (p1) girilmedi, son giriş tarihi (dönem sonu) geçti

    const dup = await admin.post('/kpi/definitions', { ...base, code: 'OEE_K' }).expect(422);
    expect(dup.body.code).toBe('CODE_TAKEN');
    await admin.post('/kpi/definitions', { ...base, code: 'BAD', startPeriod: '2026-W01' }).expect(422);

    kpi.B = (await admin.post('/kpi/definitions', { ...base, code: 'ADMIN_ONLY', name: 'Sadece yönetici', ownerId: ids.adminUser, dataEntryUserId: null, entryDueDays: 5, startPeriod: p0 }).expect(201)).body.id;

    // Yetkisiz kullanıcı tanım oluşturamaz
    await entry.post('/kpi/definitions', { ...base, code: 'NOPE' }).expect(403);
    await owner.patch(`/kpi/definitions/${kpi.A}`, { name: 'Hack' }).expect(403);
  });

  it('sets targets in bulk and rejects invalid periods', async () => {
    const periods = [p3, p2, p1, p0];
    const res = (await admin.put(`/kpi/definitions/${kpi.A}/targets`, { targets: periods.map((period) => ({ period, target: 80 })) }).expect(200)).body;
    expect(res).toHaveLength(4);
    const list = (await chief.get(`/kpi/definitions/${kpi.A}/targets?from=${p3}&to=${p0}`).expect(200)).body;
    expect(list.map((t: { target: number }) => t.target)).toEqual([80, 80, 80, 80]);
    await admin.put(`/kpi/definitions/${kpi.A}/targets`, { targets: [{ period: '2026-W01', target: 1 }] }).expect(422);
    await entry.put(`/kpi/definitions/${kpi.A}/targets`, { targets: [{ period: p0, target: 1 }] }).expect(403);
  });

  it('enters values, computes status and requires revision reasons', async () => {
    const green = (await entry.put('/kpi/values', { kpiId: kpi.A, period: p3, value: 85 }).expect(200)).body;
    expect(green.status).toBe('GREEN');
    expect(green.entryState).toBe('COMPLETE');
    expect(green.isLate).toBe(true); // geçmiş dönem, giriş süresi 0 gün

    const red = (await entry.put('/kpi/values', { kpiId: kpi.A, period: p2, value: 60, note: 'Plansız duruş' }).expect(200)).body;
    expect(red.status).toBe('RED');
    expect(red.requiresAction).toBe(true);
    expect(red.entryState).toBe('DEVIATION_REQUIRED');

    const noReason = await entry.put('/kpi/values', { kpiId: kpi.A, period: p2, value: 62 }).expect(422);
    expect(noReason.body.code).toBe('REASON_REQUIRED');
    const revised = (await entry.put('/kpi/values', { kpiId: kpi.A, period: p2, value: 62, reason: 'Düzeltme: sayaç hatası' }).expect(200)).body;
    expect(revised.revised).toBe(true);
    const revs = (await chief.get(`/kpi/definitions/${kpi.A}/revisions?period=${p2}`).expect(200)).body;
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ oldValue: 60, newValue: 62, reason: 'Düzeltme: sayaç hatası' });

    await entry.put('/kpi/values', { kpiId: kpi.A, period: addPeriods(p0, 1), value: 1 }).expect(422); // gelecek dönem
    await entry.put('/kpi/values', { kpiId: kpi.A, period: '2026-W10', value: 1 }).expect(422); // yanlış periyot
    await entry.put('/kpi/values', { kpiId: kpi.B, period: p0, value: 1 }).expect(403); // başkasının KPI'ı
    await owner.put('/kpi/values', { kpiId: kpi.A, period: p0, value: 77 }).expect(200); // YELLOW (76-80)
  });

  it('keeps the period incomplete until explanation and action exist, then completes on approval', async () => {
    const detail = (await entry.get(`/kpi/deviations/detail?kpiId=${kpi.A}&period=${p2}`).expect(200)).body;
    expect(detail.entryState).toBe('DEVIATION_REQUIRED');
    expect(detail.needsActions).toBe(true);

    const saved = (await entry.put('/kpi/deviations', { kpiId: kpi.A, period: p2, explanation: 'Hammadde gecikti', rootCause: 'Tedarik' }).expect(200)).body;
    expect(saved.entryState).toBe('DEVIATION_REQUIRED'); // aksiyon yok
    const devId = saved.deviation.id;

    // Aksiyon yokken onay verilemez
    const early = await chief.post(`/kpi/deviations/${devId}/decide`, { approve: true }).expect(422);
    expect(early.body.code).toBe('ACTION_REQUIRED');

    const action = (await entry.post(`/kpi/deviations/${devId}/actions`, { title: 'Tedarikçi ile termin toplantısı', ownerId: ids.ownerUser, dueDate: '2030-01-15' }).expect(201)).body;
    expect(action.sourceType).toBe('KPI_DEVIATION');
    expect(action.sourceId).toBe(devId);
    expect(action.sourceLabel).toContain('OEE_K');
    expect(action.orgUnit.id).toBe(ids.unit);

    const pending = (await entry.get(`/kpi/deviations/${devId}`).expect(200)).body;
    expect(pending.entryState).toBe('PENDING_APPROVAL');
    expect(pending.actions).toHaveLength(1);

    // Veri giriş sorumlusu onaylayamaz; birim yöneticisi onaylar
    await entry.post(`/kpi/deviations/${devId}/decide`, { approve: true }).expect(403);
    const approved = (await chief.post(`/kpi/deviations/${devId}/decide`, { approve: true, note: 'Uygun' }).expect(201)).body;
    expect(approved.entryState).toBe('COMPLETE');
    expect(approved.deviation.approvalStatus).toBe('APPROVED');
    await chief.post(`/kpi/deviations/${devId}/decide`, { approve: false, note: 'x' }).expect(422);

    // Bağlı aksiyon merkezi aksiyon listesinde de görünür
    const linked = (await admin.get(`/actions?view=all&sourceType=KPI_DEVIATION&sourceId=${devId}`).expect(200)).body;
    expect(linked.total).toBe(1);
  });

  it('handles rejection of a yellow explanation and resubmission', async () => {
    // p0 = 77 → YELLOW: yalnız açıklama yeterli
    const saved = (await owner.put('/kpi/deviations', { kpiId: kpi.A, period: p0, explanation: 'Geçici yavaşlama' }).expect(200)).body;
    expect(saved.entryState).toBe('PENDING_APPROVAL');
    const devId = saved.deviation.id;
    const noNote = await chief.post(`/kpi/deviations/${devId}/decide`, { approve: false }).expect(422);
    expect(noNote.body.code).toBe('NOTE_REQUIRED');
    const rejected = (await chief.post(`/kpi/deviations/${devId}/decide`, { approve: false, note: 'Kök neden yok' }).expect(201)).body;
    expect(rejected.entryState).toBe('DEVIATION_REQUIRED');
    const again = (await owner.put('/kpi/deviations', { kpiId: kpi.A, period: p0, explanation: 'Kök neden: makine ayarı' }).expect(200)).body;
    expect(again.deviation.approvalStatus).toBe('PENDING');
    expect(again.entryState).toBe('PENDING_APPROVAL');
    // Hedefteki dönem için sapma açıklaması istenmez
    await entry.put('/kpi/deviations', { kpiId: kpi.A, period: p3, explanation: 'gerek yok' }).expect(422);
  });

  it('lists deviations and the series with aggregates', async () => {
    const pendingList = (await chief.get('/kpi/deviations?state=pending').expect(200)).body;
    expect(pendingList.map((d: { period: string }) => d.period)).toContain(p0);
    expect(pendingList[0].canApprove).toBe(true);
    const required = (await chief.get('/kpi/deviations?state=required').expect(200)).body;
    expect(required).toHaveLength(0);

    const series = (await chief.get(`/kpi/definitions/${kpi.A}/series?from=${p3}&to=${p0}`).expect(200)).body;
    expect(series.points.map((p: { period: string }) => p.period)).toEqual([p3, p2, p1, p0]);
    expect(series.points[0]).toMatchObject({ value: 85, status: 'GREEN', target: 80 });
    expect(series.points[2]).toMatchObject({ value: null, entryState: 'MISSING' });
    expect(series.ytd.periods).toBeGreaterThanOrEqual(1);
    expect(series.kpi.code).toBe('OEE_K');
  });

  it('reports missing data and compliance, with exports', async () => {
    const missing = (await chief.get('/kpi/missing').expect(200)).body;
    const row = missing.items.find((m: { kpi: { code: string }; period: string }) => m.kpi.code === 'OEE_K' && m.period === p1);
    expect(row).toBeDefined();
    expect(row.daysLate).toBeGreaterThanOrEqual(1);
    expect(row.responsible.id).toBe(ids.entryUser);
    expect(missing.items.some((m: { kpi: { code: string } }) => m.kpi.code === 'ADMIN_ONLY')).toBe(false);

    const compliance = (await chief.get('/kpi/compliance').expect(200)).body;
    expect(compliance.overall).toMatchObject({ expected: 3, late: 2, missing: 1, onTime: 0, complianceRate: 0 });
    expect(compliance.overall.completionRate).toBeCloseTo(66.7, 1);
    expect(compliance.byOrgUnit[0].orgUnit.id).toBe(ids.unit);
    expect(compliance.byPerson[0].user.id).toBe(ids.entryUser);

    for (const url of ['/kpi/missing/export', '/kpi/compliance/export', '/kpi/compliance/export?by=person', '/kpi/feed/export']) {
      const res = await chief.get(url).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    }

    // Sorumlu yalnız kendi KPI'larının eksiklerini görür; dönem filtresi
    const mine = (await entry.get('/kpi/missing').expect(200)).body;
    expect(mine.items.every((m: { kpi: { code: string } }) => m.kpi.code === 'OEE_K')).toBe(true);
    const future = (await chief.get('/kpi/missing?from=2999-01-01').expect(200)).body;
    expect(future.total).toBe(0);

    const summary = (await chief.get('/kpi/summary').expect(200)).body;
    expect(summary.missing).toBeGreaterThanOrEqual(1);
    expect(summary.pendingApproval).toBeGreaterThanOrEqual(1);
  });

  it('serves the entry worklist and the dashboard widget', async () => {
    const entryRes = (await entry.get('/kpi/entry').expect(200)).body;
    expect(entryRes.groups).toHaveLength(1);
    const g = entryRes.groups[0];
    expect(g.frequency).toBe('MONTHLY');
    expect(g.period).toBe(p1);
    expect(g.items.map((i: { kpi: { code: string } }) => i.kpi.code)).toEqual(['OEE_K']);
    expect(g.items[0]).toMatchObject({ value: null, canEnter: true, isCalculated: false, entryState: 'MISSING', target: 80 });
    expect(g.items[0].missingPeriods).toEqual([]);

    const past = (await entry.get(`/kpi/entry?period=${p2}`).expect(200)).body;
    expect(past.groups[0].items[0]).toMatchObject({ period: p2, value: 62, status: 'RED' });

    const dash = (await entry.get('/dashboard/me').expect(200)).body;
    expect(dash.widgets.kpi).toMatchObject({ missing: 1 });
    const chiefDash = (await chief.get('/dashboard/me').expect(200)).body;
    expect(chiefDash.widgets.kpi.pendingApprovals).toBeGreaterThanOrEqual(1);
  });

  it('isolates data-entry users without kpi.view to their own KPIs', async () => {
    const list = (await entry.get('/kpi/definitions').expect(200)).body;
    expect(list.items.map((k: { code: string }) => k.code)).toEqual(['OEE_K']);
    await entry.get(`/kpi/definitions/${kpi.B}`).expect(403);
    await entry.get(`/kpi/definitions/${kpi.B}/series`).expect(403);
    const board = (await entry.get('/kpi/board').expect(200)).body;
    expect(board.items.map((i: { kpi: { code: string } }) => i.kpi.code)).toEqual(['OEE_K']);
    const adminList = (await admin.get('/kpi/definitions').expect(200)).body;
    expect(adminList.total).toBeGreaterThanOrEqual(2);
    // Birim yöneticisi kapsamındaki KPI'ları görür (yönetici kapsamındaki birimde ADMIN_ONLY da var)
    const chiefList = (await chief.get('/kpi/definitions').expect(200)).body;
    expect(chiefList.items.map((k: { code: string }) => k.code).sort()).toEqual(['ADMIN_ONLY', 'OEE_K']);
  });

  it('sends missing-data reminders once and escalates to the unit manager', async () => {
    const prisma = app.get(PrismaService);
    const tenant = await prisma.raw.tenant.findUniqueOrThrow({ where: { code: 'KPIT' } });
    const job = app.get(KpiReminderJob);
    const ctx = app.get(RequestContext);
    // Dönem sonundan 5 gün sonrası: gecikme >= 3 → eskalasyon
    const today = new Date(periodEnd(p1).getTime() + 5 * 86_400_000);
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant(today));
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant(today));

    const missing = await prisma.raw.notification.findMany({ where: { userId: ids.entryUser, type: 'KPI_VALUE_MISSING' } });
    expect(missing.filter((n) => n.dedupeKey === `kpi-missing:${kpi.A}:${p1}`)).toHaveLength(1);
    const esc = await prisma.raw.notification.count({ where: { userId: ids.chiefUser, dedupeKey: `kpi-missing-esc:${kpi.A}:${p1}` } });
    expect(esc).toBe(1);
    const dev = await prisma.raw.notification.count({ where: { userId: ids.ownerUser, type: 'KPI_DEVIATION_REQUIRED' } });
    expect(dev).toBeLessThanOrEqual(1);
  });

  it('accepts bulk values from integrations with an API key', async () => {
    const key = (await admin.post('/api-keys', { name: 'ERP', permissions: ['kpi.value.enter', 'kpi.view'] }).expect(201)).body;
    const server = app.getHttpServer();
    const res = await request(server)
      .post('/api/v1/kpi/values/bulk')
      .set('x-api-key', key.key)
      .send({ items: [{ kpiCode: 'oee_k', period: p1, value: 91, note: 'ERP' }, { kpiCode: 'NO_SUCH', period: p1, value: 1 }, { kpiId: kpi.A, period: 'garbage', value: 1 }] })
      .expect(201);
    expect(res.body).toMatchObject({ total: 3, succeeded: 1, failed: 2 });
    expect(res.body.results[0]).toMatchObject({ ok: true, status: 'GREEN' });
    expect(res.body.results[1].code).toBe('KPI_NOT_FOUND');
    expect(res.body.results[2].code).toBe('INVALID_PERIOD');

    const feed = await request(server).get(`/api/v1/kpi/feed?from=${p3}-01&to=${now.toISOString().slice(0, 10)}`).set('x-api-key', key.key).expect(200);
    const row = feed.body.find((r: { kpiCode: string; period: string }) => r.kpiCode === 'OEE_K' && r.period === p1);
    expect(row).toMatchObject({ value: 91, status: 'GREEN', target: 80, orgUnitName: 'Hat K', frequency: 'MONTHLY' });
    await request(server).get('/api/v1/users').set('x-api-key', key.key).expect(403);

    const after = (await chief.get('/kpi/missing').expect(200)).body;
    expect(after.items.some((m: { kpi: { code: string }; period: string }) => m.kpi.code === 'OEE_K' && m.period === p1)).toBe(false);
    await admin.del(`/api-keys/${key.id}`).expect(204);
  });

  async function upload(type: string, rows: (string | number | null)[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sayfa1');
    rows.forEach((r) => ws.addRow(r));
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const up = (await admin.post('/imports/upload').field('type', type).attach('file', buffer, 'veri.xlsx').expect(201)).body;
    const mapping = up.suggestedMapping;
    const validation = (await admin.post(`/imports/${up.jobId}/validate`, { mapping }).expect(201)).body;
    const result = (await admin.post(`/imports/${up.jobId}/commit`, { mapping }).expect(201)).body;
    return { up, validation, result };
  }

  it('imports KPI values from Excel and records a revision when overwriting', async () => {
    const { up, validation, result } = await upload('kpi-values', [
      ['KPI Kodu', 'Dönem', 'Değer', 'Not'],
      ['OEE_K', p3, 88, 'Excel'], // mevcut değerin üzerine yazar (85 → 88)
      ['OEE_K', `01.${p0.slice(5)}.${p0.slice(0, 4)}`, 79, ''], // tarih → dönem
      ['YOK_KPI', p3, 1, ''],
    ]);
    expect(up.suggestedMapping.kpiCode).toBe('KPI Kodu');
    expect(validation).toMatchObject({ validRows: 2, errorRows: 1 });
    expect(result.successRows).toBe(2);

    const series = (await admin.get(`/kpi/definitions/${kpi.A}/series?from=${p3}&to=${p0}`).expect(200)).body;
    expect(series.points[0]).toMatchObject({ value: 88, source: 'IMPORT' });
    expect(series.points[3]).toMatchObject({ value: 79 });
    const revs = (await admin.get(`/kpi/definitions/${kpi.A}/revisions?period=${p3}`).expect(200)).body;
    expect(revs[0]).toMatchObject({ oldValue: 85, newValue: 88, reason: 'Excel içe aktarma' });
  });

  it('imports KPI definitions with Turkish aliases and targets with date periods', async () => {
    const defs = await upload('kpi-definitions', [
      ['KPI Kodu', 'KPI Adı', 'Kategori', 'Birim', 'Yön', 'Periyot', 'Organizasyon Birimi Kodu', 'KPI Sahibi (Kullanıcı Adı)'],
      ['IMP_W', 'İçe aktarılan', 'Güvenlik', 'adet', 'Düşük iyi', 'Haftalık', 'HK', 'k2'],
      ['IMP_BAD', 'Hatalı', 'Kalite', '%', 'Yüksek iyi', 'Aylık', 'YOKBIRIM', 'k2'],
    ]);
    expect(defs.validation).toMatchObject({ validRows: 1, errorRows: 1 });
    const created = (await admin.get('/kpi/definitions?q=IMP_W').expect(200)).body.items[0];
    expect(created).toMatchObject({ code: 'IMP_W', category: 'SAFETY', direction: 'LOWER_BETTER', frequency: 'WEEKLY' });

    const today = now.toISOString().slice(0, 10);
    const tg = await upload('kpi-targets', [['KPI Kodu', 'Dönem', 'Hedef'], ['IMP_W', today, 2]]);
    expect(tg.result.successRows).toBe(1);
    const targets = (await admin.get(`/kpi/definitions/${created.id}/targets?from=${currentPeriod('WEEKLY', now)}&to=${currentPeriod('WEEKLY', now)}`).expect(200)).body;
    expect(targets).toEqual([{ period: currentPeriod('WEEKLY', now), target: 2, targetMax: null }]);
  });

  it('computes calculated KPIs from a safe formula and rejects invalid formulas', async () => {
    const mkKpi = async (code: string, extra: object = {}) =>
      (await admin.post('/kpi/definitions', { code, name: code, frequency: 'MONTHLY', orgUnitId: ids.unit, ownerId: ids.ownerUser, startPeriod: p3, entryDueDays: 0, aggregation: 'SUM', ...extra }).expect(201)).body;
    const scrap = await mkKpi('SCRAPQ');
    const prod = await mkKpi('PRODQ');
    const calc = await mkKpi('SCRAPRATE', { direction: 'LOWER_BETTER', formula: '({SCRAPQ} / {PRODQ}) * 100', unit: '%' });
    await admin.put(`/kpi/definitions/${calc.id}/targets`, { targets: [{ period: p1, target: 3 }] }).expect(200);

    await admin.put('/kpi/values', { kpiId: scrap.id, period: p1, value: 5 }).expect(200);
    await admin.put('/kpi/values', { kpiId: prod.id, period: p1, value: 200 }).expect(200);
    let s = (await admin.get(`/kpi/definitions/${calc.id}/series?from=${p1}&to=${p1}`).expect(200)).body;
    expect(s.points[0]).toMatchObject({ value: 2.5, status: 'GREEN', source: 'CALCULATED' });

    await admin.put('/kpi/values', { kpiId: prod.id, period: p1, value: 100, reason: 'Düzeltme' }).expect(200);
    s = (await admin.get(`/kpi/definitions/${calc.id}/series?from=${p1}&to=${p1}`).expect(200)).body;
    expect(s.points[0]).toMatchObject({ value: 5, status: 'RED' });
    expect(s.points[0].entryState).toBe('DEVIATION_REQUIRED');

    const manual = await admin.put('/kpi/values', { kpiId: calc.id, period: p1, value: 1 }).expect(422);
    expect(manual.body.code).toBe('CALCULATED_KPI');

    for (const formula of ['{NOPE} + 1', '1 + 2', 'process.exit(1)', '{SCRAPQ} +']) {
      const res = await admin.post('/kpi/definitions', { code: `F${Math.abs(formula.length)}X`, name: 'f', frequency: 'MONTHLY', orgUnitId: ids.unit, ownerId: ids.ownerUser, formula }).expect(422);
      expect(res.body.code).toBe('INVALID_FORMULA');
    }
    const weekly = (await admin.get('/kpi/definitions?q=IMP_W').expect(200)).body.items[0];
    const mixed = await admin.post('/kpi/definitions', { code: 'MIXED', name: 'm', frequency: 'MONTHLY', orgUnitId: ids.unit, ownerId: ids.ownerUser, formula: `{${weekly.code}} * 2` }).expect(422);
    expect(mixed.body.message).toContain('aynı periyotta');

    // Döngü: P2 → P1 var iken P1 → P2 atanamaz
    const q1 = await mkKpi('CYC_A');
    await mkKpi('CYC_B', { formula: '{CYC_A} * 2' });
    const cyc = await admin.patch(`/kpi/definitions/${q1.id}`, { formula: '{CYC_B} + 1' }).expect(422);
    expect(cyc.body.message).toContain('döngü');
  });

  it('adds board and tenant isolation checks', async () => {
    const board = (await admin.get(`/kpi/board?orgUnitId=${ids.unit}`).expect(200)).body;
    const a = board.items.find((i: { kpi: { code: string } }) => i.kpi.code === 'OEE_K');
    expect(a.spark.length).toBeGreaterThan(0);
    expect(a.spark.length).toBeLessThanOrEqual(6);
    expect(board.summary.total).toBe(board.items.length);

    expect((await otherAdmin.get('/kpi/definitions').expect(200)).body.total).toBe(0);
    await otherAdmin.get(`/kpi/definitions/${kpi.A}`).expect(404);
    await otherAdmin.put('/kpi/values', { kpiId: kpi.A, period: p1, value: 1 }).expect(404);
    await otherAdmin.get(`/kpi/definitions/${kpi.A}/series`).expect(404);
    expect((await otherAdmin.get('/kpi/missing').expect(200)).body.total).toBe(0);
    expect((await otherAdmin.get('/kpi/feed').expect(200)).body).toEqual([]);
    await otherAdmin.put(`/kpi/definitions/${kpi.A}/targets`, { targets: [{ period: p1, target: 1 }] }).expect(404);

    // Pasife alma: değer girişi kapanır, geçmiş korunur
    await admin.del(`/kpi/definitions/${kpi.B}`).expect(204);
    expect((await admin.get('/kpi/definitions?q=ADMIN_ONLY').expect(200)).body.total).toBe(0);
    expect((await admin.get('/kpi/definitions?q=ADMIN_ONLY&isActive=false').expect(200)).body.total).toBe(1);
  });
});

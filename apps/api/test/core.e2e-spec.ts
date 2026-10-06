import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { ActionsReminderJob } from '../src/core/actions/actions-reminder.job';
import { RequestContext } from '../src/common/request-context';
import { client, createTestApp, login } from './helpers';

describe('Core (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof client>;
  let otherAdmin: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await createTestApp();
    const prov = app.get(TenantProvisioningService);
    await prov.provision({ code: 'ACME', name: 'Acme', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Acme Admin' });
    await prov.provision({ code: 'OTHER', name: 'Other', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Other Admin' });
    admin = client(app, await login(app, 'acme', 'admin', 'Admin123!'));
    otherAdmin = client(app, await login(app, 'OTHER', 'admin', 'Admin123!'));
  });

  afterAll(() => app.close());

  let lineId: string;
  let chief: { employeeId: string; userId: string; username: string; password: string };
  let worker: { employeeId: string; userId: string; username: string; password: string };

  it('builds organization and employees with accounts', async () => {
    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    const prod = (await admin.post('/org-units', { name: 'Üretim', code: 'URT', type: 'DIRECTORATE', parentId: root.id }).expect(201)).body;
    lineId = (await admin.post('/org-units', { name: 'Hat 1', code: 'H1', type: 'LINE', parentId: prod.id }).expect(201)).body.id;

    const c = (await admin.post('/employees', { employeeNo: 'S1', firstName: 'Şef', lastName: 'Bir', orgUnitId: lineId, createUser: true }).expect(201)).body;
    const w = (await admin.post('/employees', { employeeNo: 'O1', firstName: 'Operatör', lastName: 'Bir', orgUnitId: lineId, managerId: c.id, createUser: true }).expect(201)).body;
    chief = { employeeId: c.id, userId: c.credential.userId, username: c.credential.username, password: c.credential.temporaryPassword };
    worker = { employeeId: w.id, userId: w.credential.userId, username: w.credential.username, password: w.credential.temporaryPassword };
    expect(worker.username).toBe('o1');
  });

  it('forces password change on first login', async () => {
    const token = await login(app, 'ACME', worker.username, worker.password);
    const w = client(app, token);
    const res = await w.get('/actions').expect(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await w.post('/auth/change-password', { currentPassword: worker.password, newPassword: 'short' }).expect(400);
    await w.post('/auth/change-password', { currentPassword: worker.password, newPassword: 'Yeni12345' }).expect(204);
    worker.password = 'Yeni12345';
    await w.get('/actions').expect(200);

    const ct = await login(app, 'ACME', chief.username, chief.password);
    await client(app, ct).post('/auth/change-password', { currentPassword: chief.password, newPassword: 'Sef123456' }).expect(204);
    chief.password = 'Sef123456';
  });

  it('isolates tenants', async () => {
    const acmeEmployees = (await admin.get('/employees').expect(200)).body;
    expect(acmeEmployees.total).toBe(2);
    const other = (await otherAdmin.get('/employees').expect(200)).body;
    expect(other.total).toBe(0);
    await otherAdmin.get(`/employees/${worker.employeeId}`).expect(404);
    await otherAdmin.patch(`/employees/${worker.employeeId}`, { firstName: 'Hack' }).expect(404);
    // Aynı şirket kodu olmadan başka şirketin kullanıcısıyla giriş yapılamaz
    await expect(login(app, 'OTHER', worker.username, worker.password)).rejects.toThrow();
  });

  it('runs the action lifecycle with rights, history and notifications', async () => {
    const w = client(app, await login(app, 'ACME', worker.username, worker.password));
    const c = client(app, await login(app, 'ACME', chief.username, chief.password));

    // Şef, operatöre aksiyon açar (çalışan rolüyle bile kendi ekibine aksiyon açabilir)
    const created = (await c.post('/actions', { title: 'Sensör kalibrasyonu', ownerId: worker.userId, dueDate: '2020-01-10' }).expect(201)).body;
    expect(created.code).toMatch(/^AKS-\d{5}$/);
    expect(created.isOverdue).toBe(true);
    expect(created.orgUnit.id).toBe(lineId);

    const notif = (await w.get('/notifications/unread-count').expect(200)).body;
    expect(notif.count).toBe(1);

    const mine = (await w.get('/actions?view=mine').expect(200)).body;
    expect(mine.items.map((a: { id: string }) => a.id)).toContain(created.id);
    const team = (await c.get('/actions?view=team').expect(200)).body;
    expect(team.total).toBe(1);
    // Çalışan "tüm aksiyonlar" görünümüne erişemez
    await w.get('/actions?view=all').expect(403);

    // Sahip termini doğrudan değiştiremez, revizyon talep eder
    await w.patch(`/actions/${created.id}`, { dueDate: '2030-01-01' }).expect(403);
    const req = (await w.post(`/actions/${created.id}/due-date-requests`, { newDueDate: '2030-01-01', reason: 'Yedek parça bekleniyor' }).expect(201)).body;
    await w.post(`/actions/due-date-requests/${req.id}/decide`, { approve: true }).expect(403);
    await c.post(`/actions/due-date-requests/${req.id}/decide`, { approve: true }).expect(201);

    // İlerleme → devam ediyor; tamamlama notu zorunlu; şef doğrular
    let detail = (await w.patch(`/actions/${created.id}`, { progress: 50 }).expect(200)).body;
    expect(detail.status).toBe('IN_PROGRESS');
    expect(detail.dueDate).toBe('2030-01-01');
    expect(detail.isOverdue).toBe(false);
    const noNote = await w.post(`/actions/${created.id}/status`, { status: 'DONE' }).expect(422);
    expect(noNote.body.code).toBe('NOTE_REQUIRED');
    await w.post(`/actions/${created.id}/status`, { status: 'DONE', note: 'Kalibre edildi' }).expect(201);
    await w.post(`/actions/${created.id}/status`, { status: 'VERIFIED' }).expect(403);
    detail = (await c.post(`/actions/${created.id}/status`, { status: 'VERIFIED' }).expect(201)).body;
    expect(detail.status).toBe('VERIFIED');
    expect(detail.history.map((h: { type: string }) => h.type)).toEqual(
      expect.arrayContaining(['CREATED', 'DUE_DATE_CHANGED', 'PROGRESS', 'STATUS_CHANGED']),
    );
    await c.post(`/actions/${created.id}/status`, { status: 'OPEN' }).expect(422);

    const stats = (await admin.get('/actions/stats?view=all').expect(200)).body;
    expect(stats.verified).toBe(1);

    // Başka şirket aksiyonu göremez
    await otherAdmin.get(`/actions/${created.id}`).expect(404);
  });

  it('sends overdue reminders and escalates to the manager once', async () => {
    const c = client(app, await login(app, 'ACME', chief.username, chief.password));
    const late = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);
    await c.post('/actions', { title: 'Geciken iş', ownerId: worker.userId, dueDate: late }).expect(201);

    const prisma = app.get(PrismaService);
    const tenant = await prisma.raw.tenant.findUniqueOrThrow({ where: { code: 'ACME' } });
    const job = app.get(ActionsReminderJob);
    const ctx = app.get(RequestContext);
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant());
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant());

    const escalations = await prisma.raw.notification.count({ where: { userId: chief.userId, dedupeKey: { startsWith: 'escalation:' } } });
    expect(escalations).toBe(1);
  });

  it('imports employees from Excel with mapping and validation', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sayfa1');
    ws.addRow(['Sicil', 'Adı', 'Soyadı', 'Birim Kodu', 'Hesap Aç']);
    ws.addRow(['P10', 'Ayşe', 'Yılmaz', 'H1', 'Evet']);
    ws.addRow(['P11', 'Can', 'Ak', 'YOK', 'Hayır']);
    ws.addRow(['P12', '', 'Boş', 'H1', 'Hayır']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const upload = (await admin.post('/imports/upload').field('type', 'employees').attach('file', buffer, 'personel.xlsx').expect(201)).body;
    expect(upload.totalRows).toBe(3);
    expect(upload.suggestedMapping.orgUnitCode).toBe('Birim Kodu');
    expect(upload.suggestedMapping.lastName).toBe('Soyadı');

    const mapping = { ...upload.suggestedMapping, employeeNo: 'Sicil', firstName: 'Adı' };
    const validation = (await admin.post(`/imports/${upload.jobId}/validate`, { mapping }).expect(201)).body;
    expect(validation.validRows).toBe(1);
    expect(validation.errorRows).toBe(2);

    const result = (await admin.post(`/imports/${upload.jobId}/commit`, { mapping }).expect(201)).body;
    expect(result.successRows).toBe(1);
    const imported = (await admin.get('/employees?q=Ayşe').expect(200)).body.items[0];
    expect(imported.user.username).toBe('p10');
    await admin.post(`/imports/${upload.jobId}/commit`, { mapping }).expect(422);
  });

  it('serves Excel template and action export', async () => {
    const tpl = await admin.get('/imports/types/employees/template').expect(200);
    expect(tpl.headers['content-type']).toContain('spreadsheetml');
    const exp = await admin.get('/actions/export?view=all').expect(200);
    expect(exp.headers['content-type']).toContain('spreadsheetml');
  });

  it('authenticates integrations with API keys', async () => {
    const key = (await admin.post('/api-keys', { name: 'Power BI', permissions: ['action.viewAll'] }).expect(201)).body;
    const server = app.getHttpServer();
    const request = (await import('supertest')).default;
    const res = await request(server).get('/api/v1/actions?view=all').set('x-api-key', key.key).expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    await request(server).get('/api/v1/users').set('x-api-key', key.key).expect(403);
    await admin.del(`/api-keys/${key.id}`).expect(204);
    await request(server).get('/api/v1/actions?view=all').set('x-api-key', key.key).expect(401);
  });
});

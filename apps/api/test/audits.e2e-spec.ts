import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { AuditsReminderJob } from '../src/modules/audits/audits-reminder.job';
import { client, createTestApp, login } from './helpers';

type Api = ReturnType<typeof client>;
interface Person { employeeId: string; userId: string; token: string; api: Api }

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

describe('Audits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Api;
  let otherAdmin: Api;
  let auditorA: Person; // KAL biriminde
  let auditorB: Person; // H1 biriminde
  let resp: Person; // A1 alan sorumlusu (EMPLOYEE)
  let worker: Person; // EMPLOYEE
  let outsider: Person; // EMPLOYEE, başka birimde
  let h1Id: string;
  let kalId: string;
  let area1: string;
  let area2: string;
  let equipmentId: string;
  let templateId: string;
  let planId: string;
  let doneAuditId: string;
  let answers: { id: string; questionText: string }[];
  let tagId: string;
  const today = todayUtc();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));

  async function makePerson(employeeNo: string, orgUnitId: string, role?: string): Promise<Person> {
    const e = (await admin.post('/employees', { employeeNo, firstName: `P${employeeNo}`, lastName: 'Test', orgUnitId, createUser: true }).expect(201)).body;
    const tmp = client(app, await login(app, 'AUDT', e.credential.username, e.credential.temporaryPassword));
    await tmp.post('/auth/change-password', { currentPassword: e.credential.temporaryPassword, newPassword: 'Yeni12345' }).expect(204);
    const token = await login(app, 'AUDT', e.credential.username, 'Yeni12345');
    if (role) {
      const roles = (await admin.get('/roles').expect(200)).body as { id: string; code: string }[];
      const roleId = (c: string) => roles.find((r) => r.code === c)!.id;
      await admin.put(`/users/${e.credential.userId}/roles`, { assignments: [{ roleId: roleId('EMPLOYEE') }, { roleId: roleId(role) }] }).expect(200);
    }
    return { employeeId: e.id, userId: e.credential.userId, token, api: client(app, token) };
  }

  const upload = (p: Person, entityType: string, entityId: string) =>
    request(app.getHttpServer()).post('/api/v1/attachments').set('Authorization', `Bearer ${p.token}`)
      .field('entityType', entityType).field('entityId', entityId).attach('file', Buffer.from('fake-jpeg'), 'foto.jpg');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const prov = app.get(TenantProvisioningService);
    await prov.provision({ code: 'AUDT', name: 'Audit Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Audit Admin' });
    await prov.provision({ code: 'AUDX', name: 'Other Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Other Admin' });
    admin = client(app, await login(app, 'AUDT', 'admin', 'Admin123!'));
    otherAdmin = client(app, await login(app, 'AUDX', 'admin', 'Admin123!'));

    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    h1Id = (await admin.post('/org-units', { name: 'Hat 1', code: 'H1', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    kalId = (await admin.post('/org-units', { name: 'Kalite', code: 'KAL', type: 'DEPARTMENT', parentId: root.id }).expect(201)).body.id;
    auditorA = await makePerson('A1', kalId, 'AUDITOR');
    auditorB = await makePerson('B1', h1Id, 'AUDITOR');
    resp = await makePerson('R1', h1Id);
    worker = await makePerson('W1', h1Id);
    outsider = await makePerson('X1', kalId);
  });

  afterAll(() => app.close());

  it('imports built-in templates (manage only), with unique codes', async () => {
    const catalog = (await admin.get('/audits/templates/builtin').expect(200)).body;
    expect(catalog.map((c: { key: string }) => c.key)).toEqual(['5S_PRODUCTION', '5S_OFFICE', '5S_WAREHOUSE', 'TPM_AM_STEP1_3', 'EQUIPMENT_DAILY']);
    await auditorA.api.post('/audits/templates/builtin/5S_PRODUCTION', {}).expect(403);
    const t = (await admin.post('/audits/templates/builtin/5S_PRODUCTION', {}).expect(201)).body;
    expect(t.sections).toHaveLength(5);
    expect(t.sections.map((s: { title: string }) => s.title[0])).toEqual(['1', '2', '3', '4', '5']);
    expect(t.questionCount).toBeGreaterThanOrEqual(20);
    expect(t.scaleType).toBe('ZERO_TO_FOUR');
    expect(t.code).toBe('5S_PRODUCTION');
    expect((await admin.post('/audits/templates/builtin/5S_PRODUCTION', {}).expect(201)).body.code).toBe('5S_PRODUCTION-2');
    const daily = (await admin.post('/audits/templates/builtin/EQUIPMENT_DAILY', {}).expect(201)).body;
    expect(daily.scaleType).toBe('YES_NO');
    await admin.post('/audits/templates/builtin/NOPE', {}).expect(404);
    // Okuma: izinli kullanıcı görür
    expect((await auditorA.api.get('/audits/templates').expect(200)).body.length).toBe(3);
    await worker.api.get('/audits/templates').expect(403);
  });

  it('creates areas and equipment (manage only)', async () => {
    await worker.api.post('/audits/areas', { code: 'X', name: 'X', orgUnitId: h1Id }).expect(403);
    area1 = (await admin.post('/audits/areas', { code: 'A1', name: 'Hat 1 Alanı', orgUnitId: h1Id, responsibleId: resp.userId }).expect(201)).body.id;
    area2 = (await admin.post('/audits/areas', { code: 'A2', name: 'Kalite Lab', orgUnitId: kalId, areaType: 'OFFICE' }).expect(201)).body.id;
    await admin.post('/audits/areas', { code: 'a1', name: 'Dup', orgUnitId: h1Id }).expect(422);
    equipmentId = (await admin.post('/audits/equipment', { code: 'PRS-01', name: 'Pres 1', areaId: area1, criticality: 'A' }).expect(201)).body.id;
    expect((await worker.api.get('/audits/areas').expect(200)).body).toHaveLength(2);
    expect((await worker.api.get(`/audits/equipment?areaId=${area1}`).expect(200)).body).toHaveLength(1);
  });

  it('plan generation is idempotent and honors rotation + cross audit', async () => {
    templateId = (
      await admin.post('/audits/templates', {
        name: 'Test 5S', code: 'T5S', type: 'FIVE_S', scaleType: 'ZERO_TO_FOUR',
        sections: [
          { title: 'S1', weight: 2, questions: [{ text: 'Soru 1', photoRequiredBelow: 2 }, { text: 'Soru 2' }] },
          { title: 'S2', weight: 1, questions: [{ text: 'Soru 3', weight: 2 }] },
        ],
      }).expect(201)
    ).body.id;
    // Çapraz denetim + rotasyon: A1 (H1) -> auditorB atlanır, A2 (KAL) -> auditorA atlanır
    planId = (
      await admin.post('/audits/plans', {
        name: 'Aylık 5S', templateId, frequency: 'MONTHLY', areaIds: [area1, area2], assignMode: 'ROTATION',
        auditorIds: [auditorA.userId, auditorB.userId], crossAudit: true, startDate: iso(startMonth),
      }).expect(201)
    ).body.id;
    const first = (await admin.post(`/audits/plans/${planId}/generate`).expect(200)).body;
    expect(first.created).toBe(6);
    for (const a of first.audits) {
      expect(a.status).toBe('PLANNED');
      expect(a.code).toMatch(/^DNT-\d{5}$/);
      if (a.area.id === area1) expect(a.auditor.id).toBe(auditorA.userId);
      if (a.area.id === area2) expect(a.auditor.id).toBe(auditorB.userId);
    }
    const monthEnds = first.audits.map((a: { dueDate: string }) => a.dueDate);
    expect(new Set(monthEnds).size).toBe(3);
    const again = (await admin.post(`/audits/plans/${planId}/generate`).expect(200)).body;
    expect(again.created).toBe(0);
    expect(again.existing).toBe(6);
    const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 15));
    expect((await admin.post(`/audits/plans/${planId}/generate?until=${iso(next)}`).expect(200)).body.created).toBe(2);
    expect((await admin.get(`/audits/plans/${planId}`).expect(200)).body.plannedCount).toBe(8);
    await auditorA.api.post(`/audits/plans/${planId}/generate`).expect(403);
  });

  it('starts an audit with a question snapshot; completion is validated (answers, photos)', async () => {
    const mine = (await auditorA.api.get('/audits?view=mine&open=true').expect(200)).body;
    const current = mine.items.find((a: { area: { id: string }; dueDate: string }) => a.area.id === area1 && a.dueDate >= iso(today));
    doneAuditId = current.id;

    await auditorB.api.post(`/audits/${doneAuditId}/start`).expect(403); // atanmış değil
    const started = (await auditorA.api.post(`/audits/${doneAuditId}/start`).expect(200)).body;
    expect(started.status).toBe('IN_PROGRESS');
    expect(started.answers).toHaveLength(3);
    expect(started.answers[0]).toMatchObject({ sectionTitle: 'S1', questionText: 'Soru 1', photoRequiredBelow: 2, score: null });
    answers = started.answers;

    expect((await auditorA.api.post(`/audits/${doneAuditId}/complete`).expect(422)).body.code).toBe('ANSWERS_INCOMPLETE');

    await auditorA.api.patch(`/audits/${doneAuditId}/answers/${answers[0].id}`, { score: 5 }).expect(422);
    await auditorA.api.patch(`/audits/${doneAuditId}/answers/${answers[0].id}`, { score: 1, comment: 'Gereksiz malzeme var' }).expect(200);
    await auditorA.api.patch(`/audits/${doneAuditId}/answers/${answers[1].id}`, { score: 4 }).expect(200);
    await auditorA.api.patch(`/audits/${doneAuditId}/answers/${answers[2].id}`, { score: 2 }).expect(200);
    // Yalnız atanan denetçi cevap girebilir
    await auditorB.api.patch(`/audits/${doneAuditId}/answers/${answers[0].id}`, { score: 3 }).expect(403);
    // Tam puanlı cevap bulgu olamaz
    expect((await auditorA.api.patch(`/audits/${doneAuditId}/answers/${answers[1].id}`, { isFinding: true }).expect(422)).body.code).toBe('FINDING_NOT_ALLOWED');

    const live = (await auditorA.api.get(`/audits/${doneAuditId}`).expect(200)).body;
    expect(live.scorePct).toBe(58.3);

    expect((await auditorA.api.post(`/audits/${doneAuditId}/complete`).expect(422)).body.code).toBe('PHOTO_REQUIRED');
    await upload(auditorA, 'AUDIT_ANSWER', answers[0].id).expect(201);
    const done = (await auditorA.api.post(`/audits/${doneAuditId}/complete`).expect(200)).body;
    expect(done.status).toBe('COMPLETED');
    expect(done.scorePct).toBe(58.3);
    expect(done.sectionScores.map((s: { scorePct: number }) => s.scorePct)).toEqual([62.5, 50]);
    expect(done.answers[0].photoCount).toBe(1);
    // Tamamlanan denetim salt okunur
    await auditorA.api.patch(`/audits/${doneAuditId}/answers/${answers[0].id}`, { score: 4 }).expect(422);
    await auditorA.api.post(`/audits/${doneAuditId}/start`).expect(422);
  });

  it('turns a finding into an action owned by the area responsible', async () => {
    await auditorA.api.patch(`/audits/${doneAuditId}/answers/${answers[0].id}`, { isFinding: true }).expect(422); // tamamlanmış
    const detail = (await auditorA.api.get(`/audits/${doneAuditId}`).expect(200)).body;
    expect(detail.can.createAction).toBe(true);
    const action = (await auditorA.api.post(`/audits/${doneAuditId}/answers/${answers[0].id}/action`, { dueDate: iso(new Date(today.getTime() + 14 * DAY)) }).expect(201)).body;
    expect(action.sourceType).toBe('AUDIT_FINDING');
    expect(action.sourceId).toBe(doneAuditId);
    expect(action.owner.id).toBe(resp.userId);
    expect(action.sourceLabel).toMatch(/^DNT-\d{5} Hat 1 Alanı – /);
    await auditorA.api.post(`/audits/${doneAuditId}/answers/${answers[0].id}/action`, { dueDate: iso(today) }).expect(422);
    // Tam puan alan cevap için aksiyon açılamaz
    await auditorA.api.post(`/audits/${doneAuditId}/answers/${answers[1].id}/action`, { dueDate: iso(today) }).expect(422);
    const listed = (await auditorA.api.get(`/audits/${doneAuditId}/actions`).expect(200)).body;
    expect(listed).toHaveLength(1);
    const after = (await auditorA.api.get(`/audits/${doneAuditId}`).expect(200)).body;
    expect(after.answers[0]).toMatchObject({ isFinding: true, actionId: action.id });
    // Alan sorumlusu aksiyonu "Aksiyonlarım" üzerinden görür
    const mineActions = (await resp.api.get('/actions?view=mine').expect(200)).body;
    expect(mineActions.items.map((a: { id: string }) => a.id)).toContain(action.id);
  });

  it('versions a template that has completed audits; plain edits stay in place', async () => {
    const rename = (await admin.patch(`/audits/templates/${templateId}`, { name: 'Test 5S (güncel)' }).expect(200)).body;
    expect(rename.id).toBe(templateId);
    expect(rename.versioned).toBeUndefined();

    const edited = (
      await admin.patch(`/audits/templates/${templateId}`, {
        sections: [
          { title: 'S1', weight: 2, questions: [{ text: 'Soru 1', photoRequiredBelow: 2 }, { text: 'Soru 2' }, { text: 'Soru 4' }] },
          { title: 'S2', weight: 1, questions: [{ text: 'Soru 3', weight: 2 }] },
        ],
      }).expect(200)
    ).body;
    expect(edited.versioned).toBe(true);
    expect(edited.id).not.toBe(templateId);
    expect(edited.version).toBe(2);
    expect(edited.code).toBe('T5S');
    expect(edited.questionCount).toBe(4);

    const old = (await admin.get(`/audits/templates/${templateId}`).expect(200)).body;
    expect(old.isActive).toBe(false);
    expect(old.questionCount).toBe(3);
    // Plan ve planlı denetimler yeni sürüme taşındı; tamamlanan denetim anlık görüntüsünü korur
    expect((await admin.get(`/audits/plans/${planId}`).expect(200)).body.template.id).toBe(edited.id);
    const planned = (await admin.get('/audits?status=PLANNED&pageSize=100').expect(200)).body.items;
    expect(planned.every((a: { template: { id: string } }) => a.template.id === edited.id)).toBe(true);
    const done = (await admin.get(`/audits/${doneAuditId}`).expect(200)).body;
    expect(done.template.id).toBe(templateId);
    expect(done.templateVersion).toBe(1);
    expect(done.answers).toHaveLength(3);
    // Yeni denetim 4 soru anlık görüntüler
    const next = planned.find((a: { area: { id: string }; auditor: { id: string } }) => a.auditor.id === auditorA.userId && a.area.id === area1);
    const started = (await auditorA.api.post(`/audits/${next.id}/start`).expect(200)).body;
    expect(started.answers).toHaveLength(4);
    expect(started.templateVersion).toBe(2);
    await admin.post(`/audits/${next.id}/cancel`, { reason: 'test' }).expect(200);
  });

  it('ad-hoc audits: performers start their own, only managers assign others', async () => {
    await worker.api.post('/audits', { templateId, areaId: area1 }).expect(403);
    const tpl = (await admin.get('/audits/templates?type=FIVE_S').expect(200)).body.find((t: { code: string; isActive: boolean }) => t.code === 'T5S' && t.isActive);
    const mine = (await auditorB.api.post('/audits', { templateId: tpl.id, areaId: area1, equipmentId }).expect(201)).body;
    expect(mine.auditor.id).toBe(auditorB.userId);
    expect(mine.equipment.id).toBe(equipmentId);
    await auditorB.api.post('/audits', { templateId: tpl.id, areaId: area1, auditorId: auditorA.userId }).expect(403);
    await admin.post('/audits', { templateId: tpl.id, areaId: area1, auditorId: auditorA.userId }).expect(201);
    await admin.post('/audits', { templateId: tpl.id, areaId: area2, equipmentId }).expect(422); // ekipman başka alanda
    // Yönetici yeniden atayabilir, denetçi atayamaz
    await auditorB.api.patch(`/audits/${mine.id}`, { auditorId: auditorA.userId }).expect(403);
    expect((await admin.patch(`/audits/${mine.id}`, { auditorId: auditorA.userId }).expect(200)).body.auditor.id).toBe(auditorA.userId);
  });

  it('TPM tags: employees open them, assignee / responsible / manager close them', async () => {
    const tag = (await worker.api.post('/audits/tags', { areaId: area1, equipmentId, color: 'RED', category: 'LEAK', description: 'Pres hidrolik hortumunda yağ sızıntısı' }).expect(201)).body;
    tagId = tag.id;
    expect(tag.code).toMatch(/^ETK-\d{5}$/);
    expect(tag.status).toBe('OPEN');
    expect(tag.assignedTo.id).toBe(resp.userId); // varsayılan: alan sorumlusu
    expect(tag.dueDate).toBe(iso(new Date(today.getTime() + 3 * DAY)));
    expect(tag.openedBy.id).toBe(worker.userId);

    await upload(worker, 'TPM_TAG', tagId).expect(201);
    // Açan kendi etiketini görür, ilgisiz çalışan göremez
    await worker.api.get(`/audits/tags/${tagId}`).expect(200);
    await outsider.api.get(`/audits/tags/${tagId}`).expect(403);
    expect((await outsider.api.get('/audits/tags').expect(200)).body.total).toBe(0);
    expect((await worker.api.get('/audits/tags?view=mine').expect(200)).body.total).toBe(1);
    // Açan kapatamaz
    await worker.api.post(`/audits/tags/${tagId}/close`, { closeNote: 'x' }).expect(403);
    await resp.api.post(`/audits/tags/${tagId}/start`).expect(200);
    const closed = (await resp.api.post(`/audits/tags/${tagId}/close`, { closeNote: 'Hortum değiştirildi' }).expect(200)).body;
    expect(closed.status).toBe('CLOSED');
    expect(closed.closeNote).toBe('Hortum değiştirildi');
    await resp.api.post(`/audits/tags/${tagId}/close`, {}).expect(422);

    const blue = (await worker.api.post('/audits/tags', { areaId: area1, color: 'BLUE', category: 'CONTAMINATION', description: 'Makine tablası kirli', assignedToId: auditorB.userId }).expect(201)).body;
    await auditorB.api.post(`/audits/tags/${blue.id}/close`, {}).expect(200); // atanan
    const manager = (await worker.api.post('/audits/tags', { areaId: area1, color: 'RED', category: 'DAMAGE', description: 'Koruyucu kapak kırık' }).expect(201)).body;
    await admin.post(`/audits/tags/${manager.id}/close`, {}).expect(200); // audit.manage
    expect((await admin.get('/audits/tags?status=CLOSED').expect(200)).body.total).toBe(3);
    await admin.get('/audits/tags/export').expect(200).expect('Content-Type', /spreadsheetml/);
  });

  it('reports stats: area scores, ranking, compliance, missed audits, tags', async () => {
    const stats = (await admin.get('/audits/stats').expect(200)).body;
    const a1 = stats.areas.find((a: { areaId: string }) => a.areaId === area1);
    expect(a1.latestScore).toBe(58.3);
    expect(a1.trend).toHaveLength(1);
    expect(a1.sectionAverages.map((s: { scorePct: number }) => s.scorePct)).toEqual([62.5, 50]);
    expect(stats.best[0].areaId).toBe(area1);
    expect(stats.compliance.completed).toBe(1);
    expect(stats.compliance.overdue).toBeGreaterThanOrEqual(4);
    expect(stats.missed.length).toBeGreaterThanOrEqual(4);
    expect(stats.missed[0].daysOverdue).toBeGreaterThanOrEqual(stats.missed[stats.missed.length - 1].daysOverdue);
    expect(stats.findings).toMatchObject({ total: 1, withoutAction: 0, openActions: 1 });
    expect(stats.tags).toMatchObject({ open: 0, closed: 3 });
    expect(stats.tags.avgClosureDays).not.toBeNull();

    const filtered = (await admin.get(`/audits/stats?areaId=${area2}`).expect(200)).body;
    expect(filtered.areas).toHaveLength(1);
    expect(filtered.areas[0].latestScore).toBeNull();
    expect((await admin.get('/audits/stats?templateType=TPM_EQUIPMENT').expect(200)).body.areas.every((a: { latestScore: number | null }) => a.latestScore === null)).toBe(true);
    expect((await admin.get(`/audits/export?view=all`).expect(200)).headers['content-type']).toContain('spreadsheetml');
  });

  it('scopes access by role', async () => {
    // İlgisiz çalışan hiçbir denetim görmez
    expect((await outsider.api.get('/audits?view=all').expect(200)).body.total).toBe(0);
    expect((await outsider.api.get('/audits/stats').expect(200)).body.areas).toHaveLength(0);
    await outsider.api.get(`/audits/${doneAuditId}`).expect(403);
    // Alan sorumlusu kendi alanındaki denetimleri görür ama başlatamaz / yönetemez
    const respList = (await resp.api.get('/audits?view=all&pageSize=100').expect(200)).body;
    expect(respList.total).toBeGreaterThan(0);
    expect(respList.items.every((a: { area: { id: string } }) => a.area.id === area1)).toBe(true);
    await resp.api.get(`/audits/${doneAuditId}`).expect(200);
    await resp.api.post(`/audits/${doneAuditId}/cancel`, {}).expect(403);
    const a2 = (await admin.get(`/audits?areaId=${area2}`).expect(200)).body.items[0];
    await resp.api.get(`/audits/${a2.id}`).expect(403);
    // Denetçi (audit.view kapsamsız) tüm denetimleri görür; çalışan yönetim uçlarına giremez
    expect((await auditorA.api.get('/audits?view=all').expect(200)).body.total).toBeGreaterThan(respList.total);
    await worker.api.post('/audits/plans', { name: 'x', templateId, areaIds: [area1], auditorIds: [auditorA.userId], startDate: iso(today) }).expect(403);
    await worker.api.get('/audits/plans').expect(403);
  });

  it('sends audit and tag reminders once, and shows the dashboard widget', async () => {
    const tpl = (await admin.get('/audits/templates').expect(200)).body.find((t: { code: string; isActive: boolean }) => t.code === 'T5S' && t.isActive);
    const soon = (await admin.post('/audits', { templateId: tpl.id, areaId: area2, auditorId: auditorA.userId, dueDate: iso(new Date(today.getTime() + 2 * DAY)) }).expect(201)).body;
    const old = (await admin.post('/audits', { templateId: tpl.id, areaId: area1, auditorId: auditorB.userId, dueDate: iso(new Date(today.getTime() - 5 * DAY)) }).expect(201)).body;
    const lateTag = (await worker.api.post('/audits/tags', { areaId: area2, color: 'BLUE', category: 'OTHER', description: 'Geciken', assignedToId: auditorB.userId, dueDate: iso(new Date(today.getTime() - 2 * DAY)) }).expect(201)).body;
    // H1 birim yöneticisi: alan sorumlusu
    await prisma.raw.orgUnit.update({ where: { id: h1Id }, data: { managerEmployeeId: resp.employeeId } });

    const tenant = await prisma.raw.tenant.findUniqueOrThrow({ where: { code: 'AUDT' } });
    const job = app.get(AuditsReminderJob);
    const ctx = app.get(RequestContext);
    const result = await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant(new Date()));
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant(new Date()));
    expect(result.dueSoon).toBeGreaterThanOrEqual(1);

    const count = (userId: string, key: string) => prisma.raw.notification.count({ where: { userId, dedupeKey: key } });
    expect(await count(auditorA.userId, `audit-due:${soon.id}`)).toBe(1);
    expect(await count(auditorB.userId, `audit-overdue:${old.id}`)).toBe(1);
    expect(await count(resp.userId, `audit-overdue-mgr:${old.id}`)).toBe(1);
    expect(await count(auditorB.userId, `tag-overdue:${lateTag.id}`)).toBe(1);
    expect(await count(auditorB.userId, `audit-due:${old.id}`)).toBe(0);

    const dash = (await auditorB.api.get('/dashboard/me').expect(200)).body;
    expect(dash.widgets.audits.myOverdue).toBeGreaterThanOrEqual(1);
    expect(dash.widgets.audits.tagsAssigned).toBe(1);
    expect(typeof dash.widgets.audits.myDue).toBe('number');
  });

  it('isolates tenants', async () => {
    await otherAdmin.get(`/audits/${doneAuditId}`).expect(404);
    await otherAdmin.post(`/audits/${doneAuditId}/start`).expect(404);
    await otherAdmin.get(`/audits/tags/${tagId}`).expect(404);
    await otherAdmin.get(`/audits/templates/${templateId}`).expect(404);
    expect((await otherAdmin.get('/audits?view=all').expect(200)).body.total).toBe(0);
    expect((await otherAdmin.get('/audits/templates').expect(200)).body).toEqual([]);
    expect((await otherAdmin.get('/audits/areas').expect(200)).body).toEqual([]);
    expect((await otherAdmin.get('/audits/stats').expect(200)).body.areas).toEqual([]);
    // Başka şirketin şablon/alanıyla denetim açılamaz
    await otherAdmin.post('/audits', { templateId, areaId: area1 }).expect(422);
    await otherAdmin.post(`/audits/plans/${planId}/generate`).expect(404);
  });
});

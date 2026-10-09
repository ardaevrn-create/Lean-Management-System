import { INestApplication } from '@nestjs/common';
import { RequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { ProblemsReminderJob } from '../src/modules/problems/problems-reminder.job';
import { client, createTestApp, login } from './helpers';

type Api = ReturnType<typeof client>;
interface Person { employeeId: string; userId: string; username: string; password: string; api: Api }

const DAY = 86_400_000;
const dateStr = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

describe('Problems (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Api;
  let otherAdmin: Api;
  let lead: Person; // hat şefi: birim yöneticisi => problem sahibi
  let worker: Person; // yalnız EMPLOYEE rolü
  let worker2: Person;
  let member: Person;
  let hat1: string;
  let hat2: string;
  let p1: string;
  let chainId: string;
  let causeManId: string;
  let correctiveActionId: string;

  async function makePerson(employeeNo: string, firstName: string, orgUnitId: string): Promise<Person> {
    const e = (await admin.post('/employees', { employeeNo, firstName, lastName: 'Test', orgUnitId, createUser: true }).expect(201)).body;
    const p = { employeeId: e.id, userId: e.credential.userId, username: e.credential.username, password: 'Yeni12345' };
    const tmp = client(app, await login(app, 'PROB', p.username, e.credential.temporaryPassword));
    await tmp.post('/auth/change-password', { currentPassword: e.credential.temporaryPassword, newPassword: p.password }).expect(204);
    return { ...p, api: client(app, await login(app, 'PROB', p.username, p.password)) };
  }

  const advance = (api: Api, id: string, to: string) => api.post(`/problems/${id}/phase`, { to });
  const expectGate = async (api: Api, id: string, to: string, code: string) => {
    const res = await advance(api, id, to).expect(422);
    expect(res.body.code).toBe(code);
    return res.body;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const prov = app.get(TenantProvisioningService);
    await prov.provision({ code: 'PROB', name: 'Prob Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Prob Admin' });
    await prov.provision({ code: 'POTHER', name: 'Other Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Other Admin' });
    admin = client(app, await login(app, 'PROB', 'admin', 'Admin123!'));
    otherAdmin = client(app, await login(app, 'POTHER', 'admin', 'Admin123!'));

    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    hat1 = (await admin.post('/org-units', { name: 'Hat 1', code: 'H1', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    hat2 = (await admin.post('/org-units', { name: 'Hat 2', code: 'H2', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    lead = await makePerson('S1', 'Sef', hat1);
    worker = await makePerson('O1', 'Operator1', hat1);
    worker2 = await makePerson('O2', 'Operator2', hat1);
    member = await makePerson('M1', 'Uye', hat1);
    await admin.patch(`/org-units/${hat1}`, { managerEmployeeId: lead.employeeId }).expect(200);
  });

  afterAll(() => app.close());

  it('lets a field worker report a problem and see only their own', async () => {
    const created = (await worker.api.post('/problems', {
      title: 'Kaynak dikişinde çatlak', description: 'Hat 1 çıkışında çatlaklı parça', orgUnitId: hat1, severity: 'HIGH', source: 'PROCESS',
    }).expect(201)).body;
    p1 = created.id;
    expect(created.code).toBe('PRB-00001');
    expect(created.phase).toBe('DEFINITION');
    expect(created.owner.id).toBe(lead.userId);
    expect(created.reportedBy.id).toBe(worker.userId);
    expect(created.history).toHaveLength(1);
    expect(created.can.edit).toBe(false);
    expect(created.can.advance).toBe(false);

    // Sahip bilgilendirilir
    const notif = (await lead.api.get('/notifications').expect(200)).body.items[0];
    expect(notif.link).toBe(`/problems/${p1}`);

    const other = (await worker2.api.post('/problems', { title: 'Başka bir problem', orgUnitId: hat1 }).expect(201)).body;
    expect(other.code).toBe('PRB-00002');

    expect((await worker.api.get('/problems?view=mine').expect(200)).body.items.map((x: { id: string }) => x.id)).toEqual([p1]);
    expect((await worker.api.get('/problems?view=all').expect(200)).body.total).toBe(1);
    await worker.api.get(`/problems/${other.id}`).expect(403);
    await worker.api.patch(`/problems/${p1}`, { what: 'x' }).expect(403);
    await worker.api.post(`/problems/${p1}/causes`, { category: 'MAN', text: 'x' }).expect(403);
    await advance(worker.api, p1, 'CONTAINMENT').expect(403);
    await worker.api.post('/problems', { title: 'Geçersiz birim', orgUnitId: 'nope' }).expect(422);
    // Yönetici tüm problemleri görür
    expect((await admin.get('/problems?view=all').expect(200)).body.total).toBe(2);
    // Sahip (özel yetkisiz) kendi problemini görür
    expect((await lead.api.get('/problems?view=mine').expect(200)).body.total).toBe(2);
  });

  it('gates DEFINITION → CONTAINMENT and CONTAINMENT → ROOT_CAUSE', async () => {
    await expectGate(lead.api, p1, 'CONTAINMENT', 'DEFINITION_INCOMPLETE');
    await lead.api.patch(`/problems/${p1}`, { what: 'Çatlak', whereText: 'Hat 1 son kontrol' }).expect(200);
    await expectGate(lead.api, p1, 'CONTAINMENT', 'DEFINITION_INCOMPLETE');
    const upd = (await lead.api.patch(`/problems/${p1}`, {
      occurredAt: '2026-10-01T08:00:00.000Z', who: 'Vardiya A', how: 'Görsel kontrol', howMuch: '12 adet', targetCloseDate: dateStr(30), costImpact: 1500.5,
    }).expect(200)).body;
    expect(upd.costImpact).toBe(1500.5);
    expect(upd.gate.canAdvance).toBe(true);
    expect(upd.gate.nextPhase).toBe('CONTAINMENT');

    // Yatlama / geçersiz atlamalar
    const skip = await advance(lead.api, p1, 'ROOT_CAUSE').expect(422);
    expect(skip.body.code).toBe('INVALID_TRANSITION');
    const moved = (await advance(lead.api, p1, 'CONTAINMENT').expect(201)).body;
    expect(moved.phase).toBe('CONTAINMENT');
    expect(moved.history[0]).toEqual(expect.objectContaining({ fromPhase: 'DEFINITION', toPhase: 'CONTAINMENT' }));

    await expectGate(lead.api, p1, 'ROOT_CAUSE', 'CONTAINMENT_REQUIRED');
    // "gerek yok" bayrağı gerekçesiz yetmez
    await lead.api.patch(`/problems/${p1}`, { containmentNotNeeded: true }).expect(200);
    await expectGate(lead.api, p1, 'ROOT_CAUSE', 'CONTAINMENT_REQUIRED');
    await lead.api.patch(`/problems/${p1}`, { containmentNotNeeded: false }).expect(200);

    // Acil önlem aksiyonu yeterlidir
    const withAction = (await lead.api.post(`/problems/${p1}/actions`, {
      kind: 'CONTAINMENT', title: 'Stoktaki parçaları ayıkla', ownerId: lead.userId, dueDate: dateStr(2),
    }).expect(201)).body;
    const a = withAction.actions[0];
    expect(a.kind).toBe('CONTAINMENT');
    expect(a.action.sourceType).toBe('PROBLEM');
    expect(a.action.sourceId).toBe(p1);
    expect(a.action.sourceLabel).toBe('PRB-00001 Kaynak dikişinde çatlak');
    expect(a.action.orgUnit.id).toBe(hat1);
    expect(withAction.gate.canAdvance).toBe(true);

    const viaActions = (await admin.get(`/actions?view=all&sourceType=PROBLEM&sourceId=${p1}`).expect(200)).body;
    expect(viaActions.total).toBe(1);
    expect((await advance(lead.api, p1, 'ROOT_CAUSE').expect(201)).body.phase).toBe('ROOT_CAUSE');
  });

  it('requires a fishbone and a complete 5-why before actions', async () => {
    await expectGate(lead.api, p1, 'ACTIONS', 'FISHBONE_REQUIRED');

    // Tek kategoride neden yetmez
    causeManId = (await lead.api.post(`/problems/${p1}/causes`, { category: 'MAN', text: 'Operatör eğitimsiz', isCandidate: true }).expect(201))
      .body.causes[0].id;
    const sub = (await lead.api.post(`/problems/${p1}/causes`, { category: 'MACHINE', text: 'ignored', parentId: causeManId }).expect(201)).body;
    const subCause = sub.causes.find((c: { parentId: string | null }) => c.parentId === causeManId);
    expect(subCause.category).toBe('MAN'); // alt neden üst nedenin kategorisini alır
    await expectGate(lead.api, p1, 'ACTIONS', 'FISHBONE_REQUIRED');

    const machine = (await lead.api.post(`/problems/${p1}/causes`, { category: 'MACHINE', text: 'Kaynak makinesi akımı dalgalı' }).expect(201)).body;
    expect(machine.gate.missing).toEqual(['FIVE_WHY_REQUIRED']);
    const body = await expectGate(lead.api, p1, 'ACTIONS', 'FIVE_WHY_REQUIRED');
    expect(body.details.missing).toEqual(['FIVE_WHY_REQUIRED']);

    // 5 Neden yalnız aday nedenler için
    const machineId = machine.causes.find((c: { text: string }) => c.text.startsWith('Kaynak')).id;
    const notCandidate = await lead.api.post(`/problems/${p1}/why-chains`, { causeId: machineId }).expect(422);
    expect(notCandidate.body.code).toBe('NOT_CANDIDATE');

    const chains = (await lead.api.post(`/problems/${p1}/why-chains`, { causeId: causeManId }).expect(201)).body.whyChains;
    chainId = chains[0].id;
    expect(chains[0].complete).toBe(false);
    // 2 adım + kök neden: tamamlanmış sayılmaz
    let d = (await lead.api.put(`/problems/${p1}/why-chains/${chainId}/steps`, {
      steps: [{ question: 'Neden çatladı?', answer: 'Soğuma hızlı' }, { answer: 'Ön ısıtma yok' }],
    }).expect(200)).body;
    await lead.api.patch(`/problems/${p1}/why-chains/${chainId}`, { rootCause: 'Ön ısıtma prosedürü yok', confirmed: true }).expect(200);
    await expectGate(lead.api, p1, 'ACTIONS', 'FIVE_WHY_REQUIRED');
    d = (await lead.api.put(`/problems/${p1}/why-chains/${chainId}/steps`, {
      steps: [{ question: 'Neden çatladı?', answer: 'Soğuma hızlı' }, { answer: 'Ön ısıtma yok' }, { answer: 'Prosedür yok' }],
    }).expect(200)).body;
    expect(d.whyChains[0].steps.map((s: { order: number }) => s.order)).toEqual([1, 2, 3]);
    expect(d.whyChains[0].complete).toBe(true);
    expect(d.gate.canAdvance).toBe(true);

    // Adaylıktan çıkarılan nedenin zinciri silinir; geri alınınca gate yeniden kapanır
    const unmarked = (await lead.api.patch(`/problems/${p1}/causes/${causeManId}`, { isCandidate: false }).expect(200)).body;
    expect(unmarked.whyChains).toHaveLength(0);
    expect(unmarked.gate.missing).toContain('FISHBONE_REQUIRED');
    await lead.api.patch(`/problems/${p1}/causes/${causeManId}`, { isCandidate: true }).expect(200);
    chainId = (await lead.api.post(`/problems/${p1}/why-chains`, { causeId: causeManId }).expect(201)).body.whyChains[0].id;
    await lead.api.put(`/problems/${p1}/why-chains/${chainId}/steps`, {
      steps: [{ answer: 'Soğuma hızlı' }, { answer: 'Ön ısıtma yok' }, { answer: 'Prosedür yok' }],
    }).expect(200);
    await lead.api.patch(`/problems/${p1}/why-chains/${chainId}`, { rootCause: 'Ön ısıtma prosedürü yok', confirmed: true }).expect(200);

    expect((await advance(lead.api, p1, 'ACTIONS').expect(201)).body.phase).toBe('ACTIONS');
  });

  it('requires corrective actions that address every root cause and are done', async () => {
    await expectGate(lead.api, p1, 'VERIFICATION', 'ROOT_CAUSE_UNADDRESSED');

    await lead.api.put(`/problems/${p1}/team`, { members: [{ userId: member.userId, role: 'Kalite' }, { userId: lead.userId }] }).expect(200);
    const team = (await lead.api.get(`/problems/${p1}`).expect(200)).body.members;
    expect(team.map((m: { userId: string }) => m.userId)).toEqual([member.userId]); // sahip ekipte tekrarlanmaz

    const bad = await lead.api.post(`/problems/${p1}/actions`, {
      kind: 'CORRECTIVE', title: 'x', ownerId: member.userId, dueDate: dateStr(5), rootCauseChainId: 'nope',
    }).expect(422);
    expect(bad.body.code).toBe('INVALID_CHAIN');

    const d = (await member.api.post(`/problems/${p1}/actions`, {
      kind: 'CORRECTIVE', title: 'Ön ısıtma prosedürü yaz', ownerId: member.userId, dueDate: dateStr(7), rootCauseChainId: chainId,
    }).expect(201)).body;
    const corrective = d.actions.find((a: { kind: string }) => a.kind === 'CORRECTIVE');
    correctiveActionId = corrective.action.id;
    expect(d.whyChains[0].actionCount).toBe(1);
    await expectGate(lead.api, p1, 'VERIFICATION', 'ACTIONS_OPEN');

    // Önleyici ve yatay aksiyonlar kapıyı etkilemez
    await lead.api.post(`/problems/${p1}/actions`, { kind: 'PREVENTIVE', title: 'Eğitim planı', ownerId: lead.userId, dueDate: dateStr(20) }).expect(201);
    const horiz = (await lead.api.post(`/problems/${p1}/horizontal`, {
      orgUnitIds: [hat2], title: 'Hat 2 ön ısıtma kontrolü', dueDate: dateStr(15), ownerId: lead.userId,
    }).expect(201)).body;
    const h = horiz.actions.find((a: { kind: string }) => a.kind === 'HORIZONTAL');
    expect(h.action.orgUnit.id).toBe(hat2);
    expect(h.action.sourceType).toBe('PROBLEM');
    await expectGate(lead.api, p1, 'VERIFICATION', 'ACTIONS_OPEN');

    // Aksiyon tamamlanınca sahip "Doğrulamaya hazır" bildirimi alır
    await member.api.post(`/actions/${correctiveActionId}/status`, { status: 'DONE', note: 'Prosedür yayınlandı' }).expect(201);
    const notes = (await lead.api.get('/notifications').expect(200)).body.items.map((n: { title: string }) => n.title);
    expect(notes.some((t: string) => t.startsWith('Doğrulamaya hazır'))).toBe(true);

    const ready = (await lead.api.get(`/problems/${p1}`).expect(200)).body;
    expect(ready.gate).toEqual({ nextPhase: 'VERIFICATION', canAdvance: true, missing: [] });
    // Ekip üyesi ilerletebilir
    expect((await advance(member.api, p1, 'VERIFICATION').expect(201)).body.phase).toBe('VERIFICATION');
  });

  it('returns to ROOT_CAUSE on a NOT_EFFECTIVE verification, then closes the full path', async () => {
    await expectGate(lead.api, p1, 'CLOSED', 'VERIFICATION_REQUIRED');
    await lead.api.post(`/problems/${p1}/verifications`, { result: 'NOT_EFFECTIVE', note: 'Çatlak tekrarladı' }).expect(201);
    const back = (await lead.api.get(`/problems/${p1}`).expect(200)).body;
    expect(back.phase).toBe('ROOT_CAUSE');
    expect(back.verifications).toHaveLength(1);
    expect(back.history[0]).toEqual(expect.objectContaining({ fromPhase: 'VERIFICATION', toPhase: 'ROOT_CAUSE' }));
    expect(back.history[0].note).toContain('Çatlak tekrarladı');

    // Doğrulama yalnız Doğrulama aşamasında girilir
    const wrong = await lead.api.post(`/problems/${p1}/verifications`, { result: 'EFFECTIVE' }).expect(422);
    expect(wrong.body.code).toBe('INVALID_PHASE');

    // Tekrar ilerle: kök neden → aksiyonlar → doğrulama
    await advance(lead.api, p1, 'ACTIONS').expect(201);
    await advance(lead.api, p1, 'VERIFICATION').expect(201);
    // Ekip üyesi kapatamaz ve geri alamaz
    await advance(member.api, p1, 'CLOSED').expect(403);
    await advance(member.api, p1, 'ACTIONS').expect(403);
    await expectGate(lead.api, p1, 'CLOSED', 'VERIFICATION_REQUIRED');

    await lead.api.post(`/problems/${p1}/verifications`, { result: 'EFFECTIVE', note: '30 gün tekrar yok' }).expect(201);
    await advance(member.api, p1, 'CLOSED').expect(403);
    const closed = (await advance(lead.api, p1, 'CLOSED').expect(201)).body;
    expect(closed.phase).toBe('CLOSED');
    expect(closed.closedAt).toBeTruthy();
    expect(closed.verifications.map((v: { result: string }) => v.result)).toEqual(['NOT_EFFECTIVE', 'EFFECTIVE']);
    expect(closed.can.edit).toBe(false);

    // Kapanmış problem düzenlenemez / iptal edilemez
    expect((await lead.api.patch(`/problems/${p1}`, { what: 'x' }).expect(422)).body.code).toBe('PROBLEM_LOCKED');
    expect((await lead.api.post(`/problems/${p1}/cancel`, { reason: 'vazgeçildi' }).expect(422)).body.code).toBe('PROBLEM_LOCKED');
    // Sahip geri açabilir
    const reopened = (await advance(lead.api, p1, 'VERIFICATION').expect(201)).body;
    expect(reopened.phase).toBe('VERIFICATION');
    expect(reopened.closedAt).toBeNull();
    await advance(lead.api, p1, 'CLOSED').expect(201);

    // Aşama değişiklikleri denetim izine yazıldı
    const audit = await prisma.raw.auditLog.count({ where: { entity: 'problem', entityId: p1, action: 'phaseChanged' } });
    expect(audit).toBeGreaterThanOrEqual(9);
  });

  it('computes stats with a 6M Pareto of confirmed root causes', async () => {
    const other = (await admin.get('/problems?view=all&q=Başka').expect(200)).body.items[0];
    await admin.patch(`/problems/${other.id}`, { ownerId: lead.userId }).expect(200);
    const stats = (await admin.get('/problems/stats').expect(200)).body;
    expect(stats.total).toBe(2);
    expect(stats.open).toBe(1);
    expect(stats.byPhase.find((p: { phase: string }) => p.phase === 'CLOSED').count).toBe(1);
    expect(stats.byPhase.find((p: { phase: string }) => p.phase === 'DEFINITION').count).toBe(1);
    expect(stats.avgDaysToClose).not.toBeNull();
    expect(stats.pareto).toEqual([{ category: 'MAN', count: 1, cumulativePercent: 100 }]);
    expect(stats.bySource.find((s: { source: string }) => s.source === 'PROCESS').count).toBe(1);
    expect(stats.bySeverity.find((s: { severity: string }) => s.severity === 'HIGH').count).toBe(0); // yalnız açık olanlar

    // Saha çalışanının istatistikleri yalnız kendi problemlerini kapsar
    expect((await worker.api.get('/problems/stats').expect(200)).body.total).toBe(1);

    const xlsx = await admin.get('/problems/export?view=all').expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  });

  it('serves the 8D report data', async () => {
    const report = (await lead.api.get(`/problems/${p1}/report`).expect(200)).body;
    expect(report.company).toBe('Prob Co');
    expect(report.problem.code).toBe('PRB-00001');
    expect(report.team[0].user.id).toBe(lead.userId);
    expect(report.team).toHaveLength(2);
    expect(report.problem.causes.length).toBeGreaterThanOrEqual(3);
    expect(report.problem.whyChains[0].rootCause).toBe('Ön ısıtma prosedürü yok');
    expect(report.problem.actions.length).toBe(4);
    await worker2.api.get(`/problems/${p1}/report`).expect(403);
  });

  it('cancels problems, remindes owners once and shows the dashboard widget', async () => {
    const p3 = (await worker.api.post('/problems', { title: 'Geciken problem', orgUnitId: hat1, source: 'SAFETY' }).expect(201)).body;
    await lead.api.patch(`/problems/${p3.id}`, { targetCloseDate: dateStr(-3), verificationDate: dateStr(-1) }).expect(200);
    const detail = (await lead.api.get(`/problems/${p3.id}`).expect(200)).body;
    expect(detail.overdue).toBe(true);
    expect(detail.overdueDays).toBe(3);
    expect((await lead.api.get('/problems?view=mine&overdue=true').expect(200)).body.items.map((x: { id: string }) => x.id)).toEqual([p3.id]);

    const tenant = await prisma.raw.tenant.findUniqueOrThrow({ where: { code: 'PROB' } });
    const job = app.get(ProblemsReminderJob);
    const ctx = app.get(RequestContext);
    const first = await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant());
    await ctx.runForTenant(tenant.id, () => job.runForCurrentTenant());
    expect(first.overdue).toBeGreaterThanOrEqual(1);
    expect(await prisma.raw.notification.count({ where: { userId: lead.userId, dedupeKey: { startsWith: `problem-overdue:${p3.id}` } } })).toBe(1);
    // Doğrulama tarihi yalnız Aksiyonlar/Doğrulama aşamasında hatırlatılır
    expect(await prisma.raw.notification.count({ where: { userId: lead.userId, dedupeKey: { startsWith: `problem-verification-due:${p3.id}` } } })).toBe(0);

    const dash = (await lead.api.get('/dashboard/me').expect(200)).body;
    expect(dash.widgets.problems).toEqual({ myOpen: 2, overdue: 1, awaitingVerification: 0 });
    expect((await worker.api.get('/dashboard/me').expect(200)).body.widgets.problems.myOpen).toBe(0);

    await member.api.post(`/problems/${p3.id}/cancel`, { reason: 'gereksiz' }).expect(403);
    await worker.api.post(`/problems/${p3.id}/cancel`, { reason: 'gereksiz' }).expect(403);
    const cancelled = (await lead.api.post(`/problems/${p3.id}/cancel`, { reason: 'Mükerrer kayıt' }).expect(201)).body;
    expect(cancelled.phase).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('Mükerrer kayıt');
    expect(cancelled.overdue).toBe(false);
    await advance(lead.api, p3.id, 'DEFINITION').expect(422);
  });

  it('isolates tenants', async () => {
    await otherAdmin.get(`/problems/${p1}`).expect(404);
    await otherAdmin.get(`/problems/${p1}/report`).expect(404);
    await otherAdmin.post(`/problems/${p1}/phase`, { to: 'DEFINITION' }).expect(404);
    await otherAdmin.post(`/problems/${p1}/causes`, { category: 'MAN', text: 'x' }).expect(404);
    expect((await otherAdmin.get('/problems?view=all').expect(200)).body.total).toBe(0);
    expect((await otherAdmin.get('/problems/stats').expect(200)).body.total).toBe(0);
    const [orgRoot] = (await otherAdmin.get('/org-units/tree').expect(200)).body;
    // Başka şirketin birimiyle problem açılamaz
    await otherAdmin.post('/problems', { title: 'Sızıntı denemesi', orgUnitId: hat1 }).expect(422);
    expect(orgRoot.id).toBeTruthy();
  });
});

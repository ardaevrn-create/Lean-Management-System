import { INestApplication } from '@nestjs/common';
import { RequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { SuggestionsReminderJob } from '../src/modules/suggestions/suggestions-reminder.job';
import { client, createTestApp, login } from './helpers';

type Api = ReturnType<typeof client>;
interface Person { employeeId: string; userId: string; api: Api }

const scores = (v: number) => ({ benefit: v, feasibility: v, costEffectiveness: v, creativity: v, scope: v });
const newSuggestion = (title: string, extra: object = {}) => ({
  title, currentState: 'Mevcut durum', proposedState: 'Önerilen durum', expectedBenefit: 'Fayda', category: 'QUALITY', ...extra,
});

describe('Suggestions & Kaizen (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Api;
  let otherAdmin: Api;
  let lineId: string;
  let teamId: string;
  let chief: Person;
  let w1: Person;
  let w2: Person;
  let o3: Person;
  let qc: Person;
  let c1: Person;
  let c2: Person;
  let x: Person;
  let tenantId: string;
  let s1: string; // ana akış
  let s2: string; // ret
  let kaizenId: string;
  let gainId: string;

  async function makePerson(employeeNo: string, firstName: string, roles: { code: string; scoped?: boolean }[], managerId?: string): Promise<Person> {
    const e = (await admin.post('/employees', { employeeNo, firstName, lastName: 'Test', orgUnitId: lineId, managerId, createUser: true }).expect(201)).body;
    const tmp = client(app, await login(app, 'SUGG', e.credential.username, e.credential.temporaryPassword));
    await tmp.post('/auth/change-password', { currentPassword: e.credential.temporaryPassword, newPassword: 'Yeni12345' }).expect(204);
    if (roles.length) {
      const rolesRes = (await admin.get('/roles').expect(200)).body;
      const list: { id: string; code: string }[] = Array.isArray(rolesRes) ? rolesRes : rolesRes.items;
      const id = (code: string) => list.find((r) => r.code === code)!.id;
      await admin.put(`/users/${e.credential.userId}/roles`, { assignments: [{ roleId: id('EMPLOYEE') }, ...roles.map((r) => ({ roleId: id(r.code) }))] }).expect(200);
    }
    return { employeeId: e.id, userId: e.credential.userId, api: client(app, await login(app, 'SUGG', e.credential.username, 'Yeni12345')) };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const prov = app.get(TenantProvisioningService);
    const { tenant } = await prov.provision({ code: 'SUGG', name: 'Sugg Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Sugg Admin' });
    tenantId = tenant.id;
    await prov.provision({ code: 'SOTHER', name: 'Other Co', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Other Admin' });
    admin = client(app, await login(app, 'SUGG', 'admin', 'Admin123!'));
    otherAdmin = client(app, await login(app, 'SOTHER', 'admin', 'Admin123!'));

    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    lineId = (await admin.post('/org-units', { name: 'Hat 1', code: 'H1', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    chief = await makePerson('S1', 'Sef', [{ code: 'MANAGER' }]);
    w1 = await makePerson('O1', 'Operator1', [], chief.employeeId);
    w2 = await makePerson('O2', 'Operator2', [], chief.employeeId);
    o3 = await makePerson('O3', 'Operator3', []);
    qc = await makePerson('Q1', 'Kalite', [{ code: 'QUALITY_COORDINATOR' }]);
    c1 = await makePerson('C1', 'Baskan', [{ code: 'COMMITTEE_MEMBER' }]);
    c2 = await makePerson('C2', 'Uye', [{ code: 'COMMITTEE_MEMBER' }]);
    x = await makePerson('X1', 'Disarida', [{ code: 'MANAGER' }]);
    teamId = (await admin.post('/teams', {
      name: 'Öneri Komitesi', type: 'COMMITTEE',
      members: [{ employeeId: c1.employeeId, role: 'CHAIR' }, { employeeId: c2.employeeId }],
    }).expect(201)).body.id;
  });

  afterAll(() => app.close());

  it('has default settings; only suggestion.manage can change them', async () => {
    const s = (await w1.api.get('/suggestions/settings').expect(200)).body;
    expect(s.criteria).toHaveLength(5);
    expect(s.criteria.reduce((a: number, c: { weight: number }) => a + c.weight, 0)).toBe(100);
    expect(s.pointRules.submission).toBe(5);
    expect(s.rewardTiers.map((t: { name: string }) => t.name)).toEqual(['Bronz', 'Gümüş', 'Altın']);

    await w1.api.put('/suggestions/settings', s).expect(403);
    await qc.api.put('/suggestions/settings', { ...s, committeeTeamId: 'nope' }).expect(422);
    const saved = (await qc.api.put('/suggestions/settings', { ...s, committeeTeamId: teamId, autoAcceptMinScore: 75, autoAcceptMaxCost: 1000 }).expect(200)).body;
    expect(saved.committeeTeamName).toBe('Öneri Komitesi');
    expect(saved.autoAcceptMinScore).toBe(75);
  });

  it('operator submits; manager gets it for pre-evaluation; points are awarded once', async () => {
    const created = (await w1.api.post('/suggestions', newSuggestion('Hat 1 aparat değişimi', { coSubmitterIds: [w2.userId], selfImplementable: true, estimatedCost: 5000 })).expect(201)).body;
    s1 = created.id;
    expect(created.code).toBe('ONR-00001');
    expect(created.status).toBe('PRE_EVALUATION');
    expect(created.preEvaluator.id).toBe(chief.userId);
    expect(created.orgUnit.id).toBe(lineId);
    expect(created.coSubmitters.map((u: { id: string }) => u.id)).toEqual([w2.userId]);
    expect(created.can.withdraw).toBe(true);

    expect((await w1.api.get('/suggestions/points/me').expect(200)).body.total).toBe(5);
    expect((await w2.api.get('/suggestions/points/me').expect(200)).body.total).toBe(5);

    const queue = (await chief.api.get('/suggestions?view=queue').expect(200)).body;
    expect(queue.items.map((i: { id: string }) => i.id)).toEqual([s1]);
    expect(queue.items[0].awaitingMe).toBe('PRE');
    expect((await chief.api.get(`/notifications`).expect(200)).body.items[0].link).toBe(`/suggestions/${s1}`);
  });

  it('operator cannot see others suggestions nor evaluate', async () => {
    await o3.api.get(`/suggestions/${s1}`).expect(403);
    expect((await o3.api.get('/suggestions?view=mine').expect(200)).body.total).toBe(0);
    expect((await o3.api.get('/suggestions?view=queue').expect(200)).body.total).toBe(0);
    await o3.api.get('/suggestions?view=all').expect(403);
    await o3.api.post(`/suggestions/${s1}/pre-evaluation`, { scores: scores(5), decision: 'FORWARD' }).expect(403);
    await w1.api.post(`/suggestions/${s1}/pre-evaluation`, { scores: scores(5), decision: 'FORWARD' }).expect(403);
    await o3.api.get('/suggestions/stats').expect(403);
    // Ortak öneri sahibi görür
    await w2.api.get(`/suggestions/${s1}`).expect(200);
    // Aynı şirketteki ama ilgisiz yönetici de göremez
    await x.api.get(`/suggestions/${s1}`).expect(403);
  });

  it('pre-evaluation validates scores, then forwards to committee', async () => {
    await chief.api.post(`/suggestions/${s1}/pre-evaluation`, { scores: { benefit: 9 }, decision: 'FORWARD' }).expect(422);
    await chief.api.post(`/suggestions/${s1}/pre-evaluation`, { scores: scores(4), decision: 'REJECT' }).expect(422); // gerekçe yok
    // Hızlı onay: maliyet sınırı (1000) aşıldığı için olmaz
    const fast = await chief.api.post(`/suggestions/${s1}/pre-evaluation`, { scores: scores(5), decision: 'ACCEPT' }).expect(422);
    expect(fast.body.code).toBe('FAST_TRACK_NOT_ALLOWED');

    const d = (await chief.api.post(`/suggestions/${s1}/pre-evaluation`, { scores: scores(4), decision: 'FORWARD', comment: 'Uygun' }).expect(200)).body;
    expect(d.status).toBe('COMMITTEE');
    expect(d.preScore).toBe(80);
    expect(d.evaluations[0].stage).toBe('PRE');
    expect(d.events.map((e: { type: string }) => e.type)).toEqual(['SUBMITTED', 'FORWARDED']);
  });

  it('committee members score; chair decides; acceptance points are idempotent', async () => {
    // Komite dışındaki yönetici (evaluate izni var) puanlayamaz
    await x.api.post(`/suggestions/${s1}/committee-evaluation`, { scores: scores(4) }).expect(403);
    await w1.api.post(`/suggestions/${s1}/committee-evaluation`, { scores: scores(4) }).expect(403);

    expect((await c1.api.get('/suggestions?view=queue&stage=COMMITTEE').expect(200)).body.items[0].awaitingMe).toBe('COMMITTEE');
    await c1.api.post(`/suggestions/${s1}/committee-evaluation`, { scores: scores(4), comment: 'iyi' }).expect(200);
    await c2.api.post(`/suggestions/${s1}/committee-evaluation`, { scores: scores(5) }).expect(200);
    // kendi puanını günceller (ikinci kayıt oluşmaz)
    const upd = (await c2.api.post(`/suggestions/${s1}/committee-evaluation`, { scores: scores(4) }).expect(200)).body;
    expect(upd.evaluations.filter((e: { stage: string }) => e.stage === 'COMMITTEE')).toHaveLength(2);

    // Başkan olmayan üye karar veremez
    await c2.api.post(`/suggestions/${s1}/decision`, { decision: 'ACCEPT' }).expect(403);
    const decided = (await c1.api.post(`/suggestions/${s1}/decision`, { decision: 'ACCEPT', note: 'Kabul' }).expect(200)).body;
    expect(decided.status).toBe('ACCEPTED');
    expect(decided.finalScore).toBe(80);

    // %80 → 50 puan + gönderim 5 = 55 (hem öneri sahibi hem ortak)
    expect((await w1.api.get('/suggestions/points/me').expect(200)).body.total).toBe(55);
    expect((await w2.api.get('/suggestions/points/me').expect(200)).body.total).toBe(55);
    // İkinci karar geçersiz ve puan çoğalmaz
    await c1.api.post(`/suggestions/${s1}/decision`, { decision: 'ACCEPT' }).expect(422);
    expect((await w1.api.get('/suggestions/points/me').expect(200)).body.total).toBe(55);
    const me = (await w1.api.get('/suggestions/points/me').expect(200)).body;
    expect(me.tier.name).toBe('Bronz');
    expect(me.next.tier.name).toBe('Gümüş');
  });

  it('rejection requires a reason', async () => {
    s2 = (await w2.api.post('/suggestions', newSuggestion('Gereksiz öneri')).expect(201)).body.id;
    await chief.api.post(`/suggestions/${s2}/pre-evaluation`, { scores: scores(2), decision: 'FORWARD' }).expect(200);
    await c1.api.post(`/suggestions/${s2}/decision`, { decision: 'REJECT' }).expect(422);
    const rej = (await c1.api.post(`/suggestions/${s2}/decision`, { decision: 'REJECT', reason: 'Uygulanabilir değil' }).expect(200)).body;
    expect(rej.status).toBe('REJECTED');
    expect(rej.rejectionReason).toBe('Uygulanabilir değil');
    await w2.api.post(`/suggestions/${s2}/withdraw`).expect(403); // karar sonrası geri çekilemez
    // Reddedilene kabul puanı verilmedi: yalnız gönderim puanı (5) + önceki öneri
    expect((await w2.api.get('/suggestions/points/me').expect(200)).body.total).toBe(55 + 5);
  });

  it('assigns implementer, tracks actions, implements and closes', async () => {
    await w1.api.post(`/suggestions/${s1}/implemented`, {}).expect(422); // henüz uygulamada değil
    await o3.api.post(`/suggestions/${s1}/implementer`, { implementerId: o3.userId }).expect(403);
    const a = (await chief.api.post(`/suggestions/${s1}/implementer`, { implementerId: w1.userId, targetDate: '2026-12-31' }).expect(200)).body;
    expect(a.status).toBe('IN_IMPLEMENTATION');
    expect(a.implementer.id).toBe(w1.userId);

    const action = (await w1.api.post(`/suggestions/${s1}/actions`, { title: 'Aparatı değiştir', ownerId: w1.userId, dueDate: '2026-12-01' }).expect(201)).body;
    expect(action.sourceType).toBe('SUGGESTION');
    expect(action.sourceId).toBe(s1);
    expect(action.sourceLabel).toBe('ONR-00001 Hat 1 aparat değişimi');
    expect((await w1.api.get(`/suggestions/${s1}/actions`).expect(200)).body).toHaveLength(1);

    const open = await w1.api.post(`/suggestions/${s1}/implemented`, {}).expect(422);
    expect(open.body.code).toBe('OPEN_ACTIONS');

    await w1.api.post(`/actions/${action.id}/status`, { status: 'IN_PROGRESS' }).expect(201);
    await w1.api.post(`/actions/${action.id}/status`, { status: 'DONE', note: 'Yapıldı' }).expect(201);
    const notes = (await chief.api.get('/notifications').expect(200)).body.items as { title: string }[];
    expect(notes.some((n) => n.title.includes('Tüm aksiyonlar tamamlandı'))).toBe(true);

    const impl = (await w1.api.post(`/suggestions/${s1}/implemented`, { note: 'Tamam' }).expect(200)).body;
    expect(impl.status).toBe('IMPLEMENTED');
    expect((await w1.api.get('/suggestions/points/me').expect(200)).body.total).toBe(75);
    await w1.api.post(`/suggestions/${s1}/close`).expect(403);
    expect((await chief.api.post(`/suggestions/${s1}/close`).expect(200)).body.status).toBe('CLOSED');
  });

  it('fast-track acceptance by the manager when the threshold is met', async () => {
    const low = (await w2.api.post('/suggestions', newSuggestion('Düşük puanlı', { estimatedCost: 100 })).expect(201)).body.id;
    await chief.api.post(`/suggestions/${low}/pre-evaluation`, { scores: scores(2), decision: 'ACCEPT' }).expect(422);

    const fastId = (await w2.api.post('/suggestions', newSuggestion('Hızlı onay önerisi', { estimatedCost: 500 })).expect(201)).body.id;
    const before = (await w2.api.get('/suggestions/points/me').expect(200)).body.total;
    const acc = (await chief.api.post(`/suggestions/${fastId}/pre-evaluation`, { scores: scores(5), decision: 'ACCEPT' }).expect(200)).body;
    expect(acc.status).toBe('ACCEPTED');
    expect(acc.fastTrack).toBe(true);
    expect(acc.finalScore).toBe(100);
    expect((await w2.api.get('/suggestions/points/me').expect(200)).body.total).toBe(before + 50);
    // komite atlandı
    expect(acc.events.some((e: { toStatus: string }) => e.toStatus === 'COMMITTEE')).toBe(false);
    // geri çekme yalnız karar öncesi
    await w2.api.post(`/suggestions/${low}/withdraw`).expect(200);
    expect((await w2.api.get(`/suggestions/${low}`).expect(200)).body.status).toBe('WITHDRAWN');
  });

  it('converts an accepted suggestion to a kaizen with gains, finance approval and publishing', async () => {
    const created = (await w1.api.post(`/suggestions/${s1}/kaizen`, { type: 'QUICK' }).expect(201)).body;
    kaizenId = created.id;
    expect(created.code).toBe('KZN-00001');
    expect(created.status).toBe('DRAFT');
    expect(created.suggestion.code).toBe('ONR-00001');
    expect(created.leader.id).toBe(w1.userId);
    expect(created.members.map((m: { id: string }) => m.id)).toEqual([w2.userId]);
    expect(created.problem).toBe('Mevcut durum');
    await w1.api.post(`/suggestions/${s1}/kaizen`, {}).expect(422); // zaten dönüştürüldü

    // Taslak yalnız ekibe görünür
    await o3.api.get(`/suggestions/kaizen/${kaizenId}`).expect(403);
    expect((await o3.api.get('/suggestions/kaizen/library').expect(200)).body.total).toBe(0);

    const g = (await w1.api.post(`/suggestions/kaizen/${kaizenId}/gains`, { type: 'TANGIBLE', metric: 'COST_TL', description: 'Fire azalması', beforeValue: 100, afterValue: 40, annualSaving: 120000 }).expect(201)).body;
    await w1.api.post(`/suggestions/kaizen/${kaizenId}/gains`, { type: 'INTANGIBLE', metric: 'SAFETY', description: 'Daha güvenli' }).expect(201);
    gainId = g.gains.find((x: { type: string }) => x.type === 'TANGIBLE').id;
    expect(g.totalAnnualSaving).toBe(120000);
    expect(g.approvedAnnualSaving).toBe(0);

    // Finans onayı yalnız suggestion.manage
    await w1.api.post(`/suggestions/kaizen/${kaizenId}/gains/${gainId}/finance-approval`, { approved: true }).expect(403);
    const fa = (await qc.api.post(`/suggestions/kaizen/${kaizenId}/gains/${gainId}/finance-approval`, { approved: true }).expect(200)).body;
    expect(fa.approvedAnnualSaving).toBe(120000);
    expect(fa.gains.find((x: { id: string }) => x.id === gainId).financeApprovedBy.id).toBe(qc.userId);
    // Değer değişirse onay düşer
    const edited = (await w1.api.patch(`/suggestions/kaizen/${kaizenId}/gains/${gainId}`, { annualSaving: 100000 }).expect(200)).body;
    expect(edited.approvedAnnualSaving).toBe(0);
    await qc.api.post(`/suggestions/kaizen/${kaizenId}/gains/${gainId}/finance-approval`, { approved: true }).expect(200);

    // Kaizen aksiyonu
    const act = (await w1.api.post(`/suggestions/kaizen/${kaizenId}/actions`, { title: 'Standardı güncelle', ownerId: w1.userId, dueDate: '2026-12-15' }).expect(201)).body;
    expect(act.sourceType).toBe('KAIZEN');

    // Onay akışı: lider kendi kaizenini onaylayamaz; yöneticisi (şef) onaylar+yayınlar
    await w1.api.post(`/suggestions/kaizen/${kaizenId}/approve`, { publish: true }).expect(403);
    expect((await w1.api.post(`/suggestions/kaizen/${kaizenId}/submit`).expect(200)).body.status).toBe('SUBMITTED');
    await o3.api.post(`/suggestions/kaizen/${kaizenId}/approve`, {}).expect(403);
    await chief.api.post(`/suggestions/kaizen/${kaizenId}/reject`, {}).expect(422);
    const pub = (await chief.api.post(`/suggestions/kaizen/${kaizenId}/approve`, { publish: true }).expect(200)).body;
    expect(pub.status).toBe('PUBLISHED');
    expect(pub.approvedBy.id).toBe(chief.userId);
    // Yayın puanı: 75 + 30
    expect((await w1.api.get('/suggestions/points/me').expect(200)).body.total).toBe(105);
  });

  it('shows published kaizens in the library to everyone', async () => {
    const lib = (await o3.api.get('/suggestions/kaizen/library').expect(200)).body;
    expect(lib.total).toBe(1);
    expect(lib.items[0].approvedAnnualSaving).toBe(100000);
    expect((await o3.api.get('/suggestions/kaizen/library?q=standart').expect(200)).body.total).toBe(0);
    expect((await o3.api.get('/suggestions/kaizen/library?q=aparat').expect(200)).body.total).toBe(1);
    expect((await o3.api.get('/suggestions/kaizen/library?type=EVENT').expect(200)).body.total).toBe(0);
    await o3.api.get(`/suggestions/kaizen/${kaizenId}`).expect(200);
    // Yayında olan düzenlenemez (ekip)
    await w1.api.patch(`/suggestions/kaizen/${kaizenId}`, { title: 'x' }).expect(403);
    const board = (await o3.api.get('/suggestions/points/leaderboard').expect(200)).body;
    expect(board[0]).toMatchObject({ rank: 1, fullName: expect.stringContaining('Operator2'), points: 170 });
    expect(board.find((b: { fullName: string }) => b.fullName.includes('Operator1'))).toMatchObject({ rank: 2, points: 105, tier: { name: 'Bronz' } });
  });

  it('computes stats incl. participation', async () => {
    const st = (await qc.api.get('/suggestions/stats').expect(200)).body;
    const employees = (await admin.get('/employees?pageSize=100&isActive=true').expect(200)).body.total;
    expect(st.activeEmployees).toBe(employees);
    expect(st.total).toBe(4);
    expect(st.participationPct).toBe(Math.round((2 / employees) * 1000) / 10); // w1, w2
    expect(st.byStatus.CLOSED).toBe(1);
    expect(st.byStatus.REJECTED).toBe(1);
    expect(st.acceptanceRate).toBe(66.7); // 2 kabul / (2 kabul + 1 ret)
    expect(st.implementationRate).toBe(50);
    expect(st.avgDaysToDecision).not.toBeNull();
    expect(st.topContributors[0].count).toBeGreaterThanOrEqual(2);
    expect(st.kaizen.total).toBe(1);
    expect(st.kaizen.approvedAnnualSaving).toBe(100000);
    expect(st.kaizen.byType.QUICK).toBe(1);
    // Yönetici dışı kullanıcı istatistik göremez, yürütücü (evaluate) görür
    await w1.api.get('/suggestions/stats').expect(403);
    await chief.api.get('/suggestions/stats').expect(200);
    const unitRow = st.byOrgUnit.find((u: { orgUnitId: string }) => u.orgUnitId === lineId);
    expect(unitRow.count).toBe(4);
  });

  it('marks the suggestion of the month (manage only, one per month)', async () => {
    await chief.api.post(`/suggestions/${s1}/suggestion-of-month`, { value: true }).expect(403);
    const r = (await qc.api.post(`/suggestions/${s1}/suggestion-of-month`, { value: true, month: '2026-10' }).expect(200)).body;
    expect(r.isSuggestionOfMonth).toBe(true);
    expect(r.suggestionMonth).toBe('2026-10');
  });

  it('exports excel files', async () => {
    const res = await qc.api.get('/suggestions/export?view=all').expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    await qc.api.get('/suggestions/kaizen/export?view=all').expect(200);
    await w1.api.get('/suggestions/export?view=all').expect(403);
  });

  it('isolates tenants', async () => {
    await otherAdmin.get(`/suggestions/${s1}`).expect(404);
    await otherAdmin.get(`/suggestions/kaizen/${kaizenId}`).expect(404);
    expect((await otherAdmin.get('/suggestions?view=all').expect(200)).body.total).toBe(0);
    expect((await otherAdmin.get('/suggestions/kaizen/library').expect(200)).body.total).toBe(0);
    const s = (await otherAdmin.get('/suggestions/settings').expect(200)).body;
    expect(s.committeeTeamId).toBeNull();
    expect((await otherAdmin.get('/suggestions/points/leaderboard').expect(200)).body).toEqual([]);
  });

  it('sends deduplicated reminders', async () => {
    const stale = (await o3.api.post('/suggestions', newSuggestion('Eski öneri')).expect(201)).body.id; // yöneticisi yok → manage kullanıcılarına
    const queued = (await w2.api.post('/suggestions', newSuggestion('Komitede bekleyen')).expect(201)).body.id;
    await chief.api.post(`/suggestions/${queued}/pre-evaluation`, { scores: scores(3), decision: 'FORWARD' }).expect(200);
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    await prisma.raw.suggestion.update({ where: { id: stale }, data: { submittedAt: tenDaysAgo } });

    const job = app.get(SuggestionsReminderJob);
    const ctx = app.get(RequestContext);
    const first = await ctx.runForTenant(tenantId, () => job.runForCurrentTenant(new Date()));
    expect(first.preEvaluation).toBeGreaterThan(0);
    expect(first.committee).toBe(2); // c1 + c2
    const second = await ctx.runForTenant(tenantId, () => job.runForCurrentTenant(new Date()));
    expect(second).toEqual({ preEvaluation: 0, committee: 0 });

    const mine = (await c1.api.get('/notifications').expect(200)).body.items as { title: string }[];
    expect(mine.filter((n) => n.title.includes('Komite kuyruğunda')).length).toBe(1);
  });
});

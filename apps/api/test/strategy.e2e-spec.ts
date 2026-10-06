import { INestApplication } from '@nestjs/common';
import { RequestContext } from '../src/common/request-context';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { HoshinReminderJob } from '../src/modules/strategy/hoshin-reminder.job';
import { client, createTestApp, login } from './helpers';

type Api = ReturnType<typeof client>;
const Y = 2026;

describe('Strategy & Hoshin (e2e)', () => {
  let app: INestApplication;
  let admin: Api;
  let otherAdmin: Api;
  let owner: Api; // hedef sahibi (yalnız EMPLOYEE)
  let outsider: Api; // hedefi olmayan çalışan
  const ids = { unit: '', ownerUser: '', outsiderUser: '', adminUser: '' };
  const g: Record<string, string> = {};
  let planId = '';
  let kpiId = '';

  async function activate(cred: { username: string; temporaryPassword: string }): Promise<Api> {
    const token = await login(app, 'HOSH', cred.username, cred.temporaryPassword);
    await client(app, token).post('/auth/change-password', { currentPassword: cred.temporaryPassword, newPassword: 'Yeni12345' }).expect(204);
    return client(app, await login(app, 'HOSH', cred.username, 'Yeni12345'));
  }

  beforeAll(async () => {
    app = await createTestApp();
    const prov = app.get(TenantProvisioningService);
    await prov.provision({ code: 'HOSH', name: 'Hoshin Test', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Hoshin Admin' });
    await prov.provision({ code: 'HOSX', name: 'Hoshin Other', adminUsername: 'admin', adminPassword: 'Admin123!', adminFullName: 'Other Admin' });
    admin = client(app, await login(app, 'HOSH', 'admin', 'Admin123!'));
    otherAdmin = client(app, await login(app, 'HOSX', 'admin', 'Admin123!'));
    const [root] = (await admin.get('/org-units/tree').expect(200)).body;
    ids.unit = (await admin.post('/org-units', { name: 'Hat H', code: 'HH', type: 'LINE', parentId: root.id }).expect(201)).body.id;
    const mk = async (no: string, name: string) =>
      (await admin.post('/employees', { employeeNo: no, firstName: name, lastName: 'Test', orgUnitId: ids.unit, createUser: true }).expect(201)).body;
    const o = await mk('H1', 'Sahip');
    const x = await mk('H2', 'Dışarıdan');
    ids.ownerUser = o.credential.userId;
    ids.outsiderUser = x.credential.userId;
    owner = await activate(o.credential);
    outsider = await activate(x.credential);
    ids.adminUser = (await admin.get('/auth/me').expect(200)).body.id;
  });

  afterAll(() => app.close());

  it('manages plan, SWOT and objectives; only one plan is ACTIVE', async () => {
    const a = (await admin.post('/strategy/plans', { name: '2026–2030 Planı', startYear: Y, endYear: 2030, vision: 'V', mission: 'M', values: ['Kalite', 'Saygı'] }).expect(201)).body;
    planId = a.id;
    expect(a.status).toBe('DRAFT');
    expect(a.values).toEqual(['Kalite', 'Saygı']);
    await admin.post('/strategy/plans', { name: 'Hatalı', startYear: 2030, endYear: 2026 }).expect(422);

    const s = (await admin.post(`/strategy/plans/${planId}/swot`, { type: 'STRENGTH', text: 'Güçlü marka', impact: 4 }).expect(201)).body;
    await admin.patch(`/strategy/swot/${s.id}`, { impact: 5 }).expect(200);
    const toDelete = (await admin.post(`/strategy/plans/${planId}/swot`, { type: 'THREAT', text: 'Geçici' }).expect(201)).body;
    await admin.del(`/strategy/swot/${toDelete.id}`).expect(204);
    await admin.post(`/strategy/plans/${planId}/swot`, { type: 'WEAKNESS', text: 'x', impact: 9 }).expect(400);

    const o1 = (await admin.post(`/strategy/plans/${planId}/objectives`, { title: 'Operasyonel mükemmellik', perspective: 'INTERNAL_PROCESS' }).expect(201)).body;
    expect(o1.code).toBe('SA1');
    g.obj = o1.id;
    await admin.post(`/strategy/plans/${planId}/objectives`, { code: 'sa1', title: 'Tekrar' }).expect(422);
    const o2 = (await admin.post(`/strategy/plans/${planId}/objectives`, { title: 'Müşteri', perspective: 'CUSTOMER' }).expect(201)).body;
    expect(o2.code).toBe('SA2');

    const detail = (await admin.get(`/strategy/plans/${planId}`).expect(200)).body;
    expect(detail.swot).toHaveLength(1);
    expect(detail.swot[0].impact).toBe(5);
    expect(detail.objectives).toHaveLength(2);

    const b = (await admin.post('/strategy/plans', { name: 'Yeni dönem', startYear: Y, endYear: 2030 }).expect(201)).body;
    await admin.post(`/strategy/plans/${planId}/activate`).expect(200);
    await admin.post(`/strategy/plans/${b.id}/activate`).expect(200);
    const list = (await admin.get('/strategy/plans').expect(200)).body as { id: string; status: string }[];
    expect(list.filter((p) => p.status === 'ACTIVE')).toHaveLength(1);
    expect(list.find((p) => p.id === planId)!.status).toBe('ARCHIVED');
    await admin.post(`/strategy/plans/${planId}/activate`).expect(200);
    expect(((await admin.get('/strategy/plans').expect(200)).body as { status: string }[]).filter((p) => p.status === 'ACTIVE')).toHaveLength(1);
    await admin.del(`/strategy/plans/${b.id}`).expect(422); // arşivlenmiş plan silinemez
    const tmp = (await admin.post('/strategy/plans', { name: 'Silinecek', startYear: Y, endYear: Y }).expect(201)).body;
    await admin.del(`/strategy/plans/${tmp.id}`).expect(204);

    await owner.get('/strategy/plans').expect(403);
    await owner.post('/strategy/plans', { name: 'x', startYear: Y, endYear: Y }).expect(403);
  });

  it('builds the goal tree and validates parent levels', async () => {
    const mkGoal = async (body: object, expected = 201) => admin.post('/hoshin/goals', { planId, ...body }).expect(expected);
    const bt = (await mkGoal({ level: 'BREAKTHROUGH', title: 'OEE %85', year: 2030, objectiveId: g.obj, unit: '%', baseline: 70, targetValue: 85 })).body;
    expect(bt.code).toBe('AH1');
    g.bt = bt.id;
    g.annual = (await mkGoal({ level: 'ANNUAL', parentId: g.bt, title: 'OEE 2026', year: Y, objectiveId: g.obj, ownerId: ids.adminUser })).body.id;
    g.prio = (await mkGoal({ level: 'PRIORITY', parentId: g.annual, title: 'Hızlı kalıp değişimi', year: Y, ownerId: ids.adminUser })).body.id;

    const bad = (await mkGoal({ level: 'PRIORITY', parentId: g.bt, title: 'Hatalı', year: Y }, 422)).body;
    expect(bad.code).toBe('INVALID_PARENT_LEVEL');
    expect((await mkGoal({ level: 'DEPARTMENT', title: 'Ebeveynsiz', year: Y }, 422)).body.code).toBe('PARENT_REQUIRED');
    expect((await mkGoal({ level: 'INDIVIDUAL', parentId: g.annual, title: 'Hatalı', year: Y }, 422)).body.code).toBe('INVALID_PARENT_LEVEL');
    expect((await mkGoal({ level: 'ANNUAL', title: 'Yıl dışı', year: 2040 }, 422)).body.code).toBe('INVALID_YEAR');
    expect((await mkGoal({ level: 'ANNUAL', code: 'ah1', title: 'Aynı kod', year: Y }, 422)).body.code).toBe('CODE_TAKEN');
    await owner.post('/hoshin/goals', { planId, level: 'ANNUAL', title: 'Yetkisiz', year: Y }).expect(403);

    const tree = (await admin.get(`/hoshin/plans/${planId}/tree?year=${Y}`).expect(200)).body;
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0].code).toBe('AH1');
    expect(tree.nodes[0].children[0].children[0].code).toBe('OP1');
    const a = (await admin.get(`/hoshin/goals/${g.annual}`).expect(200)).body;
    expect(a.breadcrumb.map((b: { code: string }) => b.code)).toEqual(['AH1']);
  });

  it('shows bowling from KPI targets and values, with deviations and roll-up', async () => {
    kpiId = (await admin.post('/kpi/definitions', {
      code: 'HOSH_OEE', name: 'OEE', category: 'PRODUCTIVITY', unit: '%', direction: 'HIGHER_BETTER', frequency: 'MONTHLY', aggregation: 'AVERAGE',
      orgUnitId: ids.unit, ownerId: ids.adminUser, warningTolerancePct: 5, entryDueDays: 5, startPeriod: `${Y}-01`,
    }).expect(201)).body.id;
    await admin.put(`/kpi/definitions/${kpiId}/targets`, { targets: ['01', '02', '03'].map((m) => ({ period: `${Y}-${m}`, target: 80 })) }).expect(200);
    await admin.put('/kpi/values', { kpiId, period: `${Y}-01`, value: 85 }).expect(200);
    await admin.put('/kpi/values', { kpiId, period: `${Y}-02`, value: 78 }).expect(200);
    await admin.put('/kpi/values', { kpiId, period: `${Y}-03`, value: 60 }).expect(200);

    const d = (await admin.post('/hoshin/goals', {
      planId, level: 'DEPARTMENT', parentId: g.annual, title: 'Hat H OEE', year: Y, ownerId: ids.adminUser, orgUnitId: ids.unit, kpiId, baseline: 70, targetValue: 80,
    }).expect(201)).body;
    g.dep = d.id;
    expect(d.direction).toBe('HIGHER_BETTER');
    expect(d.aggregation).toBe('AVERAGE');

    const b = (await admin.get(`/hoshin/bowling?planId=${planId}&year=${Y}&goalId=${g.dep}`).expect(200)).body;
    expect(b.rows).toHaveLength(1);
    const row = b.rows[0];
    expect(row.source).toBe('KPI');
    expect(row.cells.slice(0, 3).map((c: { plan: number; actual: number; status: string }) => [c.plan, c.actual, c.status])).toEqual([
      [80, 85, 'GREEN'], [80, 78, 'YELLOW'], [80, 60, 'RED'],
    ]);
    expect(row.cells[3].status).toBe('NO_DATA');
    expect(row.ytd.actual).toBeCloseTo(74.3333, 3);
    expect(row.status).toBe('RED');
    expect(row.achievement).toBeCloseTo(43.3, 1);
    expect(row.canEditActuals).toBe(false);

    // Hedef altı ay: KPI sapması ve aksiyon bağlantısı
    const off0 = (await admin.get(`/hoshin/goals/${g.dep}/off-target?period=${Y}-03`).expect(200)).body;
    expect(off0.status).toBe('RED');
    expect(off0.kpiDeviation).toBeNull();
    await admin.put('/kpi/deviations', { kpiId, period: `${Y}-03`, explanation: 'Plansız duruş' }).expect(200);
    const dev = (await admin.get(`/kpi/deviations/detail?kpiId=${kpiId}&period=${Y}-03`).expect(200)).body;
    await admin.post(`/kpi/deviations/${dev.deviation.id}/actions`, { title: 'Kalıp bakımı', ownerId: ids.adminUser, dueDate: `${Y + 1}-01-31` }).expect(201);
    const off = (await admin.get(`/hoshin/goals/${g.dep}/off-target?period=${Y}-03`).expect(200)).body;
    expect(off.kpiDeviation.explanation).toBe('Plansız duruş');
    expect(off.actions).toHaveLength(1);
    expect(off.kpi.code).toBe('HOSH_OEE');
    await admin.put(`/hoshin/goals/${g.dep}/monthly`, { year: Y, months: [{ month: 1, actual: 1 }] }).expect(422); // KPI bağlı
  });

  it('tracks manual goals: monthly plan, red month and countermeasure action', async () => {
    g.man = (await admin.post('/hoshin/goals', {
      planId, level: 'DEPARTMENT', parentId: g.annual, title: 'Kaizen sayısı', year: Y, ownerId: ids.ownerUser, orgUnitId: ids.unit, unit: 'adet', targetValue: 30, aggregation: 'SUM',
    }).expect(201)).body.id;
    await admin.post(`/hoshin/goals/${g.man}/activate`).expect(200);
    await admin.put(`/hoshin/goals/${g.man}/monthly`, { year: Y, months: [1, 2, 3].map((m) => ({ month: m, plan: 10 })) }).expect(200);
    // sahip gerçekleşme girer, planı değiştiremez
    await owner.put(`/hoshin/goals/${g.man}/monthly`, { year: Y, months: [{ month: 1, plan: 99 }] }).expect(403);
    await owner.put(`/hoshin/goals/${g.man}/monthly`, { year: Y, months: [{ month: 1, actual: 12 }, { month: 2, actual: 4 }] }).expect(200);
    await outsider.put(`/hoshin/goals/${g.man}/monthly`, { year: Y, months: [{ month: 1, actual: 5 }] }).expect(403);

    const row = (await owner.get(`/hoshin/bowling?planId=${planId}&year=${Y}&goalId=${g.man}`).expect(200)).body.rows[0];
    expect(row.source).toBe('MANUAL');
    expect(row.cells[0].status).toBe('GREEN');
    expect(row.cells[1].status).toBe('RED');
    expect(row.canEditActuals).toBe(true);
    expect(row.ytd).toMatchObject({ plan: 20, actual: 16, months: 2 });

    const cm = (await owner.post(`/hoshin/goals/${g.man}/countermeasure`, {
      period: `${Y}-02`, explanation: 'Atölye tatili', title: 'Kaizen atölyesi düzenle', ownerId: ids.ownerUser, dueDate: `${Y + 1}-03-01`, priority: 'HIGH',
    }).expect(201)).body;
    expect(cm.comment).toBe('Atölye tatili');
    expect(cm.actions).toHaveLength(1);
    expect(cm.actions[0].sourceType).toBe('HOSHIN');
    expect(cm.actions[0].sourceId).toBe(g.man);
    expect(cm.actions[0].sourceLabel).toMatch(new RegExp(`^${'BH\\d+'} Kaizen sayısı – ${Y}-02$`));
    const detail = (await owner.get(`/hoshin/goals/${g.man}`).expect(200)).body;
    expect(detail.actions).toHaveLength(1);
    expect(detail.bowling.cells[1].comment).toBe('Atölye tatili');
    const fromActions = (await admin.get('/actions?view=all&sourceType=HOSHIN').expect(200)).body;
    expect(fromActions.items.some((a: { sourceId: string }) => a.sourceId === g.man)).toBe(true);
  });

  it('runs the catchball flow to agreement and activation', async () => {
    const p = (await admin.post('/hoshin/goals', {
      planId, level: 'DEPARTMENT', parentId: g.annual, title: 'Hurda azaltma', year: Y, ownerId: ids.ownerUser, orgUnitId: ids.unit, targetValue: 90, baseline: 100, direction: 'LOWER_BETTER', propose: true,
    }).expect(201)).body;
    g.cb = p.id;
    expect(p.status).toBe('PROPOSED');
    expect(p.catchball).toHaveLength(1);
    expect(p.catchballState.mySide).toBe('PARENT');

    const mine = (await owner.get('/hoshin/catchball').expect(200)).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ mySide: 'CHILD', awaitingMe: true });
    const dash = (await owner.get('/dashboard/me').expect(200)).body;
    expect(dash.widgets.hoshin.catchballPending).toBe(1);

    await owner.post(`/hoshin/goals/${g.cb}/activate`).expect(403);
    await owner.post(`/hoshin/goals/${g.cb}/catchball`, { type: 'COUNTER_PROPOSAL', message: 'Çok iddialı', proposedTarget: 95 }).expect(201);
    expect((await admin.get(`/hoshin/goals/${g.cb}`).expect(200)).body.status).toBe('IN_CATCHBALL');
    // kendi önerisine onay veremez
    expect((await owner.post(`/hoshin/goals/${g.cb}/catchball`, { type: 'AGREEMENT' }).expect(422)).body.code).toBe('CATCHBALL_NOT_ALLOWED');
    await outsider.post(`/hoshin/goals/${g.cb}/catchball`, { type: 'COMMENT', message: 'x' }).expect(403);
    await admin.post(`/hoshin/goals/${g.cb}/activate`).expect(422); // henüz mutabık değil
    await admin.post(`/hoshin/goals/${g.cb}/catchball`, { type: 'AGREEMENT', message: 'Tamam' }).expect(201);
    const agreed = (await admin.get(`/hoshin/goals/${g.cb}`).expect(200)).body;
    expect(agreed.status).toBe('AGREED');
    expect(agreed.targetValue).toBe(95);
    expect(agreed.agreedAt).toBeTruthy();
    expect(agreed.catchball.map((e: { type: string }) => e.type)).toEqual(['PROPOSAL', 'COUNTER_PROPOSAL', 'AGREEMENT']);
    expect((await owner.post(`/hoshin/goals/${g.cb}/catchball`, { type: 'COMMENT', message: 'geç' }).expect(422)).body.code).toBe('CATCHBALL_CLOSED');
    const act = (await admin.post(`/hoshin/goals/${g.cb}/activate`).expect(200)).body;
    expect(act.status).toBe('ACTIVE');
    const notes = (await owner.get('/notifications').expect(200)).body;
    expect(JSON.stringify(notes)).toContain('Hurda azaltma');
  });

  it('serves the x-matrix structure and validates correlations', async () => {
    const put = (items: object[], c: Api = admin) => c.put(`/hoshin/plans/${planId}/correlations`, { year: Y, items });
    const res = (await put([
      { fromGoalId: g.annual, targetType: 'GOAL', targetId: g.bt, strength: 'STRONG' },
      { fromGoalId: g.prio, targetType: 'GOAL', targetId: g.annual, strength: 'MEDIUM' },
      { fromGoalId: g.prio, targetType: 'KPI', targetId: kpiId, strength: 'WEAK' },
      { fromGoalId: g.bt, targetType: 'KPI', targetId: kpiId, strength: 'STRONG' },
      { fromGoalId: g.prio, targetType: 'USER', targetId: ids.ownerUser, strength: 'STRONG', role: 'SUPPORT' },
    ]).expect(200)).body;
    expect(res.breakthroughs.map((x: { code: string }) => x.code)).toEqual(['AH1']);
    expect(res.annuals).toHaveLength(1);
    expect(res.priorities).toHaveLength(1);
    expect(res.kpis.map((k: { code: string }) => k.code)).toEqual(['HOSH_OEE']);
    expect(res.owners.map((o: { id: string }) => o.id)).toEqual(expect.arrayContaining([ids.ownerUser, ids.adminUser]));
    expect(res.correlations).toHaveLength(5);
    expect(res.correlations.find((c: { targetType: string }) => c.targetType === 'USER').role).toBe('SUPPORT');
    expect(res.can.edit).toBe(true);

    expect((await put([{ fromGoalId: g.prio, targetType: 'GOAL', targetId: g.bt, strength: 'STRONG' }]).expect(422)).body.code).toBe('INVALID_CORRELATION');
    await put([], owner).expect(403);
    // hata durumunda mevcut küme korunur
    const again = (await admin.get(`/hoshin/plans/${planId}/x-matrix?year=${Y}`).expect(200)).body;
    expect(again.correlations).toHaveLength(5);
  });

  it('rolls progress up and drills down from company to department', async () => {
    const dd = (await admin.get(`/hoshin/plans/${planId}/drilldown?year=${Y}`).expect(200)).body;
    expect(dd.items.map((i: { code: string }) => i.code)).toEqual(['AH1']);
    expect(dd.items[0].childCount).toBe(1);
    const level2 = (await admin.get(`/hoshin/plans/${planId}/drilldown?year=${Y}&parentId=${g.annual}`).expect(200)).body;
    expect(level2.parent.code).toBe('YH1');
    const codes = level2.items.map((i: { id: string }) => i.id);
    expect(codes).toEqual(expect.arrayContaining([g.prio, g.dep, g.man]));
    const annual = (await admin.get(`/hoshin/goals/${g.annual}`).expect(200)).body;
    expect(annual.progress.source).toBe('ROLLUP');
    expect(annual.progress.achievement).toBeGreaterThan(0);
    const unit = dd.orgUnits.find((u: { orgUnit: { id: string } }) => u.orgUnit.id === ids.unit);
    expect(unit.goalCount).toBeGreaterThanOrEqual(3);
    expect(unit.red).toBeGreaterThanOrEqual(1);
    const bt = dd.items[0];
    expect(bt.progress.achievement).not.toBeNull();
  });

  it('produces the annual review and excel exports', async () => {
    const r = (await admin.get(`/hoshin/plans/${planId}/review?year=${Y}`).expect(200)).body;
    expect(r.rows.length).toBeGreaterThanOrEqual(6);
    const man = r.rows.find((x: { goal: { id: string } }) => x.goal.id === g.man);
    expect(man.openActions).toBe(1);
    const cb = r.rows.find((x: { goal: { id: string } }) => x.goal.id === g.cb);
    expect(cb.agreedAt).toBeTruthy();
    expect(r.summary.goals).toBe(r.rows.length);
    expect(r.summary.openActions).toBeGreaterThanOrEqual(1);
    const dep = r.rows.find((x: { goal: { id: string } }) => x.goal.id === g.dep);
    expect(dep.status).toBe('RED');
    expect(dep.parentCode).toBe('YH1');

    for (const url of [`/hoshin/plans/${planId}/tree/export?year=${Y}`, `/hoshin/bowling/export?planId=${planId}&year=${Y}`]) {
      const res = await admin.get(url).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    }
  });

  it('limits visibility to own goals and ancestors for users without hoshin.view', async () => {
    const tree = (await owner.get(`/hoshin/plans/${planId}/tree?year=${Y}`).expect(200)).body;
    const flat: { id: string }[] = [];
    const walk = (n: { id: string; children: unknown[] }) => { flat.push(n); (n.children as typeof n[]).forEach(walk); };
    tree.nodes.forEach(walk);
    const got = flat.map((n) => n.id).sort();
    // sahibi olduğu iki hedef + üst hedefleri (YH1, AH1); diğer birim/öncelik hedefleri yok
    expect(got).toEqual([g.bt, g.annual, g.man, g.cb].sort());
    expect(tree.can.manage).toBe(false);
    await owner.get(`/hoshin/goals/${g.dep}`).expect(403);
    await owner.get(`/hoshin/goals/${g.man}`).expect(200);
    expect((await owner.get(`/hoshin/bowling?planId=${planId}&year=${Y}`).expect(200)).body.rows.map((r: { goal: { id: string } }) => r.goal.id).sort()).toEqual([g.annual, g.man, g.cb].sort());
    expect((await outsider.get(`/hoshin/plans/${planId}/tree?year=${Y}`).expect(200)).body.nodes).toHaveLength(0);
    await outsider.get(`/hoshin/goals/${g.man}`).expect(403);
    await owner.patch(`/hoshin/goals/${g.man}`, { title: 'Hack' }).expect(403);
    await owner.get(`/hoshin/plans/${planId}/x-matrix?year=${Y}`).expect(200);
    const dash = (await owner.get('/dashboard/me').expect(200)).body;
    expect(dash.widgets.hoshin.myGoals).toBeGreaterThanOrEqual(2);
  });

  it('reminds owners of missing last-month actuals', async () => {
    const job = app.get(HoshinReminderJob);
    const ctx = app.get(RequestContext);
    const tenantId = (await admin.get('/auth/me').expect(200)).body.tenantId as string;
    const sent = await ctx.runForTenant(tenantId, () => job.runForCurrentTenant(new Date(Date.UTC(Y, 3, 3)))); // 3 Nisan: Mart gerçekleşmesi eksik
    expect(sent).toBe(1);
    const again = await ctx.runForTenant(tenantId, () => job.runForCurrentTenant(new Date(Date.UTC(Y, 3, 3))));
    expect(again).toBe(0); // tekrarlanmaz
  });

  it('copies the plan as a new version', async () => {
    const v = (await admin.post(`/strategy/plans/${planId}/new-version`).expect(201)).body;
    expect(v.version).toBe(2);
    expect(v.status).toBe('DRAFT');
    expect(v.previousVersionId).toBe(planId);
    expect(v.goalCount).toBeGreaterThanOrEqual(6);
    expect(v.swot).toHaveLength(1);
    const tree = (await admin.get(`/hoshin/plans/${v.id}/tree?year=${Y}`).expect(200)).body;
    expect(tree.nodes[0].code).toBe('AH1');
  });

  it('isolates tenants', async () => {
    await otherAdmin.get(`/hoshin/goals/${g.man}`).expect(404);
    await otherAdmin.get(`/hoshin/plans/${planId}/tree?year=${Y}`).expect(404);
    await otherAdmin.get(`/strategy/plans/${planId}`).expect(404);
    expect((await otherAdmin.get('/strategy/plans').expect(200)).body).toHaveLength(0);
    expect((await otherAdmin.get('/hoshin/plans').expect(200)).body).toHaveLength(0);
    await otherAdmin.post('/hoshin/goals', { planId, level: 'BREAKTHROUGH', title: 'x' }).expect(404);
  });
});

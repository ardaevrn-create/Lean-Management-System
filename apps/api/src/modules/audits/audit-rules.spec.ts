import { complianceCounts, buildAreaStats, rankAreas, sectionAverages, tagStats } from './audit-stats';
import { computeAuditScore, enumeratePeriods, isValidScore, periodOf, pickRotationAuditor } from './audit-rules';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('computeAuditScore', () => {
  it('normalizes per scale and weights questions within a section', () => {
    const r = computeAuditScore(
      [
        { sectionTitle: 'A', sectionWeight: 1, weight: 1, score: 4 },
        { sectionTitle: 'A', sectionWeight: 1, weight: 3, score: 2 },
      ],
      'ZERO_TO_FOUR',
    );
    // (1*1 + 3*0.5) / 4 = 62.5
    expect(r.sections[0].scorePct).toBe(62.5);
    expect(r.scorePct).toBe(62.5);
  });

  it('weights sections', () => {
    const r = computeAuditScore(
      [
        { sectionTitle: 'A', sectionWeight: 3, weight: 1, score: 5 },
        { sectionTitle: 'B', sectionWeight: 1, weight: 1, score: 0 },
      ],
      'ZERO_TO_FIVE',
    );
    expect(r.scorePct).toBe(75);
  });

  it('handles YES_NO as 1/0', () => {
    const r = computeAuditScore(
      [
        { sectionTitle: 'A', sectionWeight: 1, weight: 1, score: 1 },
        { sectionTitle: 'A', sectionWeight: 1, weight: 1, score: 0 },
        { sectionTitle: 'A', sectionWeight: 1, weight: 2, score: 1 },
      ],
      'YES_NO',
    );
    expect(r.scorePct).toBe(75);
  });

  it('ignores missing scores and sections without any score', () => {
    const r = computeAuditScore(
      [
        { sectionTitle: 'A', sectionWeight: 1, weight: 1, score: 2 },
        { sectionTitle: 'A', sectionWeight: 1, weight: 1, score: null },
        { sectionTitle: 'B', sectionWeight: 5, weight: 1, score: null },
      ],
      'ZERO_TO_FOUR',
    );
    expect(r.sections.map((s) => s.scorePct)).toEqual([50, null]);
    expect(r.scorePct).toBe(50);
    expect(computeAuditScore([], 'YES_NO').scorePct).toBeNull();
  });

  it('validates scores', () => {
    expect(isValidScore(4, 'ZERO_TO_FOUR')).toBe(true);
    expect(isValidScore(5, 'ZERO_TO_FOUR')).toBe(false);
    expect(isValidScore(2, 'YES_NO')).toBe(false);
    expect(isValidScore(1.5, 'ZERO_TO_FIVE')).toBe(false);
  });
});

describe('periods', () => {
  it('computes period keys and due dates', () => {
    expect(periodOf('MONTHLY', d('2026-02-10'))).toEqual({ key: '2026-02', start: d('2026-02-01'), end: d('2026-02-28') });
    expect(periodOf('QUARTERLY', d('2026-08-15')).key).toBe('2026-Q3');
    expect(periodOf('QUARTERLY', d('2026-08-15')).end).toEqual(d('2026-09-30'));
    const w = periodOf('WEEKLY', d('2026-10-07'));
    expect(w.key).toBe('2026-W41');
    expect(w.start).toEqual(d('2026-10-05'));
    expect(w.end).toEqual(d('2026-10-11'));
    // yıl sınırı (ISO)
    expect(periodOf('WEEKLY', d('2027-01-01')).key).toBe('2026-W53');
  });

  it('enumerates periods up to until and respects endDate', () => {
    const keys = (p: { key: string }[]) => p.map((x) => x.key);
    expect(keys(enumeratePeriods('MONTHLY', d('2026-06-15'), d('2026-10-06')))).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(keys(enumeratePeriods('MONTHLY', d('2026-06-15'), d('2026-10-06'), d('2026-07-31')))).toEqual(['2026-06', '2026-07']);
    expect(keys(enumeratePeriods('QUARTERLY', d('2026-01-01'), d('2026-12-31')))).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    expect(enumeratePeriods('WEEKLY', d('2026-10-01'), d('2026-10-20'))).toHaveLength(4);
  });
});

describe('pickRotationAuditor', () => {
  const auditors = [
    { userId: 'kal', orgPath: '/r/g/kal/' },
    { userId: 'bkm', orgPath: '/r/g/bkm/' },
    { userId: 'h1', orgPath: '/r/g/urt/h1/' },
  ];
  it('rotates by start index', () => {
    expect(pickRotationAuditor({ auditors, startIndex: 0, areaPath: '/r/g/ik/', crossAudit: false })).toBe('kal');
    expect(pickRotationAuditor({ auditors, startIndex: 4, areaPath: '/r/g/ik/', crossAudit: false })).toBe('bkm');
  });
  it('skips auditors belonging to the area subtree when cross audit is on', () => {
    expect(pickRotationAuditor({ auditors, startIndex: 2, areaPath: '/r/g/urt/', crossAudit: true })).toBe('kal');
    expect(pickRotationAuditor({ auditors, startIndex: 0, areaPath: '/r/g/kal/', crossAudit: true })).toBe('bkm');
    expect(pickRotationAuditor({ auditors, startIndex: 0, areaPath: '/r/g/kal/', crossAudit: false })).toBe('kal');
  });
  it('returns null when nobody qualifies', () => {
    expect(pickRotationAuditor({ auditors: [auditors[0]], startIndex: 0, areaPath: '/r/g/kal/', crossAudit: true })).toBeNull();
    expect(pickRotationAuditor({ auditors: [], startIndex: 0, areaPath: null, crossAudit: false })).toBeNull();
  });
});

describe('stats helpers', () => {
  const mk = (id: string, areaId: string, date: string, pct: number, sections: [string, number | null][]) => ({
    id, areaId, completedAt: d(date), scorePct: pct, sectionScores: sections.map(([title, scorePct]) => ({ title, scorePct })),
  });
  const areas = [
    { id: 'a1', code: 'A1', name: 'Alan 1', orgUnit: null },
    { id: 'a2', code: 'A2', name: 'Alan 2', orgUnit: null },
    { id: 'a3', code: 'A3', name: 'Alan 3', orgUnit: null },
  ];
  const audits = [
    mk('1', 'a1', '2026-05-01', 60, [['S1', 50], ['S2', 70]]),
    mk('2', 'a1', '2026-06-01', 80, [['S1', 80], ['S2', null]]),
    mk('3', 'a2', '2026-06-01', 90, [['S1', 90]]),
  ];

  it('builds area stats with latest, previous and trend', () => {
    const stats = buildAreaStats(areas, audits);
    expect(stats[0]).toMatchObject({ latestScore: 80, previousScore: 60, average: 70, auditCount: 2 });
    expect(stats[0].trend.map((t) => t.scorePct)).toEqual([60, 80]);
    expect(stats[0].sectionAverages).toEqual([{ title: 'S1', scorePct: 65 }, { title: 'S2', scorePct: 70 }]);
    expect(stats[2].latestScore).toBeNull();
  });

  it('limits trend to the last N', () => {
    const many = Array.from({ length: 9 }, (_, i) => mk(`x${i}`, 'a1', `2026-0${i + 1}-01`, 50 + i, [['S', 50]]));
    expect(buildAreaStats([areas[0]], many)[0].trend).toHaveLength(6);
  });

  it('ranks best and worst, ignoring unscored areas', () => {
    const { best, worst } = rankAreas(buildAreaStats(areas, audits), 1);
    expect(best[0].areaId).toBe('a2');
    expect(worst[0].areaId).toBe('a1');
  });

  it('averages sections', () => {
    expect(sectionAverages(audits)).toEqual([{ title: 'S1', scorePct: 73.3 }, { title: 'S2', scorePct: 70 }]);
  });

  it('counts compliance', () => {
    const today = d('2026-10-06');
    const c = complianceCounts(
      [
        { status: 'COMPLETED', dueDate: d('2026-09-30') },
        { status: 'PLANNED', dueDate: d('2026-09-30') },
        { status: 'IN_PROGRESS', dueDate: d('2026-10-06') },
        { status: 'PLANNED', dueDate: d('2026-10-31') },
        { status: 'CANCELLED', dueDate: d('2026-08-31') },
      ],
      today,
    );
    expect(c).toEqual({ total: 4, completed: 1, planned: 2, overdue: 1, cancelled: 1, completionRate: 25 });
  });

  it('aggregates tags', () => {
    const today = d('2026-10-06');
    const t = tagStats(
      [
        { color: 'RED', category: 'LEAK', status: 'OPEN', dueDate: d('2026-10-01'), createdAt: d('2026-09-25'), closedAt: null },
        { color: 'BLUE', category: 'LEAK', status: 'IN_PROGRESS', dueDate: d('2026-10-20'), createdAt: d('2026-09-25'), closedAt: null },
        { color: 'RED', category: 'DAMAGE', status: 'CLOSED', dueDate: null, createdAt: d('2026-09-01'), closedAt: d('2026-09-05') },
        { color: 'RED', category: 'DAMAGE', status: 'CLOSED', dueDate: null, createdAt: d('2026-09-01'), closedAt: d('2026-09-07') },
      ],
      today,
    );
    expect(t).toMatchObject({ open: 2, overdue: 1, closed: 2, avgClosureDays: 5 });
    expect(t.byColor).toEqual({ RED: 1, BLUE: 1 });
    expect(t.byCategory.LEAK).toBe(2);
  });
});

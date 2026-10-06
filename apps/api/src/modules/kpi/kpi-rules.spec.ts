import { aggregateValues, computeEntryState, computeKpiStatus, deviationRequirements, roundKpiValue, type KpiStatus } from '@lean/shared';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('kpi status rule', () => {
  const hb = (value: number, target: number | null, pct = 5) => computeKpiStatus({ value, target, direction: 'HIGHER_BETTER', tolerancePct: pct });
  const lb = (value: number, target: number | null, pct = 5) => computeKpiStatus({ value, target, direction: 'LOWER_BETTER', tolerancePct: pct });
  const rg = (value: number, min: number, max: number | null, pct = 5) =>
    computeKpiStatus({ value, target: min, targetMax: max, direction: 'RANGE', tolerancePct: pct });

  it('HIGHER_BETTER', () => {
    expect(hb(100, 100)).toBe('GREEN');
    expect(hb(120, 100)).toBe('GREEN');
    expect(hb(95, 100)).toBe('YELLOW'); // tam tolerans sınırı
    expect(hb(97, 100)).toBe('YELLOW');
    expect(hb(94.99, 100)).toBe('RED');
    expect(hb(0, 100)).toBe('RED');
    expect(hb(90, 100, 10)).toBe('YELLOW');
  });

  it('LOWER_BETTER', () => {
    expect(lb(2, 2)).toBe('GREEN');
    expect(lb(1, 2)).toBe('GREEN');
    expect(lb(2.1, 2)).toBe('YELLOW'); // 2 + 0.1 = 2.1 sınırı
    expect(lb(2.11, 2)).toBe('RED');
    expect(lb(0, 0)).toBe('GREEN');
    expect(lb(1, 0)).toBe('RED'); // hedef 0 ise tolerans 0
  });

  it('RANGE', () => {
    expect(rg(50, 40, 60)).toBe('GREEN');
    expect(rg(40, 40, 60)).toBe('GREEN');
    expect(rg(60, 40, 60)).toBe('GREEN');
    expect(rg(39, 40, 60)).toBe('YELLOW');
    expect(rg(38, 40, 60)).toBe('YELLOW');
    expect(rg(37, 40, 60)).toBe('RED');
    expect(rg(62, 40, 60)).toBe('YELLOW');
    expect(rg(63.5, 40, 60)).toBe('RED');
    expect(rg(10, 10, null)).toBe('GREEN'); // targetMax yoksa tek nokta
    expect(rg(11, 10, null)).toBe('RED');
  });

  it('returns NO_TARGET without target or value', () => {
    expect(hb(10, null)).toBe('NO_TARGET');
    expect(computeKpiStatus({ value: null, target: 5, direction: 'HIGHER_BETTER', tolerancePct: 5 })).toBe('NO_TARGET');
    expect(computeKpiStatus({ value: NaN, target: 5, direction: 'HIGHER_BETTER', tolerancePct: 5 })).toBe('NO_TARGET');
  });

  it('handles negative targets by absolute tolerance', () => {
    expect(hb(-10.4, -10)).toBe('YELLOW'); // tolerans 0.5 → -10.5 sınır
    expect(hb(-10.6, -10)).toBe('RED');
  });
});

describe('deviation requirements', () => {
  it('requires an explanation for yellow and explanation plus action for red', () => {
    expect(deviationRequirements('GREEN')).toEqual({ explanation: false, actions: false });
    expect(deviationRequirements('NO_TARGET')).toEqual({ explanation: false, actions: false });
    expect(deviationRequirements('YELLOW')).toEqual({ explanation: true, actions: false });
    expect(deviationRequirements('RED')).toEqual({ explanation: true, actions: true });
  });
});

describe('entry state', () => {
  const due = d('2026-10-05');
  const base = { dueDate: due, today: d('2026-10-06'), actionCount: 0 };
  const withValue = (status: KpiStatus, extra: Partial<Parameters<typeof computeEntryState>[0]> = {}) =>
    computeEntryState({ ...base, hasValue: true, status, ...extra });

  it('is NOT_DUE until the deadline passes and MISSING afterwards', () => {
    expect(computeEntryState({ ...base, hasValue: false, status: null, today: d('2026-10-04') })).toBe('NOT_DUE');
    expect(computeEntryState({ ...base, hasValue: false, status: null, today: d('2026-10-05') })).toBe('NOT_DUE');
    expect(computeEntryState({ ...base, hasValue: false, status: null, today: d('2026-10-06') })).toBe('MISSING');
  });

  it('completes green and no-target values immediately', () => {
    expect(withValue('GREEN')).toBe('COMPLETE');
    expect(withValue('NO_TARGET')).toBe('COMPLETE');
  });

  it('requires an explanation for yellow values', () => {
    expect(withValue('YELLOW')).toBe('DEVIATION_REQUIRED');
    expect(withValue('YELLOW', { deviation: { approvalStatus: 'PENDING', explanation: '  ' } })).toBe('DEVIATION_REQUIRED');
    expect(withValue('YELLOW', { deviation: { approvalStatus: 'PENDING', explanation: 'Plansız duruş' } })).toBe('PENDING_APPROVAL');
    expect(withValue('YELLOW', { deviation: { approvalStatus: 'APPROVED', explanation: 'Plansız duruş' } })).toBe('COMPLETE');
  });

  it('requires an explanation and an action for red values', () => {
    const pending = { approvalStatus: 'PENDING' as const, explanation: 'Hammadde kalitesi' };
    expect(withValue('RED')).toBe('DEVIATION_REQUIRED');
    expect(withValue('RED', { deviation: pending })).toBe('DEVIATION_REQUIRED');
    expect(withValue('RED', { deviation: pending, actionCount: 1 })).toBe('PENDING_APPROVAL');
    expect(withValue('RED', { deviation: { ...pending, approvalStatus: 'APPROVED' }, actionCount: 2 })).toBe('COMPLETE');
    expect(withValue('RED', { deviation: { ...pending, approvalStatus: 'APPROVED' }, actionCount: 0 })).toBe('DEVIATION_REQUIRED');
  });

  it('treats a rejected explanation as required again', () => {
    const rejected = { approvalStatus: 'REJECTED' as const, explanation: 'Yetersiz' };
    expect(withValue('YELLOW', { deviation: rejected })).toBe('DEVIATION_REQUIRED');
    expect(withValue('RED', { deviation: rejected, actionCount: 3 })).toBe('DEVIATION_REQUIRED');
  });
});

describe('aggregation helpers', () => {
  it('aggregates by rule', () => {
    const v = [10, 20, 60];
    expect(aggregateValues(v, 'SUM')).toBe(90);
    expect(aggregateValues(v, 'AVERAGE')).toBe(30);
    expect(aggregateValues(v, 'LAST')).toBe(60);
    expect(aggregateValues(v, 'MIN')).toBe(10);
    expect(aggregateValues(v, 'MAX')).toBe(60);
    expect(aggregateValues([], 'SUM')).toBeNull();
  });

  it('rounds to the decimals', () => {
    expect(roundKpiValue(1.23456, 2)).toBe(1.23);
    expect(roundKpiValue(1.005, 2)).toBe(1.01);
    expect(roundKpiValue(5.5, 0)).toBe(6);
  });
});

import {
  bowlingStatus, catchballTransition, childLevelOptions, computeGoalAchievement, computePaceAchievement, isValidCorrelation, monthOfPeriod, nextGoalCode,
  rollUpAchievement, statusFromAchievement, validateGoalParent, ytdOf,
} from '@lean/shared';

describe('computeGoalAchievement', () => {
  it('HIGHER_BETTER uses (actual-baseline)/(target-baseline)', () => {
    expect(computeGoalAchievement({ baseline: 70, target: 90, actual: 80, direction: 'HIGHER_BETTER' })).toBe(50);
    expect(computeGoalAchievement({ baseline: 70, target: 90, actual: 90, direction: 'HIGHER_BETTER' })).toBe(100);
  });
  it('LOWER_BETTER is mirrored', () => {
    expect(computeGoalAchievement({ baseline: 100, target: 50, actual: 75, direction: 'LOWER_BETTER' })).toBe(50);
    expect(computeGoalAchievement({ baseline: 100, target: 50, actual: 50, direction: 'LOWER_BETTER' })).toBe(100);
  });
  it('clamps to 0..150', () => {
    expect(computeGoalAchievement({ baseline: 70, target: 90, actual: 60, direction: 'HIGHER_BETTER' })).toBe(0);
    expect(computeGoalAchievement({ baseline: 70, target: 90, actual: 200, direction: 'HIGHER_BETTER' })).toBe(150);
    expect(computeGoalAchievement({ baseline: 100, target: 50, actual: 120, direction: 'LOWER_BETTER' })).toBe(0);
    expect(computeGoalAchievement({ baseline: 100, target: 50, actual: 0, direction: 'LOWER_BETTER' })).toBe(150);
  });
  it('handles missing baseline', () => {
    expect(computeGoalAchievement({ baseline: null, target: 80, actual: 60, direction: 'HIGHER_BETTER' })).toBe(75);
    expect(computeGoalAchievement({ baseline: null, target: 50, actual: 100, direction: 'LOWER_BETTER' })).toBe(50);
    expect(computeGoalAchievement({ baseline: undefined, target: 50, actual: 25, direction: 'LOWER_BETTER' })).toBe(150);
  });
  it('returns null without target/actual and handles target==baseline', () => {
    expect(computeGoalAchievement({ baseline: 1, target: null, actual: 5, direction: 'HIGHER_BETTER' })).toBeNull();
    expect(computeGoalAchievement({ baseline: 1, target: 5, actual: null, direction: 'HIGHER_BETTER' })).toBeNull();
    expect(computeGoalAchievement({ baseline: 5, target: 5, actual: 5, direction: 'HIGHER_BETTER' })).toBe(100);
    expect(computeGoalAchievement({ baseline: 5, target: 5, actual: 4, direction: 'HIGHER_BETTER' })).toBe(0);
  });
});

describe('computePaceAchievement', () => {
  it('prorates cumulative (SUM) goals by YTD plan or months', () => {
    // yıllık hedef 1200, 3 ay sonunda YTD plan 300, gerçekleşen 330 → %110
    expect(computePaceAchievement({ baseline: 0, target: 1200, actual: 330, direction: 'HIGHER_BETTER', aggregation: 'SUM', monthsElapsed: 3, ytdPlan: 300 })).toBe(110);
    expect(computePaceAchievement({ baseline: 0, target: 1200, actual: 300, direction: 'HIGHER_BETTER', aggregation: 'SUM', monthsElapsed: 3 })).toBe(100);
  });
  it('does not prorate non-cumulative goals', () => {
    expect(computePaceAchievement({ baseline: 70, target: 90, actual: 80, direction: 'HIGHER_BETTER', aggregation: 'AVERAGE', monthsElapsed: 3 })).toBe(50);
  });
});

describe('rollUpAchievement', () => {
  it('is a weighted average ignoring unmeasured children', () => {
    expect(rollUpAchievement([{ achievement: 100, weight: 1 }, { achievement: 50, weight: 3 }])).toBe(62.5);
    expect(rollUpAchievement([{ achievement: 80, weight: 2 }, { achievement: null, weight: 5 }])).toBe(80);
    expect(rollUpAchievement([{ achievement: null, weight: 1 }])).toBeNull();
    expect(rollUpAchievement([])).toBeNull();
  });
  it('maps achievement to colors', () => {
    expect(statusFromAchievement(100)).toBe('GREEN');
    expect(statusFromAchievement(96)).toBe('YELLOW');
    expect(statusFromAchievement(60)).toBe('RED');
    expect(statusFromAchievement(null)).toBe('NO_DATA');
  });
});

describe('level / parent validation', () => {
  it('accepts the level above and rejects others', () => {
    expect(validateGoalParent('ANNUAL', 'BREAKTHROUGH').ok).toBe(true);
    expect(validateGoalParent('PRIORITY', 'ANNUAL').ok).toBe(true);
    expect(validateGoalParent('DEPARTMENT', 'PRIORITY').ok).toBe(true);
    expect(validateGoalParent('DEPARTMENT', 'ANNUAL').ok).toBe(true);
    expect(validateGoalParent('INDIVIDUAL', 'DEPARTMENT').ok).toBe(true);
    expect(validateGoalParent('PRIORITY', 'BREAKTHROUGH')).toMatchObject({ ok: false, code: 'INVALID_PARENT_LEVEL' });
    expect(validateGoalParent('INDIVIDUAL', 'ANNUAL')).toMatchObject({ ok: false, code: 'INVALID_PARENT_LEVEL' });
    expect(validateGoalParent('BREAKTHROUGH', 'ANNUAL')).toMatchObject({ ok: false, code: 'INVALID_PARENT_LEVEL' });
  });
  it('requires a parent for priority/department/individual only', () => {
    expect(validateGoalParent('BREAKTHROUGH', null).ok).toBe(true);
    expect(validateGoalParent('ANNUAL', null).ok).toBe(true);
    expect(validateGoalParent('DEPARTMENT', null)).toMatchObject({ ok: false, code: 'PARENT_REQUIRED' });
  });
  it('derives child levels and codes', () => {
    expect(childLevelOptions('BREAKTHROUGH')).toEqual(['ANNUAL']);
    expect(childLevelOptions('ANNUAL')).toEqual(['PRIORITY', 'DEPARTMENT']);
    expect(childLevelOptions(null)).toEqual(['BREAKTHROUGH', 'ANNUAL']);
    expect(nextGoalCode('ANNUAL', ['YH1', 'YH3', 'AH7'])).toBe('YH4');
    expect(nextGoalCode('BREAKTHROUGH', [])).toBe('AH1');
  });
  it('validates x-matrix correlations', () => {
    expect(isValidCorrelation('ANNUAL', 'GOAL', 'BREAKTHROUGH')).toBe(true);
    expect(isValidCorrelation('PRIORITY', 'GOAL', 'ANNUAL')).toBe(true);
    expect(isValidCorrelation('PRIORITY', 'GOAL', 'BREAKTHROUGH')).toBe(false);
    expect(isValidCorrelation('PRIORITY', 'USER')).toBe(true);
    expect(isValidCorrelation('DEPARTMENT', 'KPI')).toBe(false);
  });
});

describe('catchball state machine', () => {
  const offer = (side: 'PARENT' | 'CHILD', t: number | null, type: 'PROPOSAL' | 'COUNTER_PROPOSAL' = 'PROPOSAL') => ({ type, side, proposedTarget: t });

  it('starts only with a parent proposal', () => {
    expect(catchballTransition('DRAFT', [], { type: 'PROPOSAL', side: 'PARENT', proposedTarget: 90 })).toMatchObject({ ok: true, status: 'PROPOSED' });
    expect(catchballTransition('DRAFT', [], { type: 'PROPOSAL', side: 'CHILD' })).toMatchObject({ ok: false, code: 'CATCHBALL_NOT_ALLOWED' });
    expect(catchballTransition('DRAFT', [], { type: 'COMMENT', side: 'CHILD', message: 'x' })).toMatchObject({ ok: false, code: 'CATCHBALL_NOT_STARTED' });
  });
  it('counter proposal moves to IN_CATCHBALL; cannot counter own offer', () => {
    const h = [offer('PARENT', 90)];
    expect(catchballTransition('PROPOSED', h, { type: 'COUNTER_PROPOSAL', side: 'CHILD', proposedTarget: 85 })).toMatchObject({ ok: true, status: 'IN_CATCHBALL' });
    expect(catchballTransition('PROPOSED', h, { type: 'COUNTER_PROPOSAL', side: 'PARENT', proposedTarget: 85 })).toMatchObject({ ok: false });
  });
  it('agreement needs the other side\'s latest offer and takes its target', () => {
    const h = [offer('PARENT', 90), offer('CHILD', 85, 'COUNTER_PROPOSAL')];
    expect(catchballTransition('IN_CATCHBALL', h, { type: 'AGREEMENT', side: 'PARENT' })).toEqual({ ok: true, status: 'AGREED', agreed: true, agreedTarget: 85 });
    expect(catchballTransition('IN_CATCHBALL', h, { type: 'AGREEMENT', side: 'CHILD' })).toMatchObject({ ok: false, code: 'CATCHBALL_NOT_ALLOWED' });
    expect(catchballTransition('PROPOSED', [offer('PARENT', 90)], { type: 'AGREEMENT', side: 'CHILD' })).toMatchObject({ ok: true, status: 'AGREED', agreedTarget: 90 });
  });
  it('carries the previous target when an offer has none', () => {
    const h = [offer('PARENT', 90), offer('CHILD', null, 'COUNTER_PROPOSAL')];
    expect(catchballTransition('IN_CATCHBALL', h, { type: 'AGREEMENT', side: 'PARENT' })).toMatchObject({ agreedTarget: 90 });
  });
  it('comment keeps status, rejection returns to draft, closed states reject entries', () => {
    expect(catchballTransition('IN_CATCHBALL', [offer('PARENT', 1)], { type: 'COMMENT', side: 'CHILD', message: 'ok?' })).toMatchObject({ ok: true, status: 'IN_CATCHBALL' });
    expect(catchballTransition('PROPOSED', [offer('PARENT', 1)], { type: 'REJECTION', side: 'CHILD', message: 'no' })).toMatchObject({ ok: true, status: 'DRAFT' });
    expect(catchballTransition('PROPOSED', [offer('PARENT', 1)], { type: 'REJECTION', side: 'CHILD' })).toMatchObject({ ok: false, code: 'MESSAGE_REQUIRED' });
    expect(catchballTransition('AGREED', [], { type: 'COMMENT', side: 'CHILD', message: 'x' })).toMatchObject({ ok: false, code: 'CATCHBALL_CLOSED' });
    expect(catchballTransition('ACTIVE', [], { type: 'PROPOSAL', side: 'PARENT' })).toMatchObject({ ok: false, code: 'CATCHBALL_CLOSED' });
  });
});

describe('bowling month status', () => {
  it('uses the shared KPI rule with default 5% tolerance', () => {
    expect(bowlingStatus({ plan: 100, actual: 100, direction: 'HIGHER_BETTER' })).toBe('GREEN');
    expect(bowlingStatus({ plan: 100, actual: 96, direction: 'HIGHER_BETTER' })).toBe('YELLOW');
    expect(bowlingStatus({ plan: 100, actual: 90, direction: 'HIGHER_BETTER' })).toBe('RED');
    expect(bowlingStatus({ plan: 100, actual: 104, direction: 'LOWER_BETTER' })).toBe('YELLOW');
    expect(bowlingStatus({ plan: 100, actual: 120, direction: 'LOWER_BETTER' })).toBe('RED');
    expect(bowlingStatus({ plan: 100, actual: 90, direction: 'HIGHER_BETTER', tolerancePct: 15 })).toBe('YELLOW');
  });
  it('maps missing data to NO_DATA', () => {
    expect(bowlingStatus({ plan: null, actual: 5, direction: 'HIGHER_BETTER' })).toBe('NO_DATA');
    expect(bowlingStatus({ plan: 5, actual: null, direction: 'HIGHER_BETTER' })).toBe('NO_DATA');
  });
  it('maps periods to months and computes YTD', () => {
    expect(monthOfPeriod('2026-05', 2026)).toBe(5);
    expect(monthOfPeriod('2026-Q1', 2026)).toBe(3);
    expect(monthOfPeriod('2026', 2026)).toBe(12);
    expect(monthOfPeriod('2025-12', 2026)).toBeNull();
    const cells = [{ plan: 10, actual: 12 }, { plan: 10, actual: 8 }, { plan: 10, actual: null }];
    expect(ytdOf(cells, 'SUM')).toEqual({ plan: 20, actual: 20, months: 2 });
    expect(ytdOf(cells, 'AVERAGE')).toEqual({ plan: 10, actual: 10, months: 2 });
  });
});

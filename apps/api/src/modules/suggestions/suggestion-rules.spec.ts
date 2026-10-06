import {
  DEFAULT_CRITERIA, DEFAULT_POINT_RULES, DEFAULT_REWARD_TIERS, acceptancePoints, averageScore, canFastTrack, canTransition, nextTier, tierFor,
  validateScores, weightedScore, SUGGESTION_STATUSES,
} from '@lean/shared';
import { avgDays, isoWeekKey, participationPct, pct, perEmployee } from './suggestion-rules';

describe('weightedScore', () => {
  it('returns 100 for max scores and 0 for zeros', () => {
    const max = Object.fromEntries(DEFAULT_CRITERIA.map((c) => [c.key, c.max]));
    const zero = Object.fromEntries(DEFAULT_CRITERIA.map((c) => [c.key, 0]));
    expect(weightedScore(DEFAULT_CRITERIA, max)).toBe(100);
    expect(weightedScore(DEFAULT_CRITERIA, zero)).toBe(0);
  });

  it('applies weights', () => {
    // benefit 5/5 (30) + feasibility 0 + others 0 => 30
    expect(weightedScore(DEFAULT_CRITERIA, { benefit: 5, feasibility: 0, costEffectiveness: 0, creativity: 0, scope: 0 })).toBe(30);
    // all 4/5 => 80
    expect(weightedScore(DEFAULT_CRITERIA, { benefit: 4, feasibility: 4, costEffectiveness: 4, creativity: 4, scope: 4 })).toBe(80);
  });

  it('normalizes weights that do not sum to 100', () => {
    const c = [{ key: 'a', label: 'A', weight: 1, max: 10 }, { key: 'b', label: 'B', weight: 3, max: 10 }];
    expect(weightedScore(c, { a: 10, b: 0 })).toBe(25);
  });

  it('validates scores', () => {
    expect(validateScores(DEFAULT_CRITERIA, { benefit: 6 })).toHaveLength(5);
    const ok = Object.fromEntries(DEFAULT_CRITERIA.map((c) => [c.key, 3]));
    expect(validateScores(DEFAULT_CRITERIA, ok)).toEqual([]);
    expect(averageScore([80, 60])).toBe(70);
    expect(averageScore([])).toBeNull();
  });
});

describe('points and tiers', () => {
  it('picks the acceptance band by score', () => {
    expect(acceptancePoints(DEFAULT_POINT_RULES, 85)).toBe(50);
    expect(acceptancePoints(DEFAULT_POINT_RULES, 80)).toBe(50);
    expect(acceptancePoints(DEFAULT_POINT_RULES, 65)).toBe(30);
    expect(acceptancePoints(DEFAULT_POINT_RULES, 10)).toBe(15);
    expect(acceptancePoints(DEFAULT_POINT_RULES, null)).toBe(15);
  });

  it('computes tiers and next tier', () => {
    expect(tierFor(DEFAULT_REWARD_TIERS, 10)).toBeNull();
    expect(tierFor(DEFAULT_REWARD_TIERS, 50)?.name).toBe('Bronz');
    expect(tierFor(DEFAULT_REWARD_TIERS, 299)?.name).toBe('Gümüş');
    expect(tierFor(DEFAULT_REWARD_TIERS, 1000)?.name).toBe('Altın');
    expect(nextTier(DEFAULT_REWARD_TIERS, 60)).toEqual({ tier: { name: 'Gümüş', minPoints: 150 }, remaining: 90 });
    expect(nextTier(DEFAULT_REWARD_TIERS, 400)).toBeNull();
  });

  it('fast-track needs threshold, score and cost limit', () => {
    const s = { autoAcceptMinScore: 75, autoAcceptMaxCost: 5000 };
    expect(canFastTrack(s, 80, 1000)).toBe(true);
    expect(canFastTrack(s, 70, 1000)).toBe(false);
    expect(canFastTrack(s, 80, 6000)).toBe(false);
    expect(canFastTrack(s, 80, null)).toBe(true);
    expect(canFastTrack({ autoAcceptMinScore: null, autoAcceptMaxCost: null }, 99, 0)).toBe(false);
    expect(canFastTrack({ autoAcceptMinScore: 75, autoAcceptMaxCost: null }, 80, 1e9)).toBe(true);
  });
});

describe('status transition guard', () => {
  it('allows the main flow', () => {
    expect(canTransition('SUBMITTED', 'PRE_EVALUATION')).toBe(true);
    expect(canTransition('PRE_EVALUATION', 'COMMITTEE')).toBe(true);
    expect(canTransition('COMMITTEE', 'ACCEPTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'IN_IMPLEMENTATION')).toBe(true);
    expect(canTransition('IN_IMPLEMENTATION', 'IMPLEMENTED')).toBe(true);
    expect(canTransition('IMPLEMENTED', 'CLOSED')).toBe(true);
    expect(canTransition('COMMITTEE', 'ON_HOLD')).toBe(true);
  });

  it('blocks skipping and terminal states', () => {
    expect(canTransition('COMMITTEE', 'IMPLEMENTED')).toBe(false);
    expect(canTransition('ACCEPTED', 'CLOSED')).toBe(false);
    expect(canTransition('ACCEPTED', 'WITHDRAWN')).toBe(false);
    for (const s of ['REJECTED', 'CLOSED', 'WITHDRAWN'] as const) {
      for (const to of SUGGESTION_STATUSES) expect(canTransition(s, to)).toBe(false);
    }
  });
});

describe('stats helpers', () => {
  it('computes participation and per-employee', () => {
    expect(participationPct(3, 12)).toBe(25);
    expect(participationPct(0, 0)).toBeNull();
    expect(participationPct(5, 4)).toBe(100);
    expect(perEmployee(9, 4)).toBe(2.25);
    expect(perEmployee(1, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33.3);
  });

  it('averages day differences', () => {
    const d = (s: string) => new Date(s);
    expect(avgDays([{ from: d('2026-01-01'), to: d('2026-01-03') }, { from: d('2026-01-01'), to: d('2026-01-05') }, { from: d('2026-01-01'), to: null }])).toBe(3);
    expect(avgDays([])).toBeNull();
  });

  it('builds ISO week keys', () => {
    expect(isoWeekKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01');
    expect(isoWeekKey(new Date('2026-10-06T00:00:00Z'))).toBe('2026-W41');
  });
});

import {
  addPeriods, coercePeriodInput, currentPeriod, detectFrequency, firstPeriodOfYear, isoWeeksInYear, isValidPeriod, lastEndedPeriod,
  lastPeriodEndingOnOrBefore, nextPeriod, parsePeriod, periodDueDate, periodEnd, periodLabel, periodsBetween, periodsOfYear, periodStart,
  prevPeriod, previousYearPeriod, recentPeriods,
} from '@lean/shared';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('kpi periods', () => {
  it('computes the period containing a date for every frequency', () => {
    const date = d('2026-10-06');
    expect(currentPeriod('DAILY', date)).toBe('2026-10-06');
    expect(currentPeriod('WEEKLY', date)).toBe('2026-W41');
    expect(currentPeriod('MONTHLY', date)).toBe('2026-10');
    expect(currentPeriod('QUARTERLY', date)).toBe('2026-Q4');
    expect(currentPeriod('YEARLY', date)).toBe('2026');
  });

  it('handles ISO week-year boundaries', () => {
    expect(currentPeriod('WEEKLY', d('2021-01-01'))).toBe('2020-W53');
    expect(currentPeriod('WEEKLY', d('2024-12-30'))).toBe('2025-W01');
    expect(currentPeriod('WEEKLY', d('2026-01-01'))).toBe('2026-W01');
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(iso(periodStart('2020-W53'))).toBe('2020-12-28');
    expect(iso(periodEnd('2020-W53'))).toBe('2021-01-03');
    expect(iso(periodStart('2025-W01'))).toBe('2024-12-30');
  });

  it('returns UTC start and inclusive end dates', () => {
    expect(iso(periodStart('2026-10'))).toBe('2026-10-01');
    expect(iso(periodEnd('2026-10'))).toBe('2026-10-31');
    expect(iso(periodEnd('2028-02'))).toBe('2028-02-29');
    expect(iso(periodEnd('2027-02'))).toBe('2027-02-28');
    expect(iso(periodStart('2026-Q4'))).toBe('2026-10-01');
    expect(iso(periodEnd('2026-Q4'))).toBe('2026-12-31');
    expect(iso(periodEnd('2026-Q1'))).toBe('2026-03-31');
    expect(iso(periodStart('2026'))).toBe('2026-01-01');
    expect(iso(periodEnd('2026'))).toBe('2026-12-31');
    expect(iso(periodStart('2026-10-06'))).toBe('2026-10-06');
    expect(iso(periodEnd('2026-10-06'))).toBe('2026-10-06');
    expect(iso(periodStart('2026-W41'))).toBe('2026-10-05');
    expect(iso(periodEnd('2026-W41'))).toBe('2026-10-11');
  });

  it('adds the entry due days to the period end', () => {
    expect(iso(periodDueDate('2026-09', 5))).toBe('2026-10-05');
    expect(iso(periodDueDate('2026-09', 0))).toBe('2026-09-30');
    expect(iso(periodDueDate('2026-12', 5))).toBe('2027-01-05');
  });

  it('moves to next and previous periods across year boundaries', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01');
    expect(prevPeriod('2026-01')).toBe('2025-12');
    expect(nextPeriod('2026-Q4')).toBe('2027-Q1');
    expect(prevPeriod('2026-Q1')).toBe('2025-Q4');
    expect(nextPeriod('2026-12-31')).toBe('2027-01-01');
    expect(prevPeriod('2026-03-01')).toBe('2026-02-28');
    expect(nextPeriod('2020-W53')).toBe('2021-W01');
    expect(prevPeriod('2021-W01')).toBe('2020-W53');
    expect(nextPeriod('2026')).toBe('2027');
    expect(addPeriods('2026-10', -13)).toBe('2025-09');
    expect(addPeriods('2026-10', 15)).toBe('2028-01');
  });

  it('lists periods between two keys inclusively', () => {
    expect(periodsBetween('MONTHLY', '2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(periodsBetween('MONTHLY', '2026-03', '2026-02')).toEqual([]);
    expect(periodsBetween('QUARTERLY', '2026-Q3', '2026-Q4')).toEqual(['2026-Q3', '2026-Q4']);
    expect(periodsBetween('DAILY', '2026-02-27', '2026-03-02')).toHaveLength(4);
    expect(periodsOfYear('MONTHLY', 2026)).toHaveLength(12);
    expect(periodsOfYear('WEEKLY', 2026)).toHaveLength(53);
    expect(periodsOfYear('QUARTERLY', 2026)).toHaveLength(4);
    expect(periodsOfYear('DAILY', 2028)).toHaveLength(366);
    expect(() => periodsBetween('MONTHLY', '2026-W01', '2026-02')).toThrow();
    expect(recentPeriods('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('finds the last ended period', () => {
    expect(lastEndedPeriod('MONTHLY', d('2026-10-06'))).toBe('2026-09');
    expect(lastEndedPeriod('MONTHLY', d('2026-10-01'))).toBe('2026-09');
    expect(lastEndedPeriod('DAILY', d('2026-10-06'))).toBe('2026-10-05');
    expect(lastEndedPeriod('QUARTERLY', d('2026-10-06'))).toBe('2026-Q3');
    expect(lastEndedPeriod('YEARLY', d('2026-01-01'))).toBe('2025');
    expect(lastPeriodEndingOnOrBefore('MONTHLY', d('2026-09-30'))).toBe('2026-09');
    expect(lastPeriodEndingOnOrBefore('MONTHLY', d('2026-10-15'))).toBe('2026-09');
    expect(lastPeriodEndingOnOrBefore('WEEKLY', d('2026-09-30'))).toBe('2026-W39');
    expect(lastPeriodEndingOnOrBefore('YEARLY', d('2026-12-31'))).toBe('2026');
  });

  it('validates and detects keys', () => {
    expect(detectFrequency('2026-10-06')).toBe('DAILY');
    expect(detectFrequency('2026-W41')).toBe('WEEKLY');
    expect(detectFrequency('2026-10')).toBe('MONTHLY');
    expect(detectFrequency('2026-Q4')).toBe('QUARTERLY');
    expect(detectFrequency('2026')).toBe('YEARLY');
    expect(detectFrequency('2026-13')).toBeNull();
    expect(detectFrequency('2026-02-30')).toBeNull();
    expect(detectFrequency('2025-W53')).toBeNull();
    expect(detectFrequency('2026-Q5')).toBeNull();
    expect(detectFrequency('abc')).toBeNull();
    expect(isValidPeriod('2026-10', 'MONTHLY')).toBe(true);
    expect(isValidPeriod('2026-10', 'DAILY')).toBe(false);
    expect(parsePeriod('2026-Q3')).toEqual({ frequency: 'QUARTERLY', year: 2026, quarter: 3 });
  });

  it('maps to the previous year period', () => {
    expect(previousYearPeriod('2026-10')).toBe('2025-10');
    expect(previousYearPeriod('2026-Q2')).toBe('2025-Q2');
    expect(previousYearPeriod('2026-W53')).toBe('2025-W52');
    expect(previousYearPeriod('2028-02-29')).toBe('2027-02-28');
    expect(previousYearPeriod('2026')).toBe('2025');
    expect(firstPeriodOfYear('WEEKLY', 2026)).toBe('2026-W01');
  });

  it('labels periods in both locales', () => {
    expect(periodLabel('2026-10', 'tr')).toBe('Eki 2026');
    expect(periodLabel('2026-10', 'en')).toBe('Oct 2026');
    expect(periodLabel('2026-Q4', 'tr')).toBe('2026-Ç4');
    expect(periodLabel('2026-Q4', 'en')).toBe('2026-Q4');
    expect(periodLabel('2026-W41', 'tr')).toBe('Hf 41');
    expect(periodLabel('2026-W41', 'en')).toBe('Wk 41');
    expect(periodLabel('2026-10-06', 'tr')).toBe('06.10.2026');
    expect(periodLabel('2026-10-06', 'en')).toBe('06 Oct 2026');
    expect(periodLabel('2026')).toBe('2026');
    expect(periodLabel('garbage')).toBe('garbage');
  });

  it('coerces spreadsheet inputs to the KPI frequency', () => {
    expect(coercePeriodInput('2026-10', 'MONTHLY')).toBe('2026-10');
    expect(coercePeriodInput('01.10.2026', 'MONTHLY')).toBe('2026-10');
    expect(coercePeriodInput('15/10/2026', 'MONTHLY')).toBe('2026-10');
    expect(coercePeriodInput('2026-10-01T00:00:00.000Z', 'MONTHLY')).toBe('2026-10');
    expect(coercePeriodInput('2026-10-01T00:00:00.000Z', 'QUARTERLY')).toBe('2026-Q4');
    expect(coercePeriodInput('2026-10-01T00:00:00.000Z', 'WEEKLY')).toBe('2026-W40');
    expect(coercePeriodInput('2026-10-01', 'MONTHLY')).toBe('2026-10');
    expect(coercePeriodInput('10.2026', 'MONTHLY')).toBe('2026-10');
    expect(coercePeriodInput('2026-q4', 'QUARTERLY')).toBe('2026-Q4');
    expect(coercePeriodInput('2026-w5', 'WEEKLY')).toBe('2026-W05');
    expect(coercePeriodInput(2026, 'YEARLY')).toBe('2026');
    expect(coercePeriodInput(2026, 'MONTHLY')).toBeNull();
    expect(coercePeriodInput(46296, 'MONTHLY')).toBe('2026-10'); // Excel seri no: 2026-10-01
    expect(coercePeriodInput(new Date(Date.UTC(2026, 9, 1)), 'MONTHLY')).toBe('2026-10');
    expect(coercePeriodInput('2026-10', 'DAILY')).toBeNull();
    expect(coercePeriodInput('2026', 'MONTHLY')).toBeNull();
    expect(coercePeriodInput('31.02.2026', 'MONTHLY')).toBeNull();
    expect(coercePeriodInput('nonsense', 'MONTHLY')).toBeNull();
    expect(coercePeriodInput('', 'MONTHLY')).toBeNull();
    expect(coercePeriodInput(null, 'MONTHLY')).toBeNull();
  });
});

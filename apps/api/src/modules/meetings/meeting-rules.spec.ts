import {
  attendanceRate, buildIcs, formatDateTimeTr, generateOccurrenceDates, generateOccurrences, meetingCode, zonedDayRange, zonedTimeToUtc,
} from './meeting-rules';

describe('meeting rules', () => {
  it('formats meeting codes', () => {
    expect(meetingCode(12)).toBe('TOP-00012');
  });

  describe('timezone conversion', () => {
    it('converts Europe/Istanbul wall-clock to UTC (+03:00)', () => {
      expect(zonedTimeToUtc('2026-10-06', '09:30', 'Europe/Istanbul').toISOString()).toBe('2026-10-06T06:30:00.000Z');
      expect(zonedTimeToUtc('2026-01-15', '00:00', 'Europe/Istanbul').toISOString()).toBe('2026-01-14T21:00:00.000Z');
    });

    it('generalizes to zones with DST', () => {
      // Berlin: kış +01:00, yaz +02:00
      expect(zonedTimeToUtc('2026-01-15', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-01-15T08:00:00.000Z');
      expect(zonedTimeToUtc('2026-07-15', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-07-15T07:00:00.000Z');
      // DST sonrası ilk gün (2026-03-29 Berlin)
      expect(zonedTimeToUtc('2026-03-29', '10:00', 'Europe/Berlin').toISOString()).toBe('2026-03-29T08:00:00.000Z');
    });

    it('computes local day range and display strings', () => {
      const { start, end } = zonedDayRange(new Date('2026-10-06T22:30:00Z'), 'Europe/Istanbul'); // yerel: 07.10 01:30
      expect(start.toISOString()).toBe('2026-10-06T21:00:00.000Z');
      expect(end.toISOString()).toBe('2026-10-07T21:00:00.000Z');
      expect(formatDateTimeTr(new Date('2026-10-06T06:30:00Z'), 'Europe/Istanbul')).toBe('06.10.2026 09:30');
    });
  });

  describe('recurrence', () => {
    it('weekly with weekdays picks only those days', () => {
      const dates = generateOccurrenceDates({ firstDate: '2026-10-05', untilDate: '2026-10-25', frequency: 'WEEKLY', weekdays: [1, 3] });
      expect(dates).toEqual(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21']);
    });

    it('weekly defaults to the weekday of the first date', () => {
      const dates = generateOccurrenceDates({ firstDate: '2026-10-07', untilDate: '2026-10-28', frequency: 'WEEKLY' });
      expect(dates).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
    });

    it('biweekly takes every other week', () => {
      const dates = generateOccurrenceDates({ firstDate: '2026-10-06', untilDate: '2026-11-30', frequency: 'BIWEEKLY' });
      expect(dates).toEqual(['2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17']);
    });

    it('daily can skip weekends', () => {
      const all = generateOccurrenceDates({ firstDate: '2026-10-05', untilDate: '2026-10-11', frequency: 'DAILY' });
      const weekdays = generateOccurrenceDates({ firstDate: '2026-10-05', untilDate: '2026-10-11', frequency: 'DAILY', skipWeekends: true });
      expect(all).toHaveLength(7);
      expect(weekdays).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    });

    it('monthly on day 31 clamps to shorter months', () => {
      const dates = generateOccurrenceDates({ firstDate: '2026-01-31', untilDate: '2026-06-30', frequency: 'MONTHLY' });
      expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
    });

    it('monthly handles leap years and year rollover', () => {
      const dates = generateOccurrenceDates({ firstDate: '2027-11-30', untilDate: '2028-03-31', frequency: 'MONTHLY' });
      expect(dates).toEqual(['2027-11-30', '2027-12-30', '2028-01-30', '2028-02-29', '2028-03-30']);
    });

    it('quarterly steps three months', () => {
      const dates = generateOccurrenceDates({ firstDate: '2026-01-15', untilDate: '2026-12-31', frequency: 'QUARTERLY' });
      expect(dates).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
    });

    it('returns nothing when until precedes first and respects limit', () => {
      expect(generateOccurrenceDates({ firstDate: '2026-10-05', untilDate: '2026-10-01', frequency: 'DAILY' })).toEqual([]);
      expect(generateOccurrenceDates({ firstDate: '2026-01-01', untilDate: '2036-01-01', frequency: 'DAILY' }, 10)).toHaveLength(11);
    });

    it('converts occurrences to UTC instants', () => {
      const occ = generateOccurrences({ firstDate: '2026-10-05', untilDate: '2026-10-12', time: '08:15', frequency: 'WEEKLY', timeZone: 'Europe/Istanbul' });
      expect(occ.map((d) => d.toISOString())).toEqual(['2026-10-05T05:15:00.000Z', '2026-10-12T05:15:00.000Z']);
    });
  });

  describe('attendance rate', () => {
    it('counts present and late over non-excused, recorded participants', () => {
      expect(attendanceRate([
        { attendance: 'PRESENT' }, { attendance: 'LATE' }, { attendance: 'ABSENT' }, { attendance: 'EXCUSED' },
      ])).toBe(66.7);
    });
    it('is null when nobody counts', () => {
      expect(attendanceRate([])).toBeNull();
      expect(attendanceRate([{ attendance: 'EXCUSED' }, { attendance: 'UNKNOWN' }])).toBeNull();
    });
  });

  it('builds a valid ics document', () => {
    const ics = buildIcs({
      uid: 'abc', title: 'Haftalık; Üretim, Toplantısı', startAt: new Date('2026-10-06T06:30:00Z'), endAt: new Date('2026-10-06T07:30:00Z'),
      location: 'Toplantı Odası 1', now: new Date('2026-10-01T00:00:00Z'),
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261006T063000Z');
    expect(ics).toContain('SUMMARY:Haftalık\\; Üretim\\, Toplantısı');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

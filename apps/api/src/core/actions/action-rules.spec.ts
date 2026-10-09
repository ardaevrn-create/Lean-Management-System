import { overdueInfo, TRANSITIONS } from './action-rules';

describe('action rules', () => {
  const today = new Date(Date.UTC(2026, 9, 10));

  it('marks active actions past due date as overdue', () => {
    expect(overdueInfo('OPEN', new Date(Date.UTC(2026, 9, 7)), today)).toEqual({ isOverdue: true, overdueDays: 3 });
    expect(overdueInfo('IN_PROGRESS', new Date(Date.UTC(2026, 9, 9)), today)).toEqual({ isOverdue: true, overdueDays: 1 });
  });

  it('does not mark due-today or completed actions as overdue', () => {
    expect(overdueInfo('OPEN', today, today).isOverdue).toBe(false);
    expect(overdueInfo('DONE', new Date(Date.UTC(2026, 0, 1)), today).isOverdue).toBe(false);
    expect(overdueInfo('VERIFIED', new Date(Date.UTC(2026, 0, 1)), today).isOverdue).toBe(false);
  });

  it('requires verify right to close or reject a done action', () => {
    expect(TRANSITIONS.DONE.VERIFIED).toBe('verify');
    expect(TRANSITIONS.DONE.IN_PROGRESS).toBe('verify');
    expect(TRANSITIONS.VERIFIED).toEqual({});
  });
});

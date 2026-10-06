import { buildPareto, evaluateGate, isWhyChainComplete, nextPhase, previousPhase, problemCode, type GateInput } from './problem-rules';

const base: GateInput = {
  phase: 'DEFINITION',
  what: null, whereText: null, occurredAt: null,
  containment: null, containmentNotNeeded: false, containmentSkipReason: null, containmentActionCount: 0,
  causes: [], chains: [], correctiveStatuses: [], latestVerification: null,
};
const gate = (over: Partial<GateInput>) => evaluateGate({ ...base, ...over });

describe('problem rules', () => {
  it('formats codes and navigates phases', () => {
    expect(problemCode(3)).toBe('PRB-00003');
    expect(nextPhase('DEFINITION')).toBe('CONTAINMENT');
    expect(nextPhase('VERIFICATION')).toBe('CLOSED');
    expect(nextPhase('CLOSED')).toBeNull();
    expect(nextPhase('CANCELLED')).toBeNull();
    expect(previousPhase('DEFINITION')).toBeNull();
    expect(previousPhase('ACTIONS')).toBe('ROOT_CAUSE');
  });

  it('5 why completeness needs >= 3 answered steps and a root cause', () => {
    const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ answer: `n${i}` }));
    expect(isWhyChainComplete({ rootCause: 'kök', steps: steps(3) })).toBe(true);
    expect(isWhyChainComplete({ rootCause: 'kök', steps: steps(2) })).toBe(false);
    expect(isWhyChainComplete({ rootCause: '  ', steps: steps(5) })).toBe(false);
    expect(isWhyChainComplete({ rootCause: null, steps: steps(5) })).toBe(false);
    expect(isWhyChainComplete({ rootCause: 'kök', steps: [...steps(2), { answer: ' ' }] })).toBe(false);
  });

  it('DEFINITION gate needs what/where/when', () => {
    expect(gate({}).missing).toEqual(['DEFINITION_INCOMPLETE']);
    expect(gate({ what: 'x', whereText: 'y' }).missing).toEqual(['DEFINITION_INCOMPLETE']);
    const ok = gate({ what: 'x', whereText: 'y', occurredAt: new Date() });
    expect(ok.canAdvance).toBe(true);
    expect(ok.nextPhase).toBe('CONTAINMENT');
  });

  it('CONTAINMENT gate: text, action or explicit skip with reason', () => {
    const c = { phase: 'CONTAINMENT' as const };
    expect(gate(c).missing).toEqual(['CONTAINMENT_REQUIRED']);
    expect(gate({ ...c, containment: 'Ayıklama' }).canAdvance).toBe(true);
    expect(gate({ ...c, containmentActionCount: 1 }).canAdvance).toBe(true);
    expect(gate({ ...c, containmentNotNeeded: true }).canAdvance).toBe(false);
    expect(gate({ ...c, containmentNotNeeded: true, containmentSkipReason: 'Stok yok' }).canAdvance).toBe(true);
  });

  it('ROOT_CAUSE gate: fishbone in 2 categories + candidate, then a complete 5-why', () => {
    const c = { phase: 'ROOT_CAUSE' as const };
    expect(gate(c).missing).toEqual(['FISHBONE_REQUIRED', 'FIVE_WHY_REQUIRED']);
    const oneCat = [{ id: '1', category: 'MAN' as const, isCandidate: true }, { id: '2', category: 'MAN' as const, isCandidate: false }];
    expect(gate({ ...c, causes: oneCat }).missing).toContain('FISHBONE_REQUIRED');
    const twoCatsNoCandidate = [{ id: '1', category: 'MAN' as const, isCandidate: false }, { id: '2', category: 'MACHINE' as const, isCandidate: false }];
    expect(gate({ ...c, causes: twoCatsNoCandidate }).missing).toContain('FISHBONE_REQUIRED');
    const causes = [{ id: '1', category: 'MAN' as const, isCandidate: true }, { id: '2', category: 'MACHINE' as const, isCandidate: false }];
    expect(gate({ ...c, causes }).missing).toEqual(['FIVE_WHY_REQUIRED']);
    expect(gate({ ...c, causes, chains: [{ causeId: '1', complete: false, correctiveCount: 0 }] }).missing).toEqual(['FIVE_WHY_REQUIRED']);
    expect(gate({ ...c, causes, chains: [{ causeId: '1', complete: true, correctiveCount: 0 }] }).canAdvance).toBe(true);
  });

  it('ACTIONS gate: unaddressed root cause, corrective required, open actions', () => {
    const a = { phase: 'ACTIONS' as const };
    const chain = (correctiveCount: number) => [{ causeId: '1', complete: true, correctiveCount }];
    expect(gate({ ...a, chains: chain(0) }).missing).toEqual(['ROOT_CAUSE_UNADDRESSED', 'CORRECTIVE_REQUIRED']);
    expect(gate({ ...a, chains: chain(1), correctiveStatuses: ['IN_PROGRESS'] }).missing).toEqual(['ACTIONS_OPEN']);
    expect(gate({ ...a, chains: chain(1), correctiveStatuses: ['DONE', 'CANCELLED'] }).canAdvance).toBe(true);
    expect(gate({ ...a, chains: chain(1), correctiveStatuses: ['CANCELLED'] }).missing).toEqual(['CORRECTIVE_REQUIRED']);
    // tamamlanmamış zincirler aksiyon gerektirmez
    expect(gate({ ...a, chains: [{ causeId: '9', complete: false, correctiveCount: 0 }], correctiveStatuses: ['VERIFIED'] }).canAdvance).toBe(true);
  });

  it('VERIFICATION gate needs the latest verification to be effective', () => {
    const v = { phase: 'VERIFICATION' as const };
    expect(gate(v).missing).toEqual(['VERIFICATION_REQUIRED']);
    expect(gate({ ...v, latestVerification: 'NOT_EFFECTIVE' }).missing).toEqual(['VERIFICATION_REQUIRED']);
    const ok = gate({ ...v, latestVerification: 'EFFECTIVE' });
    expect(ok.canAdvance).toBe(true);
    expect(ok.nextPhase).toBe('CLOSED');
  });

  it('closed and cancelled problems cannot advance', () => {
    expect(gate({ phase: 'CLOSED' })).toEqual({ nextPhase: null, canAdvance: false, missing: [] });
    expect(gate({ phase: 'CANCELLED' }).canAdvance).toBe(false);
  });

  it('builds a Pareto with cumulative percentages', () => {
    expect(buildPareto([])).toEqual([]);
    const p = buildPareto(['METHOD', 'MAN', 'METHOD', 'MACHINE', 'METHOD', 'MAN']);
    expect(p).toEqual([
      { category: 'METHOD', count: 3, cumulativePercent: 50 },
      { category: 'MAN', count: 2, cumulativePercent: 83.3 },
      { category: 'MACHINE', count: 1, cumulativePercent: 100 },
    ]);
  });
});

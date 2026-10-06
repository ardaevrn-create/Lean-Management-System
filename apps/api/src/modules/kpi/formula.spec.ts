import { evaluateFormula, findFormulaCycle, FormulaError, formulaRefs, parseFormula } from '@lean/shared';

const vars = (m: Record<string, number | null>) => (code: string) => m[code];

describe('kpi formula parser', () => {
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(evaluateFormula('1 + 2 * 3', vars({}))).toBe(7);
    expect(evaluateFormula('(1 + 2) * 3', vars({}))).toBe(9);
    expect(evaluateFormula('10 / 4', vars({}))).toBe(2.5);
    expect(evaluateFormula('-3 + 5', vars({}))).toBe(2);
    expect(evaluateFormula('2 * -(1 + 1)', vars({}))).toBe(-4);
    expect(evaluateFormula('1.5 + .5', vars({}))).toBe(2);
    expect(evaluateFormula('8 - 3 - 2', vars({}))).toBe(3);
    expect(evaluateFormula('100 / 5 / 2', vars({}))).toBe(10);
  });

  it('resolves KPI references case-insensitively', () => {
    const f = '({SCRAP_QTY} / {PROD_QTY}) * 100';
    expect(evaluateFormula(f, vars({ SCRAP_QTY: 5, PROD_QTY: 200 }))).toBe(2.5);
    expect(evaluateFormula('{scrap_qty} * 2', vars({ SCRAP_QTY: 4 }))).toBe(8);
    expect(formulaRefs(f).sort()).toEqual(['PROD_QTY', 'SCRAP_QTY']);
    expect(formulaRefs('{A} + {A} * {B-1}').sort()).toEqual(['A', 'B-1']);
  });

  it('returns null for division by zero and missing inputs', () => {
    expect(evaluateFormula('{A} / {B}', vars({ A: 5, B: 0 }))).toBeNull();
    expect(evaluateFormula('1 / (2 - 2)', vars({}))).toBeNull();
    expect(evaluateFormula('{A} + 1', vars({ A: null }))).toBeNull();
    expect(evaluateFormula('{A} + 1', vars({}))).toBeNull();
    expect(evaluateFormula('{A} * 1', vars({ A: Number.POSITIVE_INFINITY }))).toBeNull();
  });

  it('rejects malicious or malformed input', () => {
    const bad = [
      '', '   ', 'process.exit(1)', 'constructor.constructor("return 1")()', '1; 2', 'alert(1)', '__proto__', 'a + b',
      '1 +', '(1 + 2', '1 + 2)', '{A', '{}', '{A B}', '{A;B}', '1 2', '* 3', '1 ** 2', '"x"', '`x`', '1 + {A}}',
      'require("fs")', '1 // 2', '1e5', '0x10', '${1}', '[1]', '{A}.b',
    ];
    for (const f of bad) expect(() => parseFormula(f)).toThrow(FormulaError);
  });

  it('rejects overly long or deeply nested formulas', () => {
    expect(() => parseFormula('1+'.repeat(300) + '1')).toThrow(FormulaError);
    expect(() => parseFormula('('.repeat(100) + '1' + ')'.repeat(100))).toThrow(FormulaError);
    expect(() => parseFormula('-'.repeat(100) + '1')).toThrow(FormulaError);
  });

  it('detects dependency cycles', () => {
    const deps = new Map<string, string[]>([['A', ['B']], ['B', ['C']], ['C', ['A']]]);
    expect(findFormulaCycle(deps, 'A')).toEqual(['A', 'B', 'C', 'A']);
    expect(findFormulaCycle(new Map([['A', ['B']], ['B', []]]), 'A')).toBeNull();
    expect(findFormulaCycle(new Map([['A', ['A']]]), 'A')).toEqual(['A', 'A']);
  });
});

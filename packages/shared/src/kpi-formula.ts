/**
 * Hesaplanan KPI formülleri için güvenli ifade ayrıştırıcı.
 * Desteklenen: sayılar, + - * /, parantez, tekli eksi, {KPI_KODU} referansları.
 * eval / Function KULLANILMAZ; tanınmayan her karakter hata verir.
 */

export type FormulaNode =
  | { t: 'num'; v: number }
  | { t: 'ref'; code: string }
  | { t: 'neg'; e: FormulaNode }
  | { t: 'bin'; op: '+' | '-' | '*' | '/'; l: FormulaNode; r: FormulaNode };

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Op = '+' | '-' | '*' | '/' | '(' | ')';
type Token = { k: 'num'; v: number } | { k: 'ref'; code: string } | { k: 'op'; v: Op };

const MAX_LENGTH = 500;
const MAX_TOKENS = 300;
const MAX_DEPTH = 40;

export function normalizeKpiCode(code: string): string {
  return code.trim().toUpperCase();
}

function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new FormulaError('Formül çok uzun');
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if ('+-*/()'.includes(c)) {
      out.push({ k: 'op', v: c as Op });
      i++;
    } else if (c === '{') {
      const end = src.indexOf('}', i);
      if (end < 0) throw new FormulaError('Kapanmamış { referansı');
      const code = src.slice(i + 1, end).trim();
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(code)) throw new FormulaError(`Geçersiz KPI kodu: {${code}}`);
      out.push({ k: 'ref', code: normalizeKpiCode(code) });
      i = end + 1;
    } else if ((c >= '0' && c <= '9') || c === '.') {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Geçersiz sayı (konum ${i + 1})`);
      out.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else {
      throw new FormulaError(`Geçersiz karakter "${c}" (konum ${i + 1})`);
    }
    if (out.length > MAX_TOKENS) throw new FormulaError('Formül çok karmaşık');
  }
  return out;
}

export function parseFormula(src: string): FormulaNode {
  const tokens = tokenize(src);
  if (!tokens.length) throw new FormulaError('Formül boş');
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  const parseExpr = (depth: number): FormulaNode => {
    if (depth > MAX_DEPTH) throw new FormulaError('Formül çok derin');
    let left = parseTerm(depth);
    for (let t = peek(); t?.k === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
      pos++;
      left = { t: 'bin', op: t.v as '+' | '-', l: left, r: parseTerm(depth) };
    }
    return left;
  };
  const parseTerm = (depth: number): FormulaNode => {
    let left = parseFactor(depth);
    for (let t = peek(); t?.k === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
      pos++;
      left = { t: 'bin', op: t.v as '*' | '/', l: left, r: parseFactor(depth) };
    }
    return left;
  };
  const parseFactor = (depth: number): FormulaNode => {
    if (depth > MAX_DEPTH) throw new FormulaError('Formül çok derin');
    const t = tokens[pos++];
    if (!t) throw new FormulaError('Formül beklenmedik şekilde bitti');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'ref') return { t: 'ref', code: t.code };
    if (t.v === '-') return { t: 'neg', e: parseFactor(depth + 1) };
    if (t.v === '+') return parseFactor(depth + 1);
    if (t.v === '(') {
      const e = parseExpr(depth + 1);
      const close = tokens[pos++];
      if (!close || close.k !== 'op' || close.v !== ')') throw new FormulaError('Parantez kapatılmamış');
      return e;
    }
    throw new FormulaError(`Beklenmeyen "${t.v}"`);
  };

  const ast = parseExpr(0);
  if (pos < tokens.length) throw new FormulaError('Formül sonunda beklenmeyen ifade');
  return ast;
}

/** Formüldeki benzersiz KPI kodları (büyük harf). */
export function formulaRefs(ast: FormulaNode | string): string[] {
  const node = typeof ast === 'string' ? parseFormula(ast) : ast;
  const set = new Set<string>();
  const walk = (n: FormulaNode) => {
    if (n.t === 'ref') set.add(n.code);
    else if (n.t === 'neg') walk(n.e);
    else if (n.t === 'bin') {
      walk(n.l);
      walk(n.r);
    }
  };
  walk(node);
  return [...set];
}

/** Değerlendirir. Eksik referans, sıfıra bölme veya sonsuz sonuçta null döner. */
export function evaluateFormula(ast: FormulaNode | string, resolve: (code: string) => number | null | undefined): number | null {
  const node = typeof ast === 'string' ? parseFormula(ast) : ast;
  const ev = (n: FormulaNode): number | null => {
    switch (n.t) {
      case 'num':
        return n.v;
      case 'ref': {
        const v = resolve(n.code);
        return v === null || v === undefined || !Number.isFinite(v) ? null : v;
      }
      case 'neg': {
        const v = ev(n.e);
        return v === null ? null : -v;
      }
      case 'bin': {
        const l = ev(n.l);
        const r = ev(n.r);
        if (l === null || r === null) return null;
        switch (n.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return r === 0 ? null : l / r;
        }
      }
    }
  };
  const result = ev(node);
  return result !== null && Number.isFinite(result) ? result : null;
}

/** Formül bağımlılık grafında döngü var mı? deps: kod -> bağımlı olduğu kodlar. Döngü yolunu döndürür. */
export function findFormulaCycle(deps: Map<string, string[]>, start: string): string[] | null {
  const stack: string[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (code: string): string[] | null => {
    if (visiting.has(code)) return [...stack.slice(stack.indexOf(code)), code];
    if (done.has(code)) return null;
    visiting.add(code);
    stack.push(code);
    for (const d of deps.get(code) ?? []) {
      const cycle = visit(d);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(code);
    done.add(code);
    return null;
  };
  return visit(start);
}

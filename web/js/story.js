// 이야기 규칙 — story.json v2 (장 제목·미로·할 일·판정 규칙). Unity 판 Story 스크립트와 같은 동작을 목표로 한다.

export function parseJsonc(text) {
  const clean = text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  return JSON.parse(clean);
}

/** 이야기 원본(JSON)의 화면 문장을 사전(한국어 → 다른 언어)으로 바꾼 사본. 조건·변수 이름은 그대로. */
export function localize(root, dict) {
  if (!dict) return root;
  const tr = (s) => (typeof s === 'string' && Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s);
  const r = JSON.parse(JSON.stringify(root));
  r.intro = (r.intro || []).map(tr);
  const lines = (arr) => (arr || []).map((l) => (typeof l === 'string' ? tr(l) : { ...l, text: tr(l.text) }));
  for (const c of r.chapters || []) { c.label = tr(c.label); c.title = tr(c.title); }
  for (const n of r.nodes || []) {
    if (n.record != null) n.record = tr(n.record);
    if (n.status != null) n.status = tr(n.status);
    n.lines = lines(n.lines);
    n.hidden = lines(n.hidden);
    for (const c of n.choices || []) c.text = tr(c.text);
    if (n.task) { n.task.hint = tr(n.task.hint); n.task.screen = tr(n.task.screen); }
    if (n.maze) { n.maze.subtle = tr(n.maze.subtle); n.maze.direct = tr(n.maze.direct); }
  }
  for (const e of r.events || []) for (const a of e.actions || []) for (const k of ['text', 'prompt']) if (a[k] != null) a[k] = tr(a[k]);
  for (const e of r.endings || []) { e.title = tr(e.title); e.hint = tr(e.hint); e.lines = lines(e.lines); }
  for (const k of Object.keys(r.inspects || {})) {
    r.inspects[k] = r.inspects[k].map((v) => (typeof v === 'string' ? tr(v) : { ...v, text: [].concat(v.text).map(tr) }));
  }
  for (const k of Object.keys(r.sheets || {})) r.sheets[k] = r.sheets[k].map(tr);
  return r;
}

export class Vars {
  constructor() { this.m = new Map(); }
  get(k) { return k != null && this.m.has(k) ? this.m.get(k) : ''; }
  num(k) { const f = parseFloat(this.get(k)); return Number.isFinite(f) ? f : 0; }
  truthy(k) { const v = this.get(k); return v !== '' && v !== '0' && v !== 'false'; }
  set(k, v) { if (k) this.m.set(k, String(v ?? '')); }
  add(k, d) { this.set(k, fmtNum(this.num(k) + d)); }
  remove(k) { this.m.delete(k); }
  clone() { const c = new Vars(); c.m = new Map(this.m); return c; }
  toJSON() { return [...this.m.entries()]; }
  static from(entries) { const v = new Vars(); if (Array.isArray(entries)) for (const [k, val] of entries) v.set(k, val); return v; }

  apply(op) {
    if (!op || !op.trim()) return;
    op = op.trim();
    if (op[0] === '!') { this.remove(op.slice(1).trim()); return; }
    const eq = op.indexOf('=');
    if (eq > 0) { this.set(op.slice(0, eq).trim(), op.slice(eq + 1).trim()); return; }
    const plus = op.indexOf('+');
    if (plus > 0 && isNum(op.slice(plus + 1))) { this.add(op.slice(0, plus).trim(), parseFloat(op.slice(plus + 1))); return; }
    const minus = op.lastIndexOf('-');
    if (minus > 0 && isNum(op.slice(minus + 1))) { this.add(op.slice(0, minus).trim(), -parseFloat(op.slice(minus + 1))); return; }
    this.set(op, '1');
  }

  format(text) {
    if (!text) return '';
    return text.replace(/\{([^}]+)\}/g, (_, k) => { const v = this.get(k); return v.length ? v : '0'; });
  }
}

function isNum(s) { return s.trim() !== '' && Number.isFinite(Number(s.trim())); }
function fmtNum(n) { return Number.isInteger(n) ? String(n) : String(+n.toFixed(4)); }

const OPS = ['>=', '<=', '!=', '>', '<', '='];

export function cond(expr, v) {
  if (!expr || !expr.trim()) return true;
  for (const orPart of expr.split('|')) {
    let all = true;
    for (const term of orPart.split('&')) { if (!evalTerm(term.trim(), v)) { all = false; break; } }
    if (all) return true;
  }
  return false;
}

function evalTerm(tm, v) {
  if (!tm) return true;
  for (const op of OPS) {
    const idx = tm.indexOf(op);
    if (idx <= 0) continue;
    const key = tm.slice(0, idx).trim();
    const val = tm.slice(idx + op.length).trim();
    const cur = v.get(key);
    const valIsNum = isNum(val);
    const curIsNum = cur === '' || isNum(cur);
    const cv = v.num(key), fv = parseFloat(val);
    switch (op) {
      case '>=': return cv >= fv;
      case '<=': return cv <= fv;
      case '>': return cv > fv;
      case '<': return cv < fv;
      case '=': return valIsNum && curIsNum ? Math.abs(cv - fv) < 1e-4 : cur === val;
      case '!=': return valIsNum && curIsNum ? Math.abs(cv - fv) >= 1e-4 : cur !== val;
    }
  }
  if (tm[0] === '!') return !v.truthy(tm.slice(1).trim());
  return v.truthy(tm);
}

function readLines(arr) {
  return (arr || []).map((l) => (typeof l === 'string'
    ? { who: 'sys', text: l, cond: '', glitch: 0, pause: 0 }
    : { who: l.who || 'sys', text: l.text || '', cond: l.if || '', glitch: l.glitch || 0, pause: l.pause || 0 }));
}

const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

export class Story {
  constructor(root) {
    this.start = root.start;
    this.chaseRetry = root.chaseRetry || '';
    this.intro = root.intro || [];
    this.rules = (root.rules || []).map((r) => ({ cond: r.if || '', goto: r.goto }));
    this.chapters = (root.chapters || []).map((c, i) => ({ ...c, index: i }));
    this.chapterById = new Map(this.chapters.map((c) => [c.id, c]));
    this.sheets = root.sheets || {};
    this.nodes = new Map();
    for (const n of root.nodes || []) {
      this.nodes.set(n.id, {
        id: n.id,
        chapter: n.chapter || '',
        clock: n.clock || '',
        record: n.record ?? null,
        status: n.status ?? null,
        clear: !!n.clear,
        set: list(n.set),
        onEnter: list(n.onEnter),
        after: list(n.after),
        lines: readLines(n.lines),
        hidden: readLines(n.hidden),
        choices: (n.choices || []).map((c) => ({ text: c.text || '', cond: c.if || '', set: list(c.set), events: list(c.events), next: c.next || '', unsettling: !!c.unsettling, disabled: !!c.disabled })),
        save: !!n.save,
        demo: n.demo ?? null,
        maze: n.maze || null,
        task: n.task || null,
        pause: n.pause || 0,
        run: n.run || '',
        noRules: !!n.noRules,
        branch: (n.branch || []).map((b) => ({ cond: b.if || '', next: b.next || '' })),
        next: n.next || '',
        ending: n.ending || '',
        chase: n.chase ? { escaped: n.chase.escaped, caught: n.chase.caught } : null,
      });
    }
    this.events = new Map();
    for (const e of root.events || []) this.events.set(e.id, e.actions || []);
    this.endings = new Map();
    for (const e of root.endings || []) this.endings.set(e.id, { id: e.id, number: e.number, title: e.title, hint: e.hint || '', bad: !!e.bad, retryChase: !!e.retryChase, lines: readLines(e.lines) });
    this.inspects = new Map(Object.entries(root.inspects || {}));
  }

  visibleLines(lines, v) { return lines.filter((l) => cond(l.cond, v)); }
  visibleChoices(node, v) { return node.choices.filter((c) => cond(c.cond, v)); }
  resolveNext(node, v) { for (const b of node.branch) if (cond(b.cond, v)) return b.next; return node.next; }
  /** 판정 규칙: 처음 맞는 것의 이동할 노드 (없으면 '') */
  ruleHit(v) { for (const r of this.rules) if (cond(r.cond, v)) return r.goto; return ''; }

  /** 조사 문구. 맞는 변형을 찾아 글과 set 을 돌려준다 */
  inspect(id, v) {
    const variants = this.inspects.get(id);
    if (!variants) return { lines: [], set: [] };
    for (const vr of variants) {
      if (typeof vr === 'string') return { lines: [v.format(vr)], set: [] };
      if (cond(vr.if || '', v)) return { lines: list(vr.text).map((s) => v.format(s)), set: list(vr.set) };
    }
    return { lines: [], set: [] };
  }
  inspectLines(id, v) { return this.inspect(id, v).lines; }
}

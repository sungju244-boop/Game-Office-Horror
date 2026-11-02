// CRT 단말기 화면: 캔버스에 글자를 그려 모니터 메시에 직접 표시 (별도 UI 창 없음).
// 구성: 머리줄 / 큰 대사 / 큰 선택지 2개. 불안한 선택지는 글자·화면이 지지직거린다.
import { THREE, crtMaterial } from './kit.js';

const W = 1024, H = 768;
const MX = 64, TOP = 96, BOTTOM = 232, BW = W - MX * 2;
const FONT = "'Galmuri11', 'Malgun Gothic', sans-serif";
const FONTB = "'Galmuri11B', 'Galmuri11', 'Malgun Gothic', sans-serif";
const SCR = '░▒▓█#%&?!*/\\|<>=+';
const PREFIX = {
  user: ['사용자 › ', '#8ea4b6', '#dce8f2'],
  ai: ['AI › ', '#7fd8ff', '#c9f1ff'],
  corp: ['[회사] ', '#e0b468', '#ecd7aa'],
  me: ['평가자 117 › ', '#a9dca0', '#e0f5da'],
  sys: ['[시스템] ', '#6d8494', '#a4b8c6'],
};

function scramble(s, amt) {
  if (amt <= 0.001) return s;
  let o = '';
  for (const ch of s) {
    if (ch === ' ' || Math.random() > amt) { o += ch; continue; }
    o += Math.random() < 0.6 ? SCR[(Math.random() * SCR.length) | 0] : String.fromCharCode(0xac00 + ((Math.random() * 11171) | 0));
  }
  return o;
}

export class Terminal {
  constructor(screenMesh, light, glow, sfx) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.mat = crtMaterial(this.tex);
    if (screenMesh) screenMesh.material = this.mat;
    this.screen = screenMesh;
    this.light = light; this.glow = glow;
    this.lightBase = light ? light.intensity : 0; this.glowBase = glow ? glow.intensity : 0;
    this.sfx = sfx; // (name, vol) => void
    this.header = ''; this.status = ''; this.clock = '';
    this.lines = []; // {prefix, pc, bc, text, shown, glitch, settle}
    this.scrollUp = 0;
    this.center = null; // [main, sub]
    this.choices = null; // {items:[{text,unsettling,rect}], hover, locked, resolve, scrTimer, blink}
    this.arrow = false; this.arrowT = 0;
    this.typing = null; // {line, acc, resolve}
    this.waitResolve = null;
    this.glitch = 0; this.glitchHold = 0; this.ambient = 8; this.tension = 0;
    this.power = 1; this.powerTarget = 1; this.powerSpeed = 1;
    this.acceptInput = false;
    this.cursor = { x: W / 2, y: H / 2, visible: false };
    this.dirty = true;
  }

  // ---------- 상태 ----------
  setHeader(rec, status, clock) { this.header = rec || ''; this.status = status || ''; if (clock != null) this.clock = clock; this.dirty = true; }
  setClock(c) { this.clock = c || ''; this.dirty = true; }
  clearBody() { this.lines = []; this.scrollUp = 0; this.arrow = false; this.center = null; this.dirty = true; }
  showCenter(main, sub) { this.center = [main || '', sub || '']; this.dirty = true; }
  hideCenter() { this.center = null; this.dirty = true; }

  showLine(who, text, glitch) {
    this.hideCenter();
    this.scrollUp = 0;
    const [prefix, pc, bc] = PREFIX[who] || PREFIX.sys;
    const line = { prefix, pc, bc, text, shown: 0, glitch: glitch || 0, settle: 0, jitter: 0 };
    this.lines.push(line);
    if (this.lines.length > 60) this.lines.shift();
    return new Promise((resolve) => { this.typing = { line, acc: 0, blip: 0, resolve }; });
  }

  showChoices(labels, unsettling) {
    this.arrow = false;
    const items = labels.map((t, i) => ({ text: t, unsettling: !!unsettling[i], rect: [W / 2 + (i === 0 ? -1 : 1) * 232 - 216, H - 112 - 68, 432, 136] }));
    this.sfx('sfx_beep', 0.35);
    return new Promise((resolve) => { this.choices = { items, hover: -1, locked: false, resolve, scrTimer: 0, blink: -1, blinkT: 0, label: [] }; this.dirty = true; });
  }
  hideChoices() { this.choices = null; this.dirty = true; }

  glitchFx(amount, time) { this.glitch = Math.max(this.glitch, Math.min(1, amount)); this.glitchHold = Math.max(this.glitchHold, time); }
  setPower(target, time) { this.powerTarget = Math.max(0, Math.min(1, target)); this.powerSpeed = 1 / Math.max(0.01, time); this.sfx(target < this.power ? 'sfx_crt_off' : 'sfx_crt_on', 0.5); }

  // ---------- 입력 ----------
  hitChoice(x, y) {
    if (!this.choices) return -1;
    for (let i = 0; i < this.choices.items.length; i++) {
      const [rx, ry, rw, rh] = this.choices.items[i].rect;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return i;
    }
    return -1;
  }
  pointer(x, y) {
    if (x == null) { this.cursor.visible = false; this.setHover(-1); return; }
    this.cursor.x = x; this.cursor.y = y; this.cursor.visible = true; this.dirty = true;
    if (this.choices && !this.choices.locked) this.setHover(this.hitChoice(x, y));
  }
  setHover(h) {
    const c = this.choices;
    if (!c || c.locked || h === c.hover) return;
    c.hover = h;
    if (h >= 0) this.sfx(c.items[h].unsettling ? 'sfx_static_1' : 'sfx_ui_hover', c.items[h].unsettling ? 0.18 : 0.3);
    this.dirty = true;
  }
  click(x, y) {
    if (!this.acceptInput) return;
    if (this.choices) {
      if (this.choices.locked) return;
      const h = x == null ? -1 : this.hitChoice(x, y);
      if (h >= 0) this.pick(h);
      return;
    }
    if (this.typing) { this.typing.line.shown = this.typing.line.text.length; return; }
    if (this.waitResolve) { const r = this.waitResolve; this.waitResolve = null; this.arrow = false; this.sfx('sfx_click', 0.3); this.dirty = true; r(); }
  }
  scroll(d) { this.scrollUp = Math.max(0, this.scrollUp + d * 60); this.dirty = true; }
  pick(i) {
    const c = this.choices; c.locked = true; c.blink = i; c.blinkT = 0;
    this.sfx('sfx_ui_select', 0.45);
    if (c.items[i].unsettling) { this.glitchFx(0.85, 0.7); this.sfx('sfx_static_' + (1 + ((Math.random() * 3) | 0)), 0.6); }
  }

  // ---------- 매 프레임 ----------
  update(dt, time) {
    if (this.typing) {
      const t = this.typing, l = t.line;
      if (l.shown < l.text.length) {
        t.acc += dt * 30;
        while (t.acc >= 1 && l.shown < l.text.length) { t.acc -= 1; l.shown++; if (l.text[l.shown - 1] !== ' ' && (t.blip++ % 2 === 0)) this.sfx('sfx_blip', 0.18); }
        this.dirty = true;
      } else {
        this.typing = null;
        if (l.glitch > 0.01) {
          l.settle = 0.5; this.glitchFx(Math.min(1, l.glitch), 0.25 + l.glitch * 0.5);
          if (l.glitch >= 0.3) this.sfx('sfx_static_' + (1 + ((Math.random() * 3) | 0)), 0.35 + l.glitch * 0.3);
        }
        this.arrow = true;
        const done = t.resolve;
        this.waitResolve = done;
      }
    }
    for (const l of this.lines) if (l.settle > 0) { l.settle -= dt; this.dirty = true; }
    if (this.arrow) { this.arrowT += dt; this.dirty = true; }
    const c = this.choices;
    if (c) {
      if (c.locked) {
        c.blinkT += dt;
        this.dirty = true;
        if (c.blinkT > 0.65) { const r = c.resolve, i = c.blink; this.choices = null; r(i); }
      } else if (c.hover >= 0 && c.items[c.hover].unsettling) {
        c.scrTimer -= dt; this.dirty = true;
        if (c.scrTimer <= 0) { c.scrTimer = 0.06 + Math.random() * 0.14; if (Math.random() < 0.2) this.glitchFx(0.18, 0.08); }
      }
    }
    // 지지직·전원
    if (this.glitchHold > 0) this.glitchHold -= dt;
    else this.glitch = Math.max(this.tension * 0.02, this.glitch - dt * 2.2);
    this.ambient -= dt;
    if (this.ambient <= 0) {
      this.ambient = (7 + Math.random() * 13) / (1 + this.tension * 0.6);
      if (this.power > 0.5) { this.glitchFx(0.12 + Math.random() * 0.18 + this.tension * 0.05, 0.06 + Math.random() * 0.12); if (this.tension >= 1 && Math.random() < 0.5) this.sfx('sfx_static_' + (1 + ((Math.random() * 3) | 0)), 0.12); }
    }
    const dp = this.powerTarget - this.power;
    this.power += Math.sign(dp) * Math.min(Math.abs(dp), this.powerSpeed * dt);
    const u = this.mat.uniforms;
    u.glitch.value = this.glitch; u.power.value = this.power; u.time.value = time;
    const flick = 1 - this.glitch * Math.random() * 0.55;
    if (this.light) this.light.intensity = this.lightBase * this.power * flick;
    if (this.glow) this.glow.intensity = this.glowBase * this.power * flick;
    if (this.dirty) { this.draw(); this.dirty = false; this.tex.needsUpdate = true; }
  }

  // ---------- 그리기 ----------
  wrap(g, prefix, text, font) {
    g.font = font;
    const out = [];
    let line = '', first = true;
    const pw = g.measureText(prefix).width;
    const limit = () => (first ? BW - pw : BW);
    const words = text.split(/(\s+)/);
    for (const w of words) {
      if (g.measureText(line + w).width <= limit()) { line += w; continue; }
      if (line.trim().length) { out.push(line); first = false; line = w.trimStart(); }
      else line = '';
      // 긴 단어는 글자 단위로 자름
      for (const ch of (line.length ? '' : w)) {
        if (g.measureText(line + ch).width > limit()) { out.push(line); first = false; line = ''; }
        line += ch;
      }
    }
    if (line.length || !out.length) out.push(line);
    return { rows: out, pw };
  }

  draw() {
    const g = this.g;
    g.fillStyle = '#020407';
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'top';
    // 머리줄
    g.font = `24px ${FONT}`;
    g.fillStyle = '#6b8796';
    g.fillText(this.header + (this.status ? '  ·  ' + this.status : ''), MX, 30);
    g.textAlign = 'right';
    g.fillText(this.clock, W - MX, 30);
    g.textAlign = 'left';
    g.fillStyle = '#40576a';
    g.fillRect(MX, 70, BW, 2);

    // 본문 (스크롤)
    const font = `36px ${FONT}`, lh = 42, gap = 12;
    const blocks = [];
    let total = 0;
    for (const l of this.lines) {
      const shownText = l.text.slice(0, l.shown);
      let t = shownText;
      if (l.glitch > 0.01 && (this.typing?.line === l || l.settle > 0)) t = scramble(shownText, l.glitch * 0.35 * (l.settle > 0 ? l.settle * 2 : 1));
      const w = this.wrap(g, l.prefix, t, font);
      blocks.push({ l, ...w, y: total });
      total += w.rows.length * lh + gap;
    }
    const viewH = H - TOP - BOTTOM;
    const maxScroll = Math.max(0, total - viewH);
    this.scrollUp = Math.min(this.scrollUp, maxScroll);
    const offset = maxScroll - this.scrollUp;
    g.save();
    g.beginPath(); g.rect(MX - 4, TOP, BW + 8, viewH); g.clip();
    g.font = font;
    for (const b of blocks) {
      let y = TOP + b.y - offset;
      if (y > H || y + b.rows.length * lh < TOP) continue;
      const jitter = b.l.glitch >= 0.4 ? 0.9 : 0;
      const jit = (b.l.settle > 0 ? b.l.glitch * 5 * b.l.settle : 0) + jitter;
      b.rows.forEach((row, ri) => {
        let x = MX;
        if (ri === 0) { g.fillStyle = b.l.pc; g.fillText(b.l.prefix, x, y); x += b.pw; }
        g.fillStyle = b.l.bc;
        if (jit > 0.05) {
          for (const ch of row) { const cw = g.measureText(ch).width; g.fillText(ch, x + (Math.random() < 0.4 ? (Math.random() * 2 - 1) * jit : 0), y + (Math.random() < 0.4 ? (Math.random() * 2 - 1) * jit * 0.6 : 0)); x += cw; }
        } else g.fillText(row, x, y);
        y += lh;
      });
    }
    g.restore();

    // ▼ 계속
    if (this.arrow && Math.sin(this.arrowT * 5) > 0) {
      g.font = `24px ${FONT}`; g.fillStyle = '#c7e6ff'; g.textAlign = 'right';
      g.fillText('▼', W - MX, H - BOTTOM + 8); g.textAlign = 'left';
    }

    // 가운데 안내
    if (this.center) {
      g.textAlign = 'center';
      g.font = `48px ${FONTB}`; g.fillStyle = '#c7e6ff';
      g.fillText(this.center[0], W / 2, H / 2 - 64);
      g.font = `24px ${FONT}`; g.fillStyle = '#6b8796';
      g.fillText(this.center[1], W / 2, H / 2 + 20);
      g.textAlign = 'left';
    }

    // 선택지
    const c = this.choices;
    if (c) {
      c.items.forEach((it, i) => {
        const [x, y, w, h] = it.rect;
        let hot = c.hover === i;
        let alpha = 1;
        if (c.locked) { if (i === c.blink) hot = Math.floor(c.blinkT / 0.08) % 2 === 0; else alpha = 0.25; }
        g.globalAlpha = alpha;
        g.fillStyle = '#9ecbe9'; g.fillRect(x, y, w, h);
        g.fillStyle = hot ? (it.unsettling ? '#f2d1d1' : '#c7ebff') : '#05101a';
        g.fillRect(x + 4, y + 4, w - 8, h - 8);
        let size = 48;
        g.font = `${size}px ${FONTB}`;
        while (g.measureText(it.text).width > w - 36 && size > 28) { size -= 4; g.font = `${size}px ${FONTB}`; }
        let label = it.text;
        const unsettledHover = (hot && it.unsettling && !c.locked) || (c.locked && i === c.blink && it.unsettling && c.blinkT < 0.35);
        if (unsettledHover && Math.random() < 0.45) label = scramble(it.text, 0.25);
        g.fillStyle = hot ? '#04080c' : '#c7e6ff';
        g.textAlign = 'center';
        const jx = unsettledHover ? (Math.random() * 2 - 1) * 3 : 0, jy = unsettledHover ? (Math.random() * 2 - 1) * 2 : 0;
        g.fillText(label, x + w / 2 + jx, y + h / 2 - size * 0.55 + jy);
        g.textAlign = 'left';
        g.globalAlpha = 1;
      });
    }

    // 마우스 커서 (화면 위의 화살표)
    if (this.cursor.visible && this.acceptInput) {
      const { x, y } = this.cursor;
      g.fillStyle = '#e6f6ff'; g.strokeStyle = '#020407'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 30); g.lineTo(x + 8, y + 23); g.lineTo(x + 14, y + 36); g.lineTo(x + 19, y + 33); g.lineTo(x + 13, y + 21); g.lineTo(x + 22, y + 21); g.closePath();
      g.fill(); g.stroke();
    }
  }
}

export const TERM_W = W, TERM_H = H;

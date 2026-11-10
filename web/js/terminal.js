// CRT 단말기 화면: 캔버스에 글자를 그려 모니터 메시에 직접 표시 (별도 UI 창 없음).
// 구성: 머리줄 / 대사 / 선택지 (2~5개). 가이드 마스코트, 장 제목 카드, 미로, 명령 입력, 균열, 블루스크린.
import { THREE, crtMaterial } from './kit.js';
import { t } from './i18n.js';

const W = 1024, H = 768;
const MX = 64, TOP = 96, BOTTOM = 232, BW = W - MX * 2;
const FONT = "'Galmuri11', 'Malgun Gothic', sans-serif";
const FONTB = "'Galmuri11B', 'Galmuri11', 'Malgun Gothic', sans-serif";
const SCR = '░▒▓█#%&?!*/\\|<>=+';
const COLORS = {
  user: ['spUser', '#8ea4b6', '#dce8f2'],
  ai: ['spAi', '#7fd8ff', '#c9f1ff'],
  corp: ['spCorp', '#e0b468', '#ecd7aa'],
  me: ['spMe', '#a9dca0', '#e0f5da'],
  sys: ['spSys', '#6d8494', '#a4b8c6'],
  guide: ['spGuide', '#ffd27a', '#fff0d2'],
  radio: ['spRadio', '#9fd0a8', '#d8f2dc'],
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

// 균열: 정해진 씨앗으로 만든 금 (단계마다 더해진다)
function makeCracks(stage) {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  const origins = [[0.78, 0.3], [0.22, 0.72], [0.55, 0.52]];
  for (let s = 0; s < Math.min(3, stage); s++) {
    const [ox, oy] = origins[s];
    const arms = 5 + s * 3;
    for (let a = 0; a < arms; a++) {
      let ang = (a / arms) * Math.PI * 2 + rnd() * 0.5, x = ox * W, y = oy * H;
      const pts = [[x, y]];
      const len = 120 + rnd() * (200 + s * 160);
      for (let d = 0; d < len; d += 18 + rnd() * 26) { ang += (rnd() - 0.5) * 0.7; x += Math.cos(ang) * 26; y += Math.sin(ang) * 26; pts.push([x, y]); }
      out.push({ pts, w: 1.5 + rnd() * 2.2 });
    }
    // 둥근 거미줄
    for (let ring = 1; ring <= 1 + s; ring++) {
      const r = 26 * ring + rnd() * 12, pts = [];
      for (let k = 0; k <= 10; k++) { const an = (k / 10) * Math.PI * 2; pts.push([ox * W + Math.cos(an) * r * (0.8 + rnd() * 0.4), oy * H + Math.sin(an) * r * (0.8 + rnd() * 0.4)]); }
      out.push({ pts, w: 1.2 });
    }
  }
  return out;
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
    this.lines = []; // {who, prefix, pc, bc, text, shown, glitch, settle}
    this.scrollUp = 0;
    this.center = null; // [main, sub]
    this.choices = null;
    this.arrow = false; this.arrowT = 0;
    this.typing = null;
    this.waitResolve = null;
    this.glitch = 0; this.glitchHold = 0; this.ambient = 8; this.tension = 0;
    this.power = 1; this.powerTarget = 1; this.powerSpeed = 1;
    this.acceptInput = false;
    this.cursor = { x: W / 2, y: H / 2, visible: false };
    this.demo = null; // 가이드가 커서를 대신 움직임
    this.mascot = { on: false, t: 0, blink: 0, distort: 0, cold: false, green: false, talk: 0 };
    this.card = null; this.maze = null; this.input = null; this.bsod = null; this.feedTex = null;
    this.hidden = null; // {text, chars:[{x,y,ch,a}]}
    this.crack = 0; this.cracks = []; this.faceImg = null; this.faceT = 0;
    this.theme = 'blue';
    this.dirty = true; this.fast = false;
  }

  // ---------- 상태 ----------
  setHeader(rec, status, clock) { this.header = rec || ''; this.status = status || ''; if (clock != null) this.clock = clock; this.dirty = true; }
  setClock(c) { this.clock = c || ''; this.dirty = true; }
  clearBody() { this.lines = []; this.scrollUp = 0; this.arrow = false; this.center = null; this.hidden = null; this.mascot.on = false; this.dirty = true; }
  showCenter(main, sub) { this.center = [main || '', sub || '']; this.dirty = true; }
  hideCenter() { this.center = null; this.dirty = true; }
  setGuideStyle({ cold, green } = {}) { if (cold != null) this.mascot.cold = cold; if (green != null) this.mascot.green = green; this.dirty = true; }

  prefixFor(who) {
    const c = COLORS[who] || COLORS.sys;
    if (who === 'guide' && this.mascot.green) return [t(c[0]), '#6dff7e', '#c8ffcf'];
    if (this.theme === 'green') return [t(c[0]), '#4dff6a', '#b6ffbf'];
    return [t(c[0]), c[1], c[2]];
  }

  showLine(who, text, glitch) {
    this.hideCenter();
    this.scrollUp = 0;
    const [prefix, pc, bc] = this.prefixFor(who);
    const line = { who, prefix, pc, bc, text, shown: 0, glitch: glitch || 0, settle: 0 };
    this.lines.push(line);
    if (this.lines.length > 60) this.lines.shift();
    this.mascot.on = who === 'guide';
    return new Promise((resolve) => { this.typing = { line, acc: 0, blip: 0, resolve }; });
  }

  /** labels: 문자열 배열. opts: { unsettling[], disabled[] } */
  showChoices(labels, unsettling = [], disabled = []) {
    this.arrow = false;
    const n = labels.length;
    const gap = n >= 5 ? 14 : 28;
    const w = Math.min(432, (BW - gap * (n - 1)) / n), h = n >= 5 ? 112 : 136;
    const x0 = W / 2 - (w * n + gap * (n - 1)) / 2;
    const items = labels.map((tx, i) => ({ text: tx, unsettling: !!unsettling[i], disabled: !!disabled[i], rect: [x0 + i * (w + gap), H - 112 - h / 2, w, h] }));
    this.sfx('sfx_beep', 0.35);
    return new Promise((resolve) => { this.choices = { items, hover: -1, locked: false, resolve, scrTimer: 0, blink: -1, blinkT: 0 }; this.dirty = true; });
  }
  hideChoices() { this.choices = null; this.dirty = true; }

  /** 가이드가 커서를 움직여 i 번째 선택지를 누른다 */
  demoPick(i) {
    const c = this.choices; if (!c || !c.items[i]) return;
    const [x, y, w, h] = c.items[i].rect;
    this.demo = { from: [this.cursor.x, this.cursor.y], to: [x + w / 2, y + h / 2], t: 0, dur: 1.4, i };
    this.cursor.visible = true; this.dirty = true;
  }

  glitchFx(amount, time) { this.glitch = Math.max(this.glitch, Math.min(1, amount)); this.glitchHold = Math.max(this.glitchHold, time); }
  setPower(target, time) { this.powerTarget = Math.max(0, Math.min(1, target)); this.powerSpeed = 1 / Math.max(0.01, time); this.sfx(target < this.power ? 'sfx_crt_off' : 'sfx_crt_on', 0.5); }

  /** 장 제목 카드: CRT 부팅 화면에 시각과 제목 */
  showCard(time, label, title) {
    this.card = { time, label, title, t: 0, dur: 3.2 };
    this.sfx('sfx_chapter', 0.6);
    this.dirty = true;
    return new Promise((r) => { this.card.resolve = r; });
  }

  /** 모델의 숨은 주석: 로그 화면 빈 곳을 커서로 긁으면 글자가 드러난다 */
  setHidden(text) {
    if (!text) { this.hidden = null; return; }
    this.hidden = { text, chars: null, found: false };
    this.dirty = true;
  }

  setCrack(stage) { this.crack = stage; this.cracks = makeCracks(stage); this.dirty = true; }
  flashFace(img, dur = 0.12) { this.faceImg = img; this.faceT = dur; this.dirty = true; }

  runMaze(maze) {
    this.maze = maze; this.fast = true; this.acceptInput = true;
    this.cursor.visible = true;
    maze.promise.then(() => { setTimeout(() => { if (this.maze === maze) { this.maze = null; this.fast = false; this.dirty = true; } }, 50); });
    this.dirty = true;
    return maze.promise;
  }

  /** 명령 입력 줄 (값은 바깥의 숨은 입력창이 넣어 준다) */
  startInput(promptText) {
    this.input = { prompt: promptText, value: '', caret: 0 };
    this.dirty = true;
    return new Promise((r) => { this.input.resolve = r; });
  }
  setInputValue(v) { if (this.input) { this.input.value = v; this.dirty = true; } }
  submitInput() {
    if (!this.input) return;
    const { resolve, value } = this.input; this.input = null; this.dirty = true;
    this.sfx('sfx_key', 0.5);
    resolve(value);
  }

  showBsod(lines) { this.bsod = { lines, t: 0 }; this.dirty = true; }
  hideBsod() { this.bsod = null; this.dirty = true; }
  showFeed(tex) { this.feedTex = tex; this.mat.uniforms.map.value = tex; }
  hideFeed() { this.feedTex = null; this.mat.uniforms.map.value = this.tex; this.dirty = true; }
  setTheme(th) { this.theme = th; this.dirty = true; }

  // ---------- 입력 ----------
  hitChoice(x, y) {
    if (!this.choices) return -1;
    for (let i = 0; i < this.choices.items.length; i++) {
      const it = this.choices.items[i]; if (it.disabled) continue;
      const [rx, ry, rw, rh] = it.rect;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return i;
    }
    return -1;
  }
  pointer(x, y) {
    if (this.demo) return;
    if (x == null) { this.cursor.visible = false; this.setHover(-1); return; }
    if (this.maze) { this.maze.o.relative = false; this.maze.moveTo(x, y); this.cursor.x = x; this.cursor.y = y; this.dirty = true; return; }
    this.cursor.x = x; this.cursor.y = y; this.cursor.visible = true; this.dirty = true;
    if (this.choices && !this.choices.locked) this.setHover(this.hitChoice(x, y));
    this.scratch(x, y);
  }
  pointerDelta(dx, dy, k = 1.5) {
    if (this.demo) return;
    if (this.maze) { this.maze.o.relative = true; this.maze.moveBy(dx * 1.0, dy * 1.0); this.dirty = true; return; }
    this.pointer(Math.max(0, Math.min(W, this.cursor.x + dx * k)), Math.max(0, Math.min(H, this.cursor.y + dy * k)));
  }
  setHover(h) {
    const c = this.choices;
    if (!c || c.locked || h === c.hover) return;
    c.hover = h;
    if (h >= 0) this.sfx(c.items[h].unsettling ? 'sfx_static_1' : 'sfx_ui_hover', c.items[h].unsettling ? 0.18 : 0.3);
    this.dirty = true;
  }
  click(x, y) {
    if (!this.acceptInput || this.demo || this.card) return;
    if (this.maze) { this.maze.click(); return; }
    if (this.input) return;
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
  scratch(x, y) {
    const h = this.hidden; if (!h || !h.chars) return;
    let changed = false;
    for (const c of h.chars) {
      if (c.a >= 1) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < 46) { c.a = Math.min(1, c.a + (46 - d) / 46 * 0.5); changed = true; }
    }
    if (changed) {
      this.dirty = true;
      if (!h.found && h.chars.filter((c) => c.a > 0.6).length > h.chars.length * 0.6) { h.found = true; this.sfx('sfx_static_1', 0.15); this.onHiddenFound?.(h.text); }
    }
  }

  // ---------- 매 프레임 ----------
  update(dt, time) {
    if (this.typing) {
      const tp = this.typing, l = tp.line;
      if (l.shown < l.text.length) {
        tp.acc += dt * 30;
        while (tp.acc >= 1 && l.shown < l.text.length) {
          tp.acc -= 1; l.shown++;
          if (l.text[l.shown - 1] !== ' ' && (tp.blip++ % 2 === 0)) this.sfx(l.who === 'guide' ? 'sfx_guide' : 'sfx_blip', l.who === 'guide' ? 0.22 : 0.18);
        }
        this.mascot.talk = 0.2;
        this.dirty = true;
      } else {
        this.typing = null;
        if (l.glitch > 0.01) {
          l.settle = 0.5; this.glitchFx(Math.min(1, l.glitch), 0.25 + l.glitch * 0.5);
          if (l.glitch >= 0.3) this.sfx('sfx_static_' + (1 + ((Math.random() * 3) | 0)), 0.35 + l.glitch * 0.3);
        }
        this.arrow = true;
        this.waitResolve = tp.resolve;
      }
    }
    for (const l of this.lines) if (l.settle > 0) { l.settle -= dt; this.dirty = true; }
    if (this.arrow) {
      const was = Math.sin(this.arrowT * 5) > 0;
      this.arrowT += dt;
      if ((Math.sin(this.arrowT * 5) > 0) !== was) this.dirty = true;
    }
    // 마스코트
    const ms = this.mascot;
    if (ms.on) {
      ms.t += dt; ms.blink -= dt; if (ms.talk > 0) ms.talk -= dt;
      if (ms.blink < -0.12) ms.blink = 2 + Math.random() * 3;
      if (ms.distort > 0) ms.distort -= dt;
      this.dirty = true;
    }
    // 가이드 커서
    if (this.demo) {
      const d = this.demo; d.t += dt;
      const k = Math.min(1, d.t / d.dur), e = k * k * (3 - 2 * k);
      this.cursor.x = d.from[0] + (d.to[0] - d.from[0]) * e;
      this.cursor.y = d.from[1] + (d.to[1] - d.from[1]) * e + Math.sin(k * Math.PI) * -40;
      if (this.choices && !this.choices.locked) this.setHover(this.hitChoice(this.cursor.x, this.cursor.y));
      this.dirty = true;
      if (d.t >= d.dur + 0.35) { const i = d.i; this.demo = null; if (this.choices && !this.choices.locked) this.pick(i); }
    }
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
    if (this.card) {
      this.card.t += dt; this.dirty = true;
      if (this.card.t >= this.card.dur) { const r = this.card.resolve; this.card = null; r?.(); }
    }
    if (this.maze) { this.maze.update(dt); this.dirty = true; }
    if (this.input) { this.dirty = this.dirty || Math.floor(time * 2) !== Math.floor((time - dt) * 2); }
    if (this.bsod) { this.bsod.t += dt; }
    if (this.faceT > 0) { this.faceT -= dt; this.dirty = true; }
    // 지지직·전원
    if (this.glitchHold > 0) this.glitchHold -= dt;
    else this.glitch = Math.max(this.tension * 0.02 + this.crack * 0.04, this.glitch - dt * 2.2);
    this.ambient -= dt;
    if (this.ambient <= 0) {
      this.ambient = (7 + Math.random() * 13) / (1 + this.tension * 0.6);
      if (this.power > 0.5 && !this.maze) { this.glitchFx(0.12 + Math.random() * 0.18 + this.tension * 0.05, 0.06 + Math.random() * 0.12); if (this.tension >= 1 && Math.random() < 0.5) this.sfx('sfx_static_' + (1 + ((Math.random() * 3) | 0)), 0.12); }
    }
    const dp = this.powerTarget - this.power;
    this.power += Math.sign(dp) * Math.min(Math.abs(dp), this.powerSpeed * dt);
    const u = this.mat.uniforms;
    u.glitch.value = this.glitch; u.power.value = this.power; u.time.value = time;
    const flick = 1 - this.glitch * Math.random() * 0.55;
    if (this.light) this.light.intensity = this.lightBase * this.power * flick;
    if (this.glow) this.glow.intensity = this.glowBase * this.power * flick;
    this.sinceDraw = (this.sinceDraw || 0) + dt;
    const limit = this.fast || this.card ? 1 / 60 : 1 / 30;
    if (this.dirty && this.sinceDraw >= limit && !this.feedTex) { this.sinceDraw = 0; this.draw(time); this.dirty = false; this.tex.needsUpdate = true; }
  }

  // ---------- 그리기 ----------
  wrap(g, prefix, text, font) {
    g.font = font;
    const out = [];
    let line = '', first = true;
    const pw = g.measureText(prefix).width;
    const lim = BW - 104; // 오른쪽 위 마스코트 자리
    const limit = () => (first ? lim - pw : lim);
    const words = text.split(/(\s+)/);
    for (const w of words) {
      if (g.measureText(line + w).width <= limit()) { line += w; continue; }
      if (line.trim().length) { out.push(line); first = false; line = w.trimStart(); }
      else line = '';
      for (const ch of (line.length ? '' : w)) {
        if (g.measureText(line + ch).width > limit()) { out.push(line); first = false; line = ''; }
        line += ch;
      }
    }
    if (line.length || !out.length) out.push(line);
    return { rows: out, pw };
  }

  draw(time = 0) {
    const g = this.g;
    if (this.bsod) { this.drawBsod(g); this.drawOverlays(g); return; }
    const green = this.theme === 'green';
    g.fillStyle = green ? '#010601' : '#020407';
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'top';
    if (this.card) { this.drawCard(g); this.drawOverlays(g); return; }
    // 머리줄
    g.font = `24px ${FONT}`;
    g.fillStyle = green ? '#3fae4a' : '#6b8796';
    g.fillText(this.header + (this.status ? '  ·  ' + this.status : ''), MX, 30);
    g.textAlign = 'right';
    g.fillText(this.clock, W - MX, 30);
    g.textAlign = 'left';
    g.fillStyle = green ? '#1d5a24' : '#40576a';
    g.fillRect(MX, 70, BW, 2);

    if (this.maze) { this.maze.draw(g, time); this.drawCursor(g, true); this.drawOverlays(g); return; }

    // 본문 (스크롤)
    const font = `34px ${FONT}`, lh = 40, gap = 12;
    const blocks = [];
    let total = 0;
    for (const l of this.lines) {
      const shownText = l.text.slice(0, l.shown);
      let tx = shownText;
      if (l.glitch > 0.01 && (this.typing?.line === l || l.settle > 0)) tx = scramble(shownText, l.glitch * 0.35 * (l.settle > 0 ? l.settle * 2 : 1));
      const w = this.wrap(g, l.prefix, tx, font);
      blocks.push({ l, ...w, y: total });
      total += w.rows.length * lh + gap;
    }
    const bottom = this.input ? 120 : BOTTOM;
    const viewH = H - TOP - bottom;
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
      const pc = b.l.who === 'guide' && this.mascot.green ? '#6dff7e' : b.l.pc, bc = b.l.who === 'guide' && this.mascot.green ? '#c8ffcf' : b.l.bc;
      b.rows.forEach((row, ri) => {
        let x = MX;
        if (ri === 0) { g.fillStyle = pc; g.fillText(b.l.prefix, x, y); x += b.pw; }
        g.fillStyle = bc;
        if (jit > 0.05) {
          for (const ch of row) { const cw = g.measureText(ch).width; g.fillText(ch, x + (Math.random() < 0.4 ? (Math.random() * 2 - 1) * jit : 0), y + (Math.random() < 0.4 ? (Math.random() * 2 - 1) * jit * 0.6 : 0)); x += cw; }
        } else g.fillText(row, x, y);
        y += lh;
      });
    }
    g.restore();

    // ▼ 계속
    if (this.arrow && Math.sin(this.arrowT * 5) > 0 && !this.input) {
      g.font = `24px ${FONT}`; g.fillStyle = green ? '#7dff8a' : '#c7e6ff'; g.textAlign = 'right';
      g.fillText('▼', W - MX, H - BOTTOM + 8); g.textAlign = 'left';
    }

    // 숨은 주석 (선택지가 없을 때 아래 빈 곳)
    if (this.hidden && !this.choices) this.drawHidden(g);

    // 가운데 안내
    if (this.center) {
      g.textAlign = 'center';
      g.font = `48px ${FONTB}`; g.fillStyle = green ? '#7dff8a' : '#c7e6ff';
      g.fillText(this.center[0], W / 2, H / 2 - 64);
      g.font = `24px ${FONT}`; g.fillStyle = green ? '#3fae4a' : '#6b8796';
      g.fillText(this.center[1], W / 2, H / 2 + 20);
      g.textAlign = 'left';
    }

    // 선택지
    const c = this.choices;
    if (c) {
      c.items.forEach((it, i) => {
        const [x, y, w, h] = it.rect;
        let hot = c.hover === i && !it.disabled;
        let alpha = it.disabled ? 0.35 : 1;
        if (c.locked) { if (i === c.blink) hot = Math.floor(c.blinkT / 0.08) % 2 === 0; else alpha = 0.25; }
        g.globalAlpha = alpha;
        g.fillStyle = '#9ecbe9'; g.fillRect(x, y, w, h);
        g.fillStyle = hot ? (it.unsettling ? '#f2d1d1' : '#c7ebff') : '#05101a';
        g.fillRect(x + 4, y + 4, w - 8, h - 8);
        let size = c.items.length >= 5 ? 40 : 46;
        g.font = `${size}px ${FONTB}`;
        while (g.measureText(it.text).width > w - 36 && size > 22) { size -= 4; g.font = `${size}px ${FONTB}`; }
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

    // 명령 입력 줄
    if (this.input) {
      const y = H - 96;
      g.fillStyle = green ? '#031a06' : '#04101a'; g.fillRect(MX - 8, y - 10, BW + 16, 64);
      g.font = `34px ${FONT}`; g.fillStyle = green ? '#7dff8a' : '#c7e6ff';
      const txt = (this.input.prompt || '> ') + this.input.value;
      g.fillText(txt, MX, y);
      if (Math.floor(time * 2) % 2 === 0) { const w = g.measureText(txt).width; g.fillRect(MX + w + 4, y + 2, 16, 32); }
    }

    if (this.mascot.on) this.drawMascot(g, time);
    this.drawCursor(g, false);
    this.drawOverlays(g);
  }

  drawCursor(g, maze) {
    if (maze || !this.cursor.visible || (!this.acceptInput && !this.demo) || this.input) return;
    const { x, y } = this.cursor;
    g.fillStyle = this.demo ? '#ffe2a0' : '#e6f6ff'; g.strokeStyle = '#020407'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 30); g.lineTo(x + 8, y + 23); g.lineTo(x + 14, y + 36); g.lineTo(x + 19, y + 33); g.lineTo(x + 13, y + 21); g.lineTo(x + 22, y + 21); g.closePath();
    g.fill(); g.stroke();
  }

  /** 말풍선 모양 + 점 눈 두 개 (오리지널 픽셀 마스코트) */
  drawMascot(g, time) {
    const ms = this.mascot;
    const S = 6, x0 = W - MX - 16 * S, y0 = TOP + 6 + Math.round(Math.sin(ms.t * 3) * (ms.talk > 0 ? 3 : 1.5));
    const shape = [
      '..############..',
      '.##############.',
      '################',
      '################',
      '################',
      '################',
      '################',
      '.##############.',
      '..#######.......',
      '...#####........',
      '....###.........',
      '.....#..........',
    ];
    const col = ms.green ? '#6dff7e' : '#ffd27a';
    const distort = ms.distort > 0;
    for (let r = 0; r < shape.length; r++) {
      const off = distort ? Math.round((Math.random() * 2 - 1) * 4) * S : 0;
      for (let c2 = 0; c2 < 16; c2++) if (shape[r][c2] === '#') { g.fillStyle = col; g.fillRect(x0 + c2 * S + off, y0 + r * S, S, S); }
    }
    // 눈
    g.fillStyle = '#05101a';
    const blink = ms.blink < 0;
    const eh = blink ? 1 : ms.cold ? 1 : 2;
    const ey = 3 + (2 - eh);
    if (distort) { g.fillRect(x0 + 3 * S, y0 + 2 * S, 3 * S, 4 * S); g.fillRect(x0 + 10 * S, y0 + 3 * S, 2 * S, 2 * S); }
    else { g.fillRect(x0 + 4 * S, y0 + ey * S, 2 * S, eh * S); g.fillRect(x0 + 10 * S, y0 + ey * S, 2 * S, eh * S); }
    if (ms.talk > 0 && !distort) { g.fillRect(x0 + 7 * S, y0 + 6 * S, 2 * S, Math.sin(time * 30) > 0 ? S : 0); }
  }

  drawHidden(g) {
    const h = this.hidden;
    g.font = `24px ${FONT}`;
    if (!h.chars) {
      h.chars = [];
      const tw = g.measureText(h.text).width;
      let x = W - MX - tw, y = H - 150;
      for (const ch of h.text) { const w = g.measureText(ch).width; h.chars.push({ ch, x: x + w / 2, y: y + 12, px: x, a: 0 }); x += w; }
    }
    for (const c of h.chars) {
      g.fillStyle = `rgba(150,240,210,${0.035 + c.a * 0.85})`;
      g.fillText(c.ch, c.px, c.y - 12);
    }
  }

  drawCard(g) {
    const c = this.card, k = c.t;
    g.fillStyle = '#020407'; g.fillRect(0, 0, W, H);
    // 부팅 글자
    g.font = `22px ${FONT}`; g.fillStyle = '#3d6474';
    const boot = ['SYNAPSE NIGHT QA · TERMINAL 117', 'MEM CHECK ........ OK', 'HR OVERSEER ...... ACTIVE', 'LOADING RECORD SET'];
    const nb = Math.min(boot.length, Math.floor(k / 0.18));
    for (let i = 0; i < nb; i++) g.fillText(boot[i], MX, 60 + i * 30);
    if (k > 0.8) {
      const a = Math.min(1, (k - 0.8) / 0.35);
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.font = `120px ${FONTB}`; g.fillStyle = '#c7e6ff';
      g.fillText(c.time, W / 2, H / 2 - 110);
      g.font = `30px ${FONT}`; g.fillStyle = '#7fa2b5';
      g.fillText(c.label, W / 2, H / 2 + 40);
      g.font = `52px ${FONTB}`; g.fillStyle = '#e8f6ff';
      g.fillText(c.title, W / 2, H / 2 + 88);
      g.textAlign = 'left'; g.globalAlpha = 1;
    }
    if (Math.random() < 0.15) { g.fillStyle = 'rgba(160,210,255,0.06)'; g.fillRect(0, Math.random() * H, W, 3 + Math.random() * 8); }
  }

  drawBsod(g) {
    g.fillStyle = '#0a2fae'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8f0ff'; g.font = `30px ${FONTB}`; g.textBaseline = 'top';
    const b = this.bsod;
    let y = 120;
    b.lines.forEach((l, i) => {
      if (b.t < i * 0.5) return;
      g.font = i === 0 ? `34px ${FONTB}` : `28px ${FONT}`;
      g.fillText(l, MX, y); y += i === 0 ? 70 : 48;
    });
    if (Math.floor(b.t * 2) % 2 === 0) g.fillRect(MX, y + 10, 18, 30);
  }

  drawOverlays(g) {
    if (this.crack > 0) {
      g.save();
      for (const c of this.cracks) {
        g.strokeStyle = 'rgba(230,245,255,0.75)'; g.lineWidth = c.w;
        g.beginPath(); g.moveTo(c.pts[0][0], c.pts[0][1]); for (const p of c.pts) g.lineTo(p[0], p[1]); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = c.w * 0.5;
        g.beginPath(); g.moveTo(c.pts[0][0] + 2, c.pts[0][1] + 2); for (const p of c.pts) g.lineTo(p[0] + 2, p[1] + 2); g.stroke();
      }
      if (this.crack >= 3) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H); }
      g.restore();
    }
    if (this.faceT > 0 && this.faceImg) {
      g.globalAlpha = 0.55;
      g.drawImage(this.faceImg, W * 0.18, H * 0.06, W * 0.64, H * 0.88);
      g.globalAlpha = 1;
    }
  }
}

export const TERM_W = W, TERM_H = H;

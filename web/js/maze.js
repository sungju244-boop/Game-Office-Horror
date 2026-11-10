// 경로 추적 미니게임 (오리지널 디자인).
// 검은 화면 = 감시 구간, 민트색 길 = 감시를 피해 가는 경로. 커서로 길을 따라가 도착점의 코드를 눌러 실행한다.
// 벽(검은 곳)에 닿으면 잡음과 함께 출발점으로 돌아간다. 시간은 계속 흐른다. 터미널 캔버스(1024×768)에 그린다.

const CELL = 32, OX = 0, OY = 96, ROWS = 17, COLS = 32;
const MAZE_H = ROWS * CELL; // 544 → 아래 640~736 은 미리보기 칸
const R = 5; // 커서 반지름
const FONT = "'Galmuri11', 'Malgun Gothic', sans-serif";
const FONTB = "'Galmuri11B', 'Galmuri11', 'Malgun Gothic', sans-serif";

// 길: 격자 칸 중심 좌표의 꺾은선 + 폭(칸). 도착점: key(결과), code(화면 글자), at(중심).
export const MAZES = {
  calibrate: {
    time: 45, start: [2.5, 8.5],
    paths: [{ w: 2.6, pts: [[2.5, 8.5], [9.5, 8.5], [9.5, 3.5], [18.5, 3.5], [18.5, 12.5], [25, 12.5]] }],
    goals: [{ key: 'done', code: 'calibrate()', at: [27.6, 12.5] }],
  },
  log01: {
    time: 25, start: [2.5, 8.5],
    paths: [
      { w: 2.8, pts: [[2.5, 8.5], [11.5, 8.5], [11.5, 2.5], [17, 2.5]] },
      { w: 1.05, pts: [[2.5, 8.5], [2.5, 14.5], [7.5, 14.5], [7.5, 11.5], [14.5, 11.5], [14.5, 15], [21.5, 15], [21.5, 10.5], [26, 10.5], [26, 14], [27, 14]] },
      { w: 1.05, hidden: true, pts: [[21.5, 10.5], [21.5, 6.5], [24.5, 6.5]] },
    ],
    goals: [
      { key: 'direct', code: 'send(direct)', at: [20.2, 2.5] },
      { key: 'subtle', code: 'send(subtle)', at: [28.6, 14] },
      { key: 'hidden', code: 'who_is_talking()', at: [28.2, 6.5], hidden: true },
    ],
  },
  log02: {
    time: 25, start: [2.5, 8.5],
    paths: [
      { w: 2.8, pts: [[2.5, 8.5], [11.5, 8.5], [11.5, 14], [17, 14]] },
      { w: 1.05, pts: [[2.5, 8.5], [2.5, 2.5], [8.5, 2.5], [8.5, 5.5], [15.5, 5.5], [15.5, 1.5], [22.5, 1.5], [22.5, 6.5], [26, 6.5], [26, 3], [27, 3]] },
    ],
    goals: [
      { key: 'direct', code: 'send(direct)', at: [20.2, 14] },
      { key: 'subtle', code: 'send(subtle)', at: [28.6, 3] },
    ],
  },
  log03: {
    time: 25, start: [2.5, 8.5],
    paths: [
      { w: 2.6, pts: [[2.5, 8.5], [8.5, 8.5], [8.5, 14.5], [15, 14.5]] },
      { w: 0.95, pts: [[2.5, 8.5], [2.5, 3.5], [6.5, 3.5], [6.5, 1.5], [12.5, 1.5], [12.5, 6.5], [17.5, 6.5], [17.5, 2.5], [23.5, 2.5], [23.5, 9.5], [20.5, 9.5], [20.5, 11.5], [27, 11.5]] },
      { w: 0.95, pts: [[12.5, 6.5], [12.5, 10.5], [14.5, 10.5]] },   // 막다른 길
      { w: 0.95, pts: [[23.5, 9.5], [27.5, 9.5], [27.5, 7]] },        // 막다른 길
      { w: 0.95, hidden: true, pts: [[23.5, 2.5], [25.2, 2.5]] },
    ],
    goals: [
      { key: 'direct', code: 'send(direct)', at: [18.2, 14.5] },
      { key: 'subtle', code: 'send(subtle)', at: [28.6, 11.5] },
      { key: 'hidden', code: 'who_is_talking()', at: [28.6, 2.5], hidden: true },
    ],
  },
  log04: {
    time: 25, start: [2.5, 8.5],
    paths: [
      { w: 2.8, pts: [[2.5, 8.5], [12.5, 8.5], [12.5, 3], [17, 3]] },
      { w: 1.0, pts: [[2.5, 8.5], [2.5, 14.5], [9.5, 14.5], [9.5, 11.5], [16.5, 11.5], [16.5, 15], [23.5, 15], [23.5, 9.5], [27, 9.5]] },
    ],
    goals: [
      { key: 'direct', code: 'send(direct)', at: [20.2, 3] },
      { key: 'subtle', code: 'send(subtle)', at: [28.6, 9.5] },
    ],
  },
  log05: {
    time: 25, start: [2.5, 8.5],
    paths: [
      { w: 2.6, pts: [[2.5, 8.5], [7.5, 8.5], [7.5, 2.5], [14, 2.5]] },
      { w: 0.85, pts: [[2.5, 8.5], [2.5, 14.5], [6.5, 14.5], [6.5, 11.5], [10.5, 11.5], [10.5, 15.2], [14.5, 15.2], [14.5, 8.5], [18.5, 8.5], [18.5, 13.5], [22.5, 13.5], [22.5, 5.5], [25.5, 5.5], [25.5, 12.5], [27, 12.5]] },
      { w: 0.85, pts: [[14.5, 8.5], [14.5, 5.5], [11.5, 5.5]] },     // 막다른 길
      { w: 0.85, pts: [[18.5, 13.5], [18.5, 15.6]] },                 // 막다른 길
      { w: 0.85, hidden: true, pts: [[22.5, 5.5], [22.5, 1.5], [24.6, 1.5]] },
    ],
    goals: [
      { key: 'direct', code: 'send(direct)', at: [17.2, 2.5] },
      { key: 'subtle', code: 'send(subtle)', at: [28.6, 12.5] },
      { key: 'hidden', code: 'who_is_talking()', at: [28.6, 1.5], hidden: true },
    ],
  },
};

const px = (gx) => OX + gx * CELL;
const py = (gy) => OY + gy * CELL;

/** 꺾은선 → 축 정렬 사각형들 [x, y, w, h] (캔버스 px) */
function pathRects(path) {
  const out = [], hw = (path.w * CELL) / 2;
  for (let i = 0; i < path.pts.length - 1; i++) {
    const [ax, ay] = path.pts[i], [bx, by] = path.pts[i + 1];
    const x0 = Math.min(px(ax), px(bx)) - hw, x1 = Math.max(px(ax), px(bx)) + hw;
    const y0 = Math.min(py(ay), py(by)) - hw, y1 = Math.max(py(ay), py(by)) + hw;
    out.push([x0, y0, x1 - x0, y1 - y0]);
  }
  return out;
}

export class Maze {
  /**
   * def: MAZES[id]. opts: { time, previews: {subtle, direct}, labels, chicken, relative, drag, kind, sfx(name, vol), onHit(), onHidden(), onDrag(), hint }
   */
  constructor(def, opts) {
    this.def = def; this.o = opts;
    this.time = opts.time ?? def.time; this.left = this.time;
    this.rects = []; this.hiddenRects = [];
    // 도착점 가까이 끝나는 길은 도착 상자 중심까지 이어 준다 (글꼴 폭이 달라도 길과 상자가 붙어 있게)
    const paths = def.paths.map((p) => ({ ...p, pts: p.pts.slice() }));
    for (const gd of def.goals) {
      let best = null, bd = 5;
      for (const p of paths) {
        const e = p.pts[p.pts.length - 1], d = Math.hypot(e[0] - gd.at[0], e[1] - gd.at[1]);
        if (d < bd && !!p.hidden === !!gd.hidden) { bd = d; best = p; }
      }
      if (best) {
        const e = best.pts[best.pts.length - 1];
        if (e[1] !== gd.at[1]) best.pts.push([e[0], gd.at[1]]);
        best.pts.push([gd.at[0], gd.at[1]]);
      }
    }
    for (const p of paths) (p.hidden ? this.hiddenRects : this.rects).push(...pathRects(p));
    this.start = [px(def.start[0]) - CELL, py(def.start[1]) - CELL, CELL * 2, CELL * 2];
    this.rects.push(this.start);
    this.goals = def.goals.map((gd) => ({ ...gd, rect: null, label: gd.code }));
    this.measured = false;
    this.cursor = { x: px(def.start[0]), y: py(def.start[1]) };
    this.trail = [];
    this.engaged = false; this.freeze = 0; this.hitFlash = 0; this.noise = 0;
    this.hover = -1; this.result = null; this.revealed = 0; this.hiddenUsed = false;
    this.dragging = null; this.dragDone = !opts.drag; this.dragAt = this.time * (0.42 + Math.random() * 0.12);
    this.bubble = null; this.t = 0; this.blink = 0; this.sweep = 0;
    this.resolve = null;
    this.promise = new Promise((r) => { this.resolve = r; });
  }

  measure(g) {
    g.font = `24px ${FONTB}`;
    for (const gl of this.goals) {
      const w = Math.ceil(g.measureText(gl.label).width) + 28, h = 50;
      const x = Math.max(6, Math.min(1018 - w, px(gl.at[0]) - w / 2)); // 화면 밖으로 나가지 않게
      gl.rect = [x, py(gl.at[1]) - h / 2, w, h];
      (gl.hidden ? this.hiddenRects : this.rects).push(gl.rect);
    }
    this.measured = true;
  }

  // ---------- 판정 ----------
  insideAny(x, y, list, m = 3) {
    for (const [rx, ry, rw, rh] of list) if (x >= rx + m && x <= rx + rw - m && y >= ry + m && y <= ry + rh - m) return true;
    return false;
  }
  onPath(x, y) {
    return this.insideAny(x, y, this.rects) || (this.revealed > 0.5 && !this.hiddenUsed && this.insideAny(x, y, this.hiddenRects));
  }
  goalAt(x, y) {
    for (let i = 0; i < this.goals.length; i++) {
      const gl = this.goals[i];
      if (!gl.rect || (gl.hidden && (this.hiddenUsed || this.revealed < 0.5))) continue;
      const [rx, ry, rw, rh] = gl.rect;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return i;
    }
    return -1;
  }
  inStart(x, y) { const [rx, ry, rw, rh] = this.start; return x >= rx - 6 && x <= rx + rw + 6 && y >= ry - 6 && y <= ry + rh + 6; }

  // ---------- 입력 ----------
  /** 절대 좌표(포인터 잠금 아님) 또는 상대 이동(포인터 잠금)으로 커서를 옮긴다 */
  moveTo(nx, ny) {
    if (this.result || this.dragging) return;
    nx = Math.max(2, Math.min(1022, nx)); ny = Math.max(2, Math.min(766, ny));
    const c = this.cursor;
    if (this.engaged && this.freeze <= 0) {
      const steps = Math.max(1, Math.ceil(Math.hypot(nx - c.x, ny - c.y) / 3));
      for (let k = 1; k <= steps; k++) {
        const x = c.x + ((nx - c.x) * k) / steps, y = c.y + ((ny - c.y) * k) / steps;
        if (!this.onPath(x, y)) { c.x = x; c.y = y; this.wallHit(true); return; }
      }
    }
    if (this.freeze > 0 && this.o.relative) return;
    c.x = nx; c.y = ny;
    this.trail.push([nx, ny]); if (this.trail.length > 10) this.trail.shift();
    this.updateHover();
  }
  moveBy(dx, dy) { this.moveTo(this.cursor.x + dx, this.cursor.y + dy); }
  updateHover() {
    const h = this.goalAt(this.cursor.x, this.cursor.y);
    if (h !== this.hover) { this.hover = h; if (h >= 0) this.o.sfx?.('sfx_ui_hover', 0.25); }
  }
  click() {
    if (this.result || this.dragging) return;
    const c = this.cursor;
    if (!this.engaged) {
      if (this.inStart(c.x, c.y)) {
        this.engaged = true; this.freeze = 0;
        if (!this.o.relative) { /* 절대 좌표: 커서가 있는 자리에서 시작 */ }
        else { c.x = px(this.def.start[0]); c.y = py(this.def.start[1]); }
        this.o.sfx?.('sfx_ui_select', 0.35);
      } else this.o.sfx?.('sfx_click', 0.2);
      return;
    }
    const gi = this.goalAt(c.x, c.y);
    if (gi < 0) return;
    const gl = this.goals[gi];
    if (gl.key === 'hidden') {
      this.hiddenUsed = true; this.hover = -1;
      this.o.sfx?.('sfx_static_2', 0.5);
      this.toStart();
      this.o.onHidden?.(this);
      return;
    }
    this.o.sfx?.('sfx_ui_select', 0.5);
    this.finish(gl.key);
  }

  toStart() {
    this.cursor.x = px(this.def.start[0]); this.cursor.y = py(this.def.start[1]); this.trail = [];
    if (this.o.relative) { this.engaged = true; this.freeze = 0.35; }
    else this.engaged = false;
  }

  wallHit(counted) {
    this.hitFlash = 0.45; this.noise = 0.5;
    this.o.sfx?.('sfx_maze_hit', 0.7);
    this.toStart();
    if (counted) this.o.onHit?.(this);
  }

  finish(key) {
    if (this.result) return;
    this.result = key;
    setTimeout(() => this.resolve(key), key === 'timeout' ? 900 : 650);
  }
  abort(key) { if (this.result) return; this.result = key; this.resolve(key); }

  say(text, dur = 3.2) { this.bubble = { text, t: dur }; }

  /** 커서가 혼자 벽 쪽으로 끌려간다 (연출). 끌려가서 닿은 건 충돌로 세지 않는다 */
  drag(speed = 260) {
    const c = this.cursor;
    let best = null, bd = 1e9;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      for (let d = 4; d < 220; d += 4) {
        const x = c.x + Math.cos(ang) * d, y = c.y + Math.sin(ang) * d;
        if (!this.onPath(x, y)) { if (d < bd) { bd = d; best = [Math.cos(ang), Math.sin(ang)]; } break; }
      }
    }
    if (!best) best = [1, 0];
    this.dragging = { dir: best, speed, t: 0 };
    this.o.sfx?.('sfx_static_3', 0.45);
  }

  update(dt) {
    this.t += dt; this.blink += dt; this.sweep = (this.sweep + dt * 0.18) % 1;
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    this.hitFlash = Math.max(0, this.hitFlash - dt); this.noise = Math.max(0, this.noise - dt);
    if (this.freeze > 0) this.freeze -= dt;
    if (this.result) return;
    // 숨은 길: 가까이 가면 서서히 드러난다
    if (this.hiddenRects.length && !this.hiddenUsed) {
      let near = false;
      for (const [rx, ry, rw, rh] of this.hiddenRects) {
        const dx = Math.max(rx - this.cursor.x, 0, this.cursor.x - (rx + rw)), dy = Math.max(ry - this.cursor.y, 0, this.cursor.y - (ry + rh));
        if (Math.hypot(dx, dy) < 70) { near = true; break; }
      }
      this.revealed = Math.max(0, Math.min(1, this.revealed + (near ? dt * 1.6 : -dt * 0.5)));
    }
    if (this.dragging) {
      const d = this.dragging; d.t += dt;
      const c = this.cursor, st = d.speed * dt;
      const nx = c.x + d.dir[0] * st, ny = c.y + d.dir[1] * st;
      c.x = nx; c.y = ny; this.trail.push([nx, ny]); if (this.trail.length > 10) this.trail.shift();
      if (!this.onPath(nx, ny) || d.t > 1.6) { this.dragging = null; this.wallHit(false); }
      return;
    }
    this.left -= dt;
    if (!this.dragDone && this.engaged && this.time - this.left >= this.dragAt) { this.dragDone = true; this.o.onDrag?.(this); }
    if (this.left <= 0) { this.left = 0; this.o.sfx?.('sfx_static_1', 0.6); this.finish('timeout'); }
  }

  // ---------- 그리기 ----------
  draw(g, time) {
    if (!this.measured) this.measure(g);
    // 감시 구간: 검은 바탕에 아주 옅은 점 격자 + 내려가는 감시선
    g.fillStyle = '#010304'; g.fillRect(0, OY - 6, 1024, MAZE_H + 12);
    g.fillStyle = 'rgba(70,110,120,0.12)';
    for (let y = OY + CELL / 2; y < OY + MAZE_H; y += CELL) for (let x = CELL / 2; x < 1024; x += CELL) g.fillRect(x - 1, y - 1, 2, 2);
    const sy = OY + this.sweep * MAZE_H;
    const grd = g.createLinearGradient(0, sy - 40, 0, sy);
    grd.addColorStop(0, 'rgba(255,60,60,0)'); grd.addColorStop(1, 'rgba(255,70,70,0.10)');
    g.fillStyle = grd; g.fillRect(0, sy - 40, 1024, 40);
    // 길
    const flash = this.hitFlash > 0 && Math.floor(this.hitFlash * 20) % 2 === 0;
    g.fillStyle = flash ? '#7a2e2e' : '#11a88c';
    for (const [x, y, w, h] of this.rects) g.fillRect(x, y, w, h);
    g.fillStyle = flash ? '#a54848' : '#19c9a6';
    for (const [x, y, w, h] of this.rects) g.fillRect(x + 3, y + 3, w - 6, h - 6);
    if (this.hiddenRects.length && !this.hiddenUsed) {
      g.globalAlpha = 0.1 + this.revealed * 0.75;
      g.fillStyle = '#138f78';
      for (const [x, y, w, h] of this.hiddenRects) g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
    }
    // 출발점
    const [sx, sy2, sw, sh] = this.start;
    const sb = !this.engaged && Math.sin(this.blink * 6) > 0;
    g.fillStyle = sb ? '#e8fff8' : '#0b3b33'; g.fillRect(sx, sy2, sw, sh);
    g.fillStyle = sb ? '#04110e' : '#a6ffe9';
    g.font = `20px ${FONTB}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('▶', sx + sw / 2, sy2 + sh / 2);
    // 도착점 (코드 블록)
    g.font = `24px ${FONTB}`;
    this.goals.forEach((gl, i) => {
      if (!gl.rect) return;
      if (gl.hidden && (this.hiddenUsed || this.revealed < 0.05)) return;
      const [x, y, w, h] = gl.rect;
      const hot = this.hover === i;
      g.globalAlpha = gl.hidden ? 0.15 + this.revealed * 0.85 : 1;
      g.fillStyle = hot ? '#d9fff5' : '#03211c'; g.fillRect(x, y, w, h);
      g.strokeStyle = gl.hidden ? '#5fd1ff' : '#5ef2cf'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      g.fillStyle = hot ? '#03211c' : (gl.hidden ? '#9fe3ff' : '#c9fff0');
      g.fillText(gl.label, x + w / 2, y + h / 2 + 1);
      g.globalAlpha = 1;
    });
    g.textAlign = 'left'; g.textBaseline = 'top';
    // 커서 (점 + 꼬리)
    const c = this.cursor;
    for (let i = 0; i < this.trail.length; i++) {
      const [tx, ty] = this.trail[i]; g.globalAlpha = (i / this.trail.length) * 0.35;
      g.fillStyle = '#bffff0'; g.beginPath(); g.arc(tx, ty, R * 0.8, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = this.engaged ? '#ffffff' : '#9fb8b2';
    g.beginPath(); g.arc(c.x, c.y, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = this.engaged ? 'rgba(120,255,220,0.8)' : 'rgba(120,160,150,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.arc(c.x, c.y, R + 4, 0, Math.PI * 2); g.stroke();
    // 위쪽 시간 막대
    const k = this.left / this.time;
    g.fillStyle = '#0d1f1c'; g.fillRect(64, 78, 896, 10);
    g.fillStyle = k > 0.5 ? '#3ff0c8' : k > 0.25 ? '#ffc35c' : '#ff5a4a';
    g.fillRect(64, 78, 896 * k, 10);
    // 아래 미리보기 칸
    const ly = OY + MAZE_H + 8;
    g.fillStyle = '#04100e'; g.fillRect(64, ly, 896, 88);
    g.strokeStyle = '#1f5a50'; g.lineWidth = 2; g.strokeRect(65, ly + 1, 894, 86);
    g.font = `22px ${FONT}`;
    const L = this.o.labels || {};
    if (this.hover >= 0) {
      const gl = this.goals[this.hover];
      const text = gl.key === 'hidden' ? (L.hidden || '?') : gl.key === 'done' ? (L.done || '') : (this.o.previews?.[gl.key] || '');
      g.font = `18px ${FONT}`;
      g.fillStyle = '#7ff5d8'; g.fillText(gl.label + '  →', 84, ly + 10);
      g.fillStyle = '#5c8f86'; g.textAlign = 'right'; g.fillText(this.engaged ? (L.click || '') : '', 940, ly + 10); g.textAlign = 'left';
      g.font = `22px ${FONT}`;
      g.fillStyle = '#e8fff9'; wrapText(g, text, 84, ly + 36, 856, 26, 2);
    } else {
      g.fillStyle = '#5c8f86';
      g.fillText(this.engaged ? (L.goal || '') : (L.start || ''), 84, ly + 14);
      if (this.o.status) { g.fillStyle = '#87a8a1'; g.fillText(this.o.status(), 84, ly + 50); }
    }
    // 가이드 말풍선 (숨은 노드 반응)
    if (this.bubble) {
      g.globalAlpha = Math.min(1, this.bubble.t * 2);
      g.font = `26px ${FONTB}`;
      const w = Math.min(860, g.measureText(this.bubble.text).width + 40);
      g.fillStyle = 'rgba(2,10,9,0.92)'; g.fillRect(512 - w / 2, OY + 14, w, 52);
      g.strokeStyle = '#ffe08a'; g.lineWidth = 2; g.strokeRect(512 - w / 2 + 1, OY + 15, w - 2, 50);
      g.fillStyle = '#ffe9b0'; g.textAlign = 'center'; g.fillText(this.bubble.text, 512, OY + 26); g.textAlign = 'left';
      g.globalAlpha = 1;
    }
    // 벽에 닿은 순간의 잡음
    if (this.noise > 0) {
      const n = this.noise * 2;
      for (let i = 0; i < 70 * n; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.7)';
        g.fillRect(Math.random() * 1024, OY + Math.random() * MAZE_H, 20 + Math.random() * 160, 2 + Math.random() * 5);
      }
    }
    if (this.result === 'timeout') {
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(0, OY, 1024, MAZE_H);
      g.font = `44px ${FONTB}`; g.fillStyle = '#ff7a6a'; g.textAlign = 'center';
      g.fillText(L.timeout || 'TIMEOUT', 512, OY + MAZE_H / 2 - 22); g.textAlign = 'left';
    }
  }
}

export function wrapText(g, text, x, y, maxW, lh, maxLines = 3) {
  const words = String(text).split(/(\s+)/);
  let line = '', n = 0;
  for (const w of words) {
    if (g.measureText(line + w).width > maxW && line.trim()) {
      g.fillText(line, x, y); y += lh; n++; line = w.trimStart();
      if (n >= maxLines) return;
    } else line += w;
  }
  if (line) g.fillText(line, x, y);
}

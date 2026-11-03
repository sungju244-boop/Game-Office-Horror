// office_layout.json → three.js 사무실 (Unity 판 OfficeBuilder / PropFactory 와 같은 배치·치수).
import { THREE, D, place, boxGeo, frustumGeo, sag, tubeGeo, crtMaterial } from './kit.js';

// ---------- 상호작용 대상 ----------
export class Interactable {
  constructor(id) { this.id = id; this.handlers = []; }
  add(prompt, can, use, priority = 0, owner = null) { this.handlers.push({ prompt, can, use, priority, owner }); }
  removeOwner(owner) { this.handlers = this.handlers.filter((h) => h.owner !== owner); }
  active() {
    let best = null;
    for (const h of this.handlers) { if (h.can && !h.can()) continue; if (!best || h.priority > best.priority) best = h; }
    return best;
  }
}

// ---------- 재질 ----------
const C = (r, g, b) => new THREE.Color(r, g, b);
export class MatLib {
  constructor(textures, lang = 'ko') { this.textures = textures; this.lang = lang; this.cache = new Map(); this.made = []; }
  tex(name, worldSize = 0, point = true) {
    const base = (this.lang === 'en' && this.textures.get(name + '_en')) || this.textures.get(name);
    if (!base) return null;
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const s = worldSize > 0 ? 1 / worldSize : 1;
    t.repeat.set(s, s);
    t.magFilter = point ? THREE.NearestFilter : THREE.LinearFilter;
    t.minFilter = point ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    this.made.push(t);
    return t;
  }
  get(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const m = this.create(key);
    m.userData.shared = true;
    this.cache.set(key, m);
    return m;
  }
  lit(tex, color, ws, gloss, emissive = null, emissiveTex = null) {
    const map = tex ? this.tex(tex, ws) : null;
    const opts = { color, map };
    if (emissive) { opts.emissive = emissive; opts.emissiveIntensity = 1; if (emissiveTex) opts.emissiveMap = this.tex(emissiveTex, 0); }
    if (gloss >= 0.3) return new THREE.MeshPhongMaterial({ ...opts, shininess: 10 + gloss * 70, specular: C(0.18, 0.2, 0.22) });
    return new THREE.MeshLambertMaterial(opts);
  }
  create(key) {
    switch (key) {
      case 'carpet': return this.lit('carpet', C(0.62, 0.67, 0.78), 1.0, 0.02);
      case 'floor_tile': return this.lit('floor_tile', C(0.62, 0.64, 0.66), 0.6, 0.25);
      case 'ceiling': return this.lit('ceiling_tile', C(0.78, 0.8, 0.83), 1.2, 0.02);
      case 'ceiling_dark': return this.lit('ceiling_tile', C(0.45, 0.47, 0.5), 1.2, 0.02);
      case 'wall': return this.lit('wall', C(0.72, 0.76, 0.8), 2.0, 0.05);
      case 'wall_dark': return this.lit('wall', C(0.48, 0.51, 0.55), 2.0, 0.05);
      case 'baseboard': return this.lit(null, C(0.11, 0.12, 0.13), 1, 0.2);
      case 'desk_top': return this.lit('desk_top', C(0.74, 0.74, 0.71), 1.0, 0.3);
      case 'metal': return this.lit('metal', C(0.55, 0.58, 0.6), 1.0, 0.35);
      case 'metal_dark': return this.lit('metal', C(0.2, 0.21, 0.23), 1.0, 0.35);
      case 'plastic': return this.lit('plastic', C(0.8, 0.76, 0.66), 0.5, 0.25);
      case 'plastic_dark': return this.lit('plastic', C(0.2, 0.2, 0.21), 0.5, 0.25);
      case 'fabric': return this.lit('fabric', C(0.33, 0.37, 0.45), 0.6, 0.02);
      case 'fabric_chair': return this.lit('fabric', C(0.13, 0.14, 0.17), 0.6, 0.02);
      case 'door': return this.lit('door', C(0.7, 0.73, 0.76), 0, 0.2);
      case 'door_exit': return this.lit('door', C(0.42, 0.46, 0.44), 0, 0.2);
      case 'cardboard': return this.lit('cardboard', C(0.6, 0.5, 0.38), 0.6, 0.02);
      case 'paper': return this.lit(null, C(0.8, 0.8, 0.76), 1, 0.05);
      case 'black': return this.lit(null, C(0.015, 0.015, 0.018), 1, 0.1);
      case 'cable': return this.lit(null, C(0.03, 0.03, 0.035), 1, 0.45);
      case 'screen_dead': return new THREE.MeshPhongMaterial({ color: C(0.025, 0.03, 0.035), shininess: 90, specular: C(0.6, 0.65, 0.7) });
      case 'water': return this.lit(null, C(0.35, 0.5, 0.62), 1, 0.8);
      case 'cloth': return this.lit(null, C(0.1, 0.11, 0.13), 1, 0.05);
      case 'skin': return this.lit(null, C(0.52, 0.43, 0.38), 1, 0.1);
      case 'hole': return new THREE.MeshBasicMaterial({ color: 0x000000 });
      case 'cat_fur': return this.lit('cat_fur', C(0.78, 0.78, 0.8), 0, 0.05);
      case 'cat_white': return this.lit(null, C(0.9, 0.9, 0.88), 1, 0.05);
      case 'cat_pink': return this.lit(null, C(0.85, 0.55, 0.6), 1, 0.1);
      case 'cat_eye': return this.lit(null, C(0.02, 0.02, 0.02), 1, 0.9);
      case 'monster_skin': return this.lit('monster_skin', C(0.5, 0.48, 0.5), 0, 0.35);
      case 'monster_bone': return this.lit(null, C(0.32, 0.3, 0.28), 1, 0.2);
      case 'keyboard_top': return this.lit('keyboard', C(1, 1, 1), 0, 0.2);
      case 'tower_front': return this.lit('tower_front', C(1, 1, 1), 0, 0.2);
      case 'notice': return this.lit('notice', C(1, 1, 1), 0, 0.05);
      case 'badge117': return this.lit('badge117', C(1, 1, 1), 0, 0.2);
      case 'badge116': return this.lit('badge116', C(1, 1, 1), 0, 0.2);
      case 'sticky': return this.lit('sticky', C(1, 1, 1), 0, 0.02);
      case 'clock_face': return this.lit('clock_face', C(1, 1, 1), 0, 0.2);
      case 'sign_room': return this.lit('sign_room', C(1, 1, 1), 0, 0.2);
      case 'panel': return this.lit('panel', C(1, 1, 1), 0, 0.2);
      case 'elevator': return this.lit('elevator', C(1, 1, 1), 0, 0.5);
      case 'calendar': return this.lit('calendar', C(1, 1, 1), 0, 0.05);
      case 'window_night': return new THREE.MeshBasicMaterial({ map: this.tex('window_night', 0, false), color: C(0.55, 0.6, 0.75), fog: false });
      case 'exit_sign': return new THREE.MeshBasicMaterial({ map: this.tex('exit_sign', 0), color: C(0.9, 1.25, 0.95) });
      case 'led_red': return new THREE.MeshBasicMaterial({ color: C(1.0, 0.12, 0.08) });
      case 'led_green': return new THREE.MeshBasicMaterial({ color: C(0.2, 1.0, 0.35) });
      case 'led_amber': return new THREE.MeshBasicMaterial({ color: C(1.0, 0.6, 0.12) });
    }
    console.warn('정의되지 않은 재질', key);
    return new THREE.MeshLambertMaterial({ color: 0xff00ff });
  }
}

// ---------- 조명 ----------
export class CeilingLight {
  constructor(light, panelMat, base, level, flicker) {
    this.light = light; this.panelMat = panelMat; this.base = base; this.flicker = flicker;
    this.level = level; this.from = level; this.to = level; this.t = 1; this.dur = 1; this.mul = 1; this.timer = 0;
    // ext: 깜짝 장면의 정전(0) · minLevel/calm: 겁쟁이 모드(항상 밝게, 깜빡임 없음). 이야기의 조명 값(level·flicker)은 그대로 둔다.
    this.ext = 1; this.minLevel = 0; this.calm = false;
    this.apply();
  }
  fadeTo(level, time) { this.from = this.level; this.to = Math.max(0, level); this.t = 0; this.dur = Math.max(0.01, time); }
  update(dt) {
    if (this.t < 1) { this.t = Math.min(1, this.t + dt / this.dur); this.level = this.from + (this.to - this.from) * this.t; }
    if (this.flicker && !this.calm && this.level > 0.01) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const off = Math.random() < 0.35;
        this.mul = off ? Math.random() * 0.25 : 0.75 + Math.random() * 0.3;
        this.timer = off ? 0.03 + Math.random() * 0.09 : 0.08 + Math.random() * 1.5;
      }
    } else this.mul = 1;
    this.apply();
  }
  apply() {
    const k = Math.max(this.level, this.minLevel) * this.mul * this.ext;
    this.light.intensity = this.base * k;
    if (this.panelMat) this.panelMat.emissiveIntensity = Math.min(1, k) * 1.1;
  }
}

// ---------- 문 ----------
export class Door {
  constructor(id, pivot, baseYaw, openYaw, locked) {
    this.id = id; this.pivot = pivot; this.baseYaw = baseYaw; this.openYaw = openYaw; this.locked = locked;
    this.amount = 0; this.from = 0; this.to = 0; this.t = 1; this.dur = 1; this.busy = false;
    this.led = null; this.ledLight = null; this.ledRed = null; this.ledGreen = null;
    this.hinge = null; this.width = 1; this.dir = 'x';
    this.applyRot();
  }
  setOpen(amount, time) { this.from = this.amount; this.to = Math.min(1, Math.max(0, amount)); this.t = 0; this.dur = Math.max(0.01, time); this.busy = true; }
  setLocked(l) {
    this.locked = l;
    if (this.led) this.led.material = l ? this.ledRed : this.ledGreen;
    if (this.ledLight) this.ledLight.color.set(l ? 0xff2a1a : 0x33ff66);
  }
  update(dt) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const e = this.t * this.t * (3 - 2 * this.t);
      this.amount = this.from + (this.to - this.from) * e;
      this.applyRot();
      if (this.t >= 1) this.busy = false;
    }
  }
  applyRot() { this.pivot.rotation.y = -(this.baseYaw + this.openYaw * this.amount) * D; }
}

export class MonitorScreen {
  constructor(mesh, deadMat, glow) { this.mesh = mesh; this.deadMat = deadMat; this.glow = glow; this.live = null; this.isOn = false; this.p = 0; this.target = 0; this.speed = 1; }
  turnOn(tex, tint, brightness, time) {
    if (!this.live) this.live = crtMaterial(tex, tint, brightness, 0);
    else this.live.uniforms.map.value = tex;
    this.mesh.material = this.live; this.isOn = true; this.target = 1; this.speed = 1 / Math.max(0.01, time);
  }
  turnOff(time) { this.isOn = false; this.target = 0; this.speed = 1 / Math.max(0.01, time); }
  update(dt, time) {
    if (!this.live) return;
    this.p += Math.sign(this.target - this.p) * Math.min(Math.abs(this.target - this.p), this.speed * dt);
    this.live.uniforms.power.value = this.p;
    this.live.uniforms.time.value = time;
    if (this.glow) this.glow.intensity = 0.9 * this.p;
    if (!this.isOn && this.p <= 0.001) this.mesh.material = this.deadMat;
  }
}

// ---------- 충돌 격자 (Tools/check_layout.py 와 같은 규칙) ----------
const RES = 0.05, X0 = -8, X1 = 8, Z0 = -8.5, Z1 = 14;
export class CollisionGrid {
  constructor() {
    this.w = Math.round((X1 - X0) / RES); this.h = Math.round((Z1 - Z0) / RES);
    this.block = new Uint8Array(this.w * this.h);
    this.floor = new Uint8Array(this.w * this.h);
    this.doors = [];
  }
  cell(x, z) { return [Math.floor((z - Z0) / RES), Math.floor((x - X0) / RES)]; }
  rect(cx, cz, sx, sz, yawDeg, arr) {
    const r = yawDeg * D, cs = Math.cos(r), sn = Math.sin(r);
    const hx = sx / 2, hz = sz / 2;
    const ext = Math.abs(hx * cs) + Math.abs(hz * sn) + RES, extz = Math.abs(hx * sn) + Math.abs(hz * cs) + RES;
    const [j0, i0] = this.cell(cx - ext, cz - extz), [j1, i1] = this.cell(cx + ext, cz + extz);
    for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
        const x = X0 + (i + 0.5) * RES - cx, z = Z0 + (j + 0.5) * RES - cz;
        // Unity 회전의 역: (x,z) 를 -yaw 만큼
        const lx = x * cs - z * sn, lz = x * sn + z * cs;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) arr[j * this.w + i] = 1;
      }
    }
  }
  blocked(x, z) {
    const [j, i] = this.cell(x, z);
    if (j < 0 || i < 0 || j >= this.h || i >= this.w) return true;
    const k = j * this.w + i;
    return this.block[k] === 1 || this.floor[k] === 0;
  }
  doorBlocks(x, z, r) {
    for (const d of this.doors) {
      if (d.door.amount > 0.45) continue;
      const ax = d.x0, az = d.z0, bx = d.x1, bz = d.z1;
      const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz;
      let t = ((x - ax) * vx + (z - az) * vz) / len2; t = Math.max(0, Math.min(1, t));
      const px = ax + vx * t - x, pz = az + vz * t - z;
      if (px * px + pz * pz < (r + 0.03) * (r + 0.03)) return true;
    }
    return false;
  }
  circleFree(x, z, r) {
    if (this.blocked(x, z)) return false;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (this.blocked(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
      if (this.blocked(x + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5)) return false;
    }
    return !this.doorBlocks(x, z, r);
  }
  lineFree(ax, az, bx, bz, r) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.1));
    for (let k = 1; k <= n; k++) { const t = k / n; if (!this.circleFree(ax + (bx - ax) * t, az + (bz - az) * t, r)) return false; }
    return true;
  }
}

// ---------- 소품 공장 ----------
class Factory {
  constructor(mats) { this.M = mats; }
  node(parent, name, lp = [0, 0, 0], yaw = 0) {
    const g = new THREE.Group(); g.name = name; place(g, lp, [0, yaw, 0]); parent.add(g); return g;
  }
  mesh(parent, geo, mat, lp, euler, shadow = true) {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? this.M.get(mat) : mat);
    place(m, lp, euler); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  }
  box(parent, size, lp, mat, euler = [0, 0, 0], uvWorld = 1) { return this.mesh(parent, boxGeo(size[0], size[1], size[2], uvWorld), mat, lp, euler); }
  quad(parent, size, lp, euler, mat) {
    const m = this.mesh(parent, new THREE.PlaneGeometry(size[0], size[1]), mat, lp, euler, false);
    return m;
  }
  cyl(parent, r, h, lp, mat, euler = [0, 0, 0], sides = 10) { return this.mesh(parent, new THREE.CylinderGeometry(r, r, h, sides), mat, lp, euler); }
  cable(parent, pts, radius = 0.011) { return this.mesh(parent, tubeGeo(pts, radius), 'cable', [0, 0, 0], [0, 0, 0]); }
}

/** 보이지 않는 상호작용·가림 판정용 상자 */
function proxy(reg, parent, center, size, it = null) {
  const m = new THREE.Mesh(boxGeo(size[0], size[1], size[2], 0), reg.proxyMat);
  place(m, center); m.visible = false; m.userData.it = it; m.userData.dynamic = true;
  parent.add(m); reg.hit.push(m); return m;
}

// ---------- 빌드 ----------
export function buildWorld(layout, mats, scene) {
  const F = new Factory(mats);
  const reg = {
    root: new THREE.Group(), anchors: new Map(), doors: new Map(), its: new Map(), lights: new Map(), drawers: new Map(),
    dead: [], hit: [], ceiling: [], grid: new CollisionGrid(), proxyMat: new THREE.MeshBasicMaterial({ visible: false }),
    live: null, crtLight: null, crtGlow: null, chairSeat: null, cctv: null, cctvMonitor: null, clock: null, avatar: null,
  };
  reg.root.name = 'World';
  scene.add(reg.root);
  const root = reg.root;
  const anchor = (id, obj) => { if (id) reg.anchors.set(id, obj); };
  const addIt = (id, obj) => { const it = new Interactable(id); reg.its.set(id, it); anchor(id, obj); obj.userData.it = it; return it; };
  const at = (name, p) => { const o = new THREE.Object3D(); place(o, p); root.add(o); anchor(name, o); return o; };

  // 기준점
  reg.spawn = { x: layout.spawn.pos[0], z: layout.spawn.pos[1], yaw: layout.spawn.yaw || 0 };
  reg.deskStand = { x: layout.deskStand.pos[0], z: layout.deskStand.pos[1], yaw: layout.deskStand.yaw || 0 };
  reg.titleCam = { pos: layout.titleCam.pos, look: layout.titleCam.look };
  at('CatSpawn', [layout.catSpawn[0], 0, layout.catSpawn[1]]);
  at('ExitPoint', [layout.exitPoint[0], 0, layout.exitPoint[1]]);
  at('FrontHall', [-1.5, 1.2, -6.6]);
  at('Corridor', [5, 1.2, 9]);

  const structure = F.node(root, 'Structure');
  const grid = reg.grid;

  // 바닥·천장
  for (const f of layout.floors) {
    const [ax, az] = f.min, [bx, bz] = f.max, h = f.ceiling ?? 2.6;
    const w = bx - ax, d = bz - az, cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const fl = F.box(structure, [w, 0.1, d], [cx, -0.05, cz], f.mat || 'carpet');
    fl.castShadow = false;
    F.box(structure, [w + 0.4, 0.12, d + 0.4], [cx, h + 0.06, cz], f.ceilMat || 'ceiling');
    grid.rect(cx, cz, w, d, 0, grid.floor);
  }

  // 벽
  const WT = 0.15;
  for (const wd of layout.walls) {
    const [ax, az] = wd.a, [bx, bz] = wd.b, h = wd.h ?? 2.6, mat = wd.mat || 'wall';
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const alongX = Math.abs(dx) > Math.abs(dz);
    const ops = (wd.openings || []).map((o) => ({ c: o.c, w: o.w, y0: o.y0 || 0, y1: o.y1 || 2.1, win: o.window })).sort((p, q) => p.c - q.c);
    const piece = (s0, s1, y0, y1, base) => {
      const l = s1 - s0, cx = ax + dx * (s0 + s1) / 2, cz = az + dz * (s0 + s1) / 2;
      const size = alongX ? [l, y1 - y0, WT] : [WT, y1 - y0, l];
      F.box(structure, size, [cx, (y0 + y1) / 2, cz], mat);
      proxy(reg, root, [cx, (y0 + y1) / 2, cz], size);
      if (base && y0 < 0.01) F.box(structure, alongX ? [l, 0.08, WT + 0.025] : [WT + 0.025, 0.08, l], [cx, 0.04, cz], 'baseboard');
      if (y0 < 0.01) grid.rect(cx, cz, alongX ? l : WT, alongX ? WT : l, 0, grid.block);
    };
    let s = 0;
    for (const o of ops) {
      const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
      if (o0 > s + 0.001) piece(s, o0, 0, h, true);
      if (o.y1 < h - 0.001) piece(o0, o1, o.y1, h, false);
      if (o.y0 > 0.001) { piece(o0, o1, 0, o.y0, true); }
      if (o.win) buildWindow(F, reg, root, o.win, [ax + dx * o.c, az + dz * o.c], o.w, o.y0, o.y1, alongX);
      s = o1;
    }
    if (len > s + 0.001) piece(s, len, 0, h, true);
  }

  // 문
  for (const dd of layout.doors) buildDoor(F, reg, root, dd);

  // 조명
  for (const l of layout.lights) {
    const h = l.ceiling ?? 2.6;
    const g = F.node(root, l.id, [l.pos[0], h, l.pos[1]]);
    g.userData.dynamic = true;
    F.box(g, [1.22, 0.05, 0.62], [0, -0.025, 0], 'metal');
    const pm = new THREE.MeshLambertMaterial({ color: C(0.8, 0.82, 0.85), emissive: C(0.85, 0.95, 1.05), emissiveIntensity: 1 });
    const panel = F.mesh(g, boxGeo(1.16, 0.012, 0.56), pm, [0, -0.056, 0], [0, 0, 0], false);
    const light = new THREE.PointLight(0xcce6ff, 1, h < 2.55 ? 6 : 8, 1.4);
    light.position.set(0, -0.35, 0);
    g.add(light);
    const cl = new CeilingLight(light, pm, 5.5, l.level ?? 1, !!l.flicker);
    const group = l.group || 'ceiling';
    if (!reg.lights.has(group)) reg.lights.set(group, []);
    reg.lights.get(group).push(cl);
    reg.ceiling.push(cl);
    anchor(l.id, g);
  }

  // 소품
  const props = F.node(root, 'Props');
  for (const p of layout.props) buildProp(F, reg, props, p);

  // 천장 구멍·케이블
  for (const hpos of layout.holes || []) F.quad(structure, [0.6, 0.6], [hpos[0], 2.596, hpos[1]], [-90, 0, 0], 'hole');
  for (const c of layout.cables || []) {
    if (c.hang) {
      const top = [c.hang[0], 2.6, c.hang[1]], len = c.len || 0.8, seed = top[0] * 3.1 + top[2] * 1.7, pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([top[0] + Math.sin(seed + t * 2.5) * 0.05 * t, top[1] - len * t, top[2] + Math.cos(seed * 0.7 + t * 2) * 0.04 * t]); }
      const last = pts[pts.length - 1]; pts.push([last[0] + 0.04, last[1] + 0.03, last[2] + 0.02]);
      F.cable(structure, pts, 0.012);
    } else if (c.a) F.cable(structure, sag(c.a, c.b, c.sag ?? 0.3, 16), 0.011);
    else if (c.floor) {
      const pts = c.floor.map((q) => [q[0], 0.012, q[1]]), sm = [];
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 6; k++) { const t = k / 6; sm.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, 0.012, pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t + Math.sin(i * 2 + k) * 0.01]); }
      sm.push(pts[pts.length - 1]);
      F.cable(structure, sm, 0.009);
    }
  }

  // 창밖
  const bd = layout.backdrop || {};
  const bq = F.quad(root, [bd.width || 30, bd.height || 12], [bd.x || 12, (bd.y ?? 0.5) + (bd.height || 12) * 0.25, 0], [0, 90, 0], 'window_night');
  bq.userData.dynamic = true;
  const moon = new THREE.DirectionalLight(0x7590d0, 0.9);
  const md = new THREE.Vector3(-1, -0.6, -0.25).normalize(); // Unity (−1,−0.6,0.25) → z 반전
  moon.position.set(2, 2.3, 0).sub(md.clone().multiplyScalar(8));
  moon.target.position.set(2, 2.3, 0).add(md.clone().multiplyScalar(4));
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 40 });
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.02;
  root.add(moon, moon.target);

  reg.avatar = buildAvatar(F, root);
  reg.avatar.userData.seatPoint = reg.chairSeat;
  return reg;
}

function buildWindow(F, reg, root, id, c, w, y0, y1, alongX) {
  const h = y1 - y0, yaw = alongX ? 0 : 90;
  const win = F.node(root, id, [c[0], (y0 + y1) / 2, c[1]], yaw);
  F.box(win, [w, 0.05, 0.17], [0, h / 2, 0], 'metal_dark');
  F.box(win, [w + 0.1, 0.05, 0.24], [0, -h / 2, 0.02], 'metal_dark');
  F.box(win, [0.05, h, 0.17], [-w / 2, 0, 0], 'metal_dark');
  F.box(win, [0.05, h, 0.17], [w / 2, 0, 0], 'metal_dark');
  F.box(win, [0.03, h, 0.05], [0, 0, 0], 'metal_dark');
  const inward = alongX ? (c[1] > 0 ? -0.12 : 0.12) : (c[0] > 0 ? 0.12 : -0.12);
  const blinds = F.node(win, 'Blinds', [0, 0.02, alongX ? inward : -inward]);
  const bh = h - 0.08, n = Math.round(bh / 0.055);
  for (let k = 0; k < n; k++) {
    const y = -bh / 2 + (k + 0.5) * (bh / n), tilt = k % 7 === 3 ? 62 : 38;
    F.box(blinds, [w - 0.06, 0.004, 0.05], [0, y, 0], 'paper', [tilt, 0, 0]);
  }
  F.box(blinds, [w + 0.02, 0.04, 0.06], [0, bh / 2 + 0.02, 0], 'metal');
  const it = new Interactable(id); reg.its.set(id, it); reg.anchors.set(id, win);
  proxy(reg, win, [0, 0, 0], [w, h, 0.3], it);
}

function buildDoor(F, reg, root, d) {
  const id = d.id, hx = d.hinge[0], hz = d.hinge[1], w = d.width || 1;
  const dir = d.dir || 'x';
  const yaw = dir === 'x' ? 0 : dir === '-x' ? 180 : dir === 'z' ? -90 : 90;
  const frame = F.node(root, id + '_Frame', [hx, 0, hz], yaw);
  F.box(frame, [0.05, 2.12, 0.19], [-0.025, 1.06, 0], 'metal_dark');
  F.box(frame, [0.05, 2.12, 0.19], [w + 0.025, 1.06, 0], 'metal_dark');
  F.box(frame, [w + 0.1, 0.06, 0.19], [w / 2, 2.13, 0], 'metal_dark');
  const pivot = F.node(root, id, [hx, 0, hz], 0);
  pivot.userData.dynamic = true;
  F.box(pivot, [w - 0.02, 2.06, 0.045], [w / 2, 1.03, 0], d.mat || 'door', [0, 0, 0], 0);
  for (const s of [-1, 1]) {
    F.box(pivot, [0.13, 0.02, 0.025], [w - 0.14, 1.0, 0.045 * s], 'metal');
    F.box(pivot, [0.05, 0.05, 0.012], [w - 0.09, 1.0, 0.03 * s], 'metal');
  }
  if (d.pushbar) F.box(pivot, [w * 0.7, 0.05, 0.05], [w / 2, 1.0, -0.06], 'metal');
  const door = new Door(id, pivot, yaw, d.openYaw ?? -95, !!d.locked);
  const it = new Interactable(id); reg.its.set(id, it);
  proxy(reg, pivot, [w / 2, 1.03, 0], [w, 2.06, 0.08], it);
  reg.doors.set(id, door);
  // 충돌: 닫힌 문짝 선분 (Unity 좌표)
  const r = yaw * D, ex = Math.cos(r), ez = -Math.sin(r); // Unity Euler(0,yaw)*(1,0,0) = (cos, 0, -sin)
  reg.grid.doors.push({ door, x0: hx, z0: hz, x1: hx + ex * w, z1: hz + ez * w });
  if (d.reader) {
    const along = [ex, ez], across = [Math.sin(r), Math.cos(r)];
    const pos = [hx + along[0] * (w + 0.22) + across[0] * 0.09, 1.2, hz + along[1] * (w + 0.22) + across[1] * 0.09];
    const rd = F.node(root, id + '_Reader', pos, yaw + 180);
    F.box(rd, [0.08, 0.13, 0.03], [0, 0, 0], 'plastic_dark');
    door.led = F.box(rd, [0.03, 0.012, 0.006], [0, 0.045, -0.017], 'led_green');
    door.led.userData.dynamic = true; rd.userData.dynamic = true;
    door.ledRed = F.M.get('led_red'); door.ledGreen = F.M.get('led_green');
  }
  door.setLocked(door.locked);
  const center = new THREE.Object3D();
  place(center, [hx + ex * w / 2, 1.2, hz + ez * w / 2]);
  root.add(center);
  reg.anchors.set(id, center);
}

function desk(F, reg, parent, id, pos, rot, partition, pedestal) {
  const root = F.node(parent, id || 'Desk', [pos[0], 0, pos[1]], rot);
  F.box(root, [1.4, 0.03, 0.7], [0, 0.735, 0], 'desk_top');
  F.box(root, [1.4, 0.032, 0.012], [0, 0.735, -0.354], 'metal_dark');
  F.box(root, [0.03, 0.72, 0.66], [-0.675, 0.36, 0], 'metal_dark');
  F.box(root, [0.03, 0.72, 0.66], [0.675, 0.36, 0], 'metal_dark');
  F.box(root, [1.32, 0.38, 0.02], [0, 0.5, 0.31], 'metal_dark');
  let drawer = null;
  if (pedestal) {
    F.box(root, [0.42, 0.6, 0.6], [0.42, 0.33, 0], 'metal');
    for (let k = 1; k < 3; k++) {
      const y = 0.12 + (2 - k) * 0.2;
      F.box(root, [0.4, 0.18, 0.015], [0.42, y, -0.307], 'metal');
      F.box(root, [0.13, 0.018, 0.02], [0.42, y + 0.05, -0.322], 'metal_dark');
    }
    const top = F.node(root, 'TopDrawer', [0.42, 0.53, 0]);
    top.userData.dynamic = true;
    F.box(top, [0.4, 0.16, 0.015], [0, 0, -0.307], 'metal');
    F.box(top, [0.13, 0.018, 0.02], [0, 0.04, -0.322], 'metal_dark');
    F.box(top, [0.36, 0.01, 0.52], [0, -0.06, -0.04], 'metal_dark');
    F.box(top, [0.01, 0.1, 0.52], [-0.18, -0.02, -0.04], 'metal_dark');
    F.box(top, [0.01, 0.1, 0.52], [0.18, -0.02, -0.04], 'metal_dark');
    drawer = { obj: top, closedZ: top.position.z, open: false, t: 0 };
  }
  proxy(reg, root, [0, 0.375, 0], [1.4, 0.75, 0.72]);
  if (partition) {
    F.box(root, [1.42, 1.25, 0.05], [0, 0.625, 0.42], 'fabric', [0, 0, 0], 0.6);
    F.box(root, [1.44, 0.025, 0.065], [0, 1.262, 0.42], 'metal');
    proxy(reg, root, [0, 0.635, 0.42], [1.42, 1.27, 0.06]);
  }
  return { root, drawer };
}

function crt(F, reg, parent, name, lp, scale = 1) {
  const root = F.node(parent, name, lp, 0);
  root.scale.setScalar(scale);
  F.cyl(root, 0.13, 0.02, [0, 0.01, 0.06], 'plastic', [0, 0, 0], 12);
  F.box(root, [0.14, 0.06, 0.12], [0, 0.05, 0.06], 'plastic');
  F.box(root, [0.46, 0.4, 0.07], [0, 0.28, 0], 'plastic', [0, 0, 0], 0.5);
  F.mesh(root, frustumGeo([0.42, 0.36], [0.25, 0.22], 0.36, 0.03), 'plastic', [0, 0.28, 0.215], [0, 0, 0]);
  F.box(root, [0.2, 0.004, 0.12], [0, 0.428, 0.2], 'plastic_dark');
  F.quad(root, [0.395, 0.315], [0, 0.285, -0.0355], [0, 0, 0], 'black');
  F.box(root, [0.03, 0.015, 0.01], [0.15, 0.1, -0.036], 'plastic_dark');
  const screen = F.quad(root, [0.36, 0.27], [0, 0.285, -0.037], [0, 0, 0], 'screen_dead');
  screen.userData.dynamic = true;
  const led = F.box(root, [0.012, 0.006, 0.004], [0.19, 0.1, -0.037], 'led_amber');
  led.userData.dynamic = true;
  return { root, screen, led };
}

function keyboard(F, parent, lp) {
  const root = F.node(parent, 'Keyboard', lp);
  F.box(root, [0.44, 0.025, 0.15], [0, 0.0125, 0], 'plastic');
  F.quad(root, [0.42, 0.13], [0, 0.0255, 0], [90, 0, 0], 'keyboard_top');
  F.box(root, [0.06, 0.03, 0.1], [0.33, 0.015, 0.01], 'plastic');
  F.cable(root, [[0, 0.012, 0.075], [0.02, 0.008, 0.16], [0.1, 0.006, 0.3], [0.15, 0.006, 0.42]], 0.004);
}

function chair(F, reg, parent, lp, yaw) {
  const root = F.node(parent, 'Chair', lp, yaw);
  for (let k = 0; k < 5; k++) {
    const arm = F.node(root, 'Star', [0, 0.07, 0], k * 72);
    F.box(arm, [0.05, 0.03, 0.3], [0, 0, 0.15], 'metal_dark');
    F.box(arm, [0.04, 0.05, 0.05], [0, -0.04, 0.29], 'plastic_dark');
  }
  F.cyl(root, 0.025, 0.34, [0, 0.25, 0], 'metal_dark', [0, 0, 0], 8);
  F.box(root, [0.48, 0.08, 0.46], [0, 0.46, 0], 'fabric_chair', [0, 0, 0], 0.6);
  F.box(root, [0.05, 0.32, 0.04], [0, 0.6, -0.25], 'metal_dark');
  F.box(root, [0.44, 0.5, 0.06], [0, 0.84, -0.25], 'fabric_chair', [-8, 0, 0], 0.6);
  for (const s of [-1, 1]) {
    F.box(root, [0.03, 0.2, 0.03], [0.26 * s, 0.57, -0.04], 'metal_dark');
    F.box(root, [0.05, 0.03, 0.26], [0.26 * s, 0.67, 0], 'plastic_dark');
  }
  proxy(reg, root, [0, 0.5, 0], [0.5, 1.0, 0.5]);
  return root;
}

function decal(F, reg, parent, id, mat, size, pos, rot, hit) {
  const root = F.node(parent, id, pos, rot);
  F.quad(root, size, [0, 0, 0], [0, 0, 0], mat);
  if (hit) { const it = new Interactable(id); reg.its.set(id, it); reg.anchors.set(id, root); proxy(reg, root, [0, 0, 0], [size[0], size[1], 0.06], it); }
  return root;
}

function buildProp(F, reg, parent, p) {
  const type = p.type, id = p.id || '', rot = p.rot || 0;
  const pos = [p.pos[0], p.y || 0, p.pos[1]];
  const addIt = (key, obj, center, size) => {
    const it = new Interactable(key); reg.its.set(key, it); reg.anchors.set(key, obj); proxy(reg, obj, center, size, it); return it;
  };
  const grid = reg.grid;
  switch (type) {
    case 'desk': {
      const { root, drawer } = desk(F, reg, parent, id, p.pos, rot, !!p.partition, !!p.pedestal);
      const off = p.chairOffset || [0, -0.62];
      const r = rot * D, cs = Math.cos(r), sn = Math.sin(r);
      // 충돌 (Unity 회전: 로컬(x,z) → (x cos + z sin, -x sin + z cos))
      const lo = (x, z) => [p.pos[0] + x * cs + z * sn, p.pos[1] - x * sn + z * cs];
      const dc = lo(0, 0.04); grid.rect(dc[0], dc[1], 1.4, p.partition ? 0.8 : 0.72, rot, grid.block);
      if (p.chair) { const cc = lo(off[0], off[1]); grid.rect(cc[0], cc[1], 0.5, 0.5, rot + (p.chairRot || 0), grid.block); }
      const mode = p.crt || 'dead';
      let c = null;
      if (mode !== 'none') { c = crt(F, reg, root, 'CRT', [-0.05, 0.75, -0.02]); keyboard(F, root, [-0.05, 0.75, -0.25]); }
      if (mode === 'live' && c) {
        reg.live = c.screen;
        c.led.material = F.M.get('led_green');
        addIt('Computer', c.root, [0, 0.27, 0.16], [0.46, 0.46, 0.42]);
        c.root.userData.dynamic = true;
        c.root.updateMatrixWorld(true);
        const sp = new THREE.Vector3(); c.screen.getWorldPosition(sp);
        const nrm = new THREE.Vector3(0, 0, 1).transformDirection(c.screen.matrixWorld);
        const spot = new THREE.SpotLight(0x8cb8ff, 6, 4.5, 62 * D, 0.6, 1.3);
        spot.position.copy(sp).addScaledVector(nrm, 0.06);
        spot.target.position.copy(sp).addScaledVector(nrm, 2).add(new THREE.Vector3(0, -0.5, 0));
        spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.001;
        reg.root.add(spot, spot.target);
        reg.crtLight = spot;
        const glow = new THREE.PointLight(0x80adff, 0.6, 1.8, 1.5);
        glow.position.copy(sp).addScaledVector(nrm, 0.35);
        reg.root.add(glow);
        reg.crtGlow = glow;
      } else if (mode === 'dead' && c) {
        let glow = null;
        if (['D12', 'Desk116'].includes(id)) {
          glow = new THREE.PointLight(0x80b3ff, 0, 2.4, 1.5);
          place(glow, [0, 0.28, -0.5]); c.root.add(glow);
        }
        reg.dead.push(new MonitorScreen(c.screen, F.M.get('screen_dead'), glow));
        addIt('crt_' + id, c.root, [0, 0.27, 0.16], [0.46, 0.46, 0.42]);
      }
      if (p.chair) {
        chair(F, reg, root, [off[0], 0, off[1]], p.chairRot || 0);
        if (mode === 'live') { const seat = F.node(root, 'SeatPoint', [off[0], 0, off[1]], 0); reg.chairSeat = seat; }
      }
      if (p.pc) {
        const tw = F.node(root, 'Tower', [-0.45, 0, 0.02]);
        F.box(tw, [0.19, 0.42, 0.45], [0, 0.21, 0], 'plastic', [0, 0, 0], 0.5);
        F.quad(tw, [0.18, 0.4], [0, 0.21, -0.2265], [0, 0, 0], 'tower_front');
      }
      for (const item of p.items || []) {
        if (item === 'badge117') {
          const b = F.node(root, 'Badge117', [0.42, 0.7515, -0.22]);
          b.rotation.set(-90 * D, -14 * D, 0, 'YXZ');
          F.quad(b, [0.06, 0.09], [0, 0, 0], [0, 0, 0], 'badge117');
          const it = new Interactable('Badge117'); reg.its.set('Badge117', it); reg.anchors.set('Badge117', b);
          proxy(reg, b, [0, 0, 0], [0.12, 0.15, 0.06], it);
        } else if (item === 'sticky' && c) {
          const s = F.quad(c.root, [0.075, 0.075], [0.17, 0.43, -0.0365], [0, 0, -6], 'sticky');
          reg.anchors.set('Sticky', s);
        } else if (item === 'mug') {
          const m = F.node(root, 'Mug', [-0.52, 0.75, -0.18]);
          F.cyl(m, 0.04, 0.095, [0, 0.0475, 0], 'paper', [0, 0, 0], 10);
          F.box(m, [0.012, 0.05, 0.03], [0.048, 0.05, 0], 'paper');
          F.cyl(m, 0.036, 0.004, [0, 0.085, 0], 'black', [0, 0, 0], 10);
        } else if (item === 'papers') {
          const pp = F.node(root, 'Papers', [0.5, 0.75, 0.05], -8);
          for (let k = 0; k < 3; k++) F.box(pp, [0.21, 0.004, 0.297], [k * 0.015, 0.002 + k * 0.004, k * 0.01], 'paper', [0, k * 6 - 4, 0]);
        } else if (item === 'boxes') {
          const bx = F.node(root, 'DeskBoxes', [0, 0.75, 0.05], 7);
          F.box(bx, [0.42, 0.3, 0.34], [-0.2, 0.15, 0], 'cardboard', [0, 0, 0], 0.6);
          F.box(bx, [0.36, 0.24, 0.3], [0.25, 0.12, 0.02], 'cardboard', [0, -15, 0], 0.6);
        }
      }
      if (p.drawer && drawer) {
        reg.drawers.set(p.drawer, drawer);
        const b = F.node(drawer.obj, 'Badge116', [0.02, -0.052, -0.12]);
        b.rotation.set(-90 * D, 20 * D, 0, 'YXZ');
        F.quad(b, [0.06, 0.09], [0, 0, 0], [0, 0, 0], 'badge116');
      }
      if (id && mode !== 'live') addIt(id, root, [0, 0.375, 0], [1.42, 0.77, 0.74]);
      reg.anchors.set(id, root);
      break;
    }
    case 'supervisor': {
      const { root } = desk(F, reg, parent, id, p.pos, rot, false, false);
      const r = rot * D, cs = Math.cos(r), sn = Math.sin(r);
      grid.rect(p.pos[0] + 0.04 * sn, p.pos[1] + 0.04 * cs, 1.4, 0.72, rot, grid.block);
      const c = crt(F, reg, root, 'CctvMonitor', [-0.1, 0.75, 0], 0.85);
      reg.cctvMonitor = new MonitorScreen(c.screen, F.M.get('screen_dead'), null);
      addIt('CctvMonitor', c.root, [0, 0.27, 0.16], [0.46, 0.46, 0.42]);
      const ph = F.node(root, 'Phone', [0.42, 0.75, -0.12], -10);
      F.box(ph, [0.2, 0.06, 0.2], [0, 0.03, 0], 'plastic_dark', [-8, 0, 0]);
      F.box(ph, [0.22, 0.045, 0.06], [0, 0.08, 0.04], 'plastic_dark');
      F.box(ph, [0.09, 0.005, 0.09], [0, 0.065, -0.05], 'plastic');
      addIt('Phone', ph, [0, 0.05, 0], [0.24, 0.12, 0.24]);
      const pp = F.node(root, 'Papers', [-0.5, 0.75, -0.1], 12);
      for (let k = 0; k < 3; k++) F.box(pp, [0.21, 0.004, 0.297], [k * 0.015, 0.002 + k * 0.004, k * 0.01], 'paper', [0, k * 6 - 4, 0]);
      addIt(id, root, [0, 0.375, 0], [1.42, 0.77, 0.74]);
      break;
    }
    case 'cabinet': {
      const root = F.node(parent, id || 'Cabinet', pos, rot);
      F.box(root, [0.46, 1.32, 0.62], [0, 0.66, 0], 'metal');
      for (let k = 0; k < 4; k++) {
        const y = 0.18 + k * 0.32;
        F.box(root, [0.42, 0.29, 0.012], [0, y, -0.315], 'metal');
        F.box(root, [0.14, 0.02, 0.025], [0, y + 0.07, -0.33], 'metal_dark');
        F.quad(root, [0.08, 0.035], [0, y + 0.115, -0.3225], [0, 0, 0], 'paper');
      }
      if (id) addIt(id, root, [0, 0.66, 0], [0.46, 1.32, 0.62]); else proxy(reg, root, [0, 0.66, 0], [0.46, 1.32, 0.62]);
      grid.rect(p.pos[0], p.pos[1], 0.46, 0.62, rot, grid.block);
      break;
    }
    case 'cooler': {
      const root = F.node(parent, id || 'Cooler', pos, rot);
      F.box(root, [0.32, 0.95, 0.32], [0, 0.475, 0], 'paper');
      F.box(root, [0.2, 0.03, 0.08], [0, 0.62, -0.18], 'plastic_dark');
      F.box(root, [0.03, 0.04, 0.04], [0.05, 0.75, -0.17], 'led_red');
      F.box(root, [0.03, 0.04, 0.04], [-0.05, 0.75, -0.17], 'plastic_dark');
      F.cyl(root, 0.13, 0.4, [0, 1.16, 0], 'water', [0, 0, 0], 12);
      F.cyl(root, 0.05, 0.06, [0, 0.97, 0], 'water', [0, 0, 0], 10);
      addIt(id, root, [0, 0.7, 0], [0.34, 1.4, 0.34]);
      grid.rect(p.pos[0], p.pos[1], 0.34, 0.34, rot, grid.block);
      break;
    }
    case 'boxes': {
      const root = F.node(parent, 'Boxes', pos, rot);
      F.box(root, [0.55, 0.38, 0.42], [0, 0.19, 0], 'cardboard', [0, 0, 0], 0.6);
      F.box(root, [0.45, 0.32, 0.36], [0.03, 0.54, 0.02], 'cardboard', [0, 12, 0], 0.6);
      F.box(root, [0.4, 0.28, 0.34], [0.05, 0.14, -0.42], 'cardboard', [0, -8, 0], 0.6);
      proxy(reg, root, [0.02, 0.35, -0.18], [0.6, 0.7, 0.82]);
      const r = rot * D;
      grid.rect(p.pos[0] + 0.02 * Math.cos(r) - 0.18 * Math.sin(r), p.pos[1] - 0.02 * Math.sin(r) - 0.18 * Math.cos(r), 0.6, 0.82, rot, grid.block);
      break;
    }
    case 'panel': {
      const root = F.node(parent, id, pos, rot);
      F.box(root, [0.42, 0.6, 0.1], [0, 0, 0], 'metal');
      F.quad(root, [0.38, 0.56], [0, 0, -0.0505], [0, 0, 0], 'panel');
      F.box(root, [0.02, 0.02, 0.01], [0.15, 0.25, -0.055], 'led_amber');
      addIt(id, root, [0, 0, 0], [0.44, 0.62, 0.14]);
      break;
    }
    case 'clock': {
      const root = F.node(parent, id, pos, rot);
      F.cyl(root, 0.18, 0.04, [0, 0, 0], 'plastic_dark', [90, 0, 0], 16);
      F.quad(root, [0.32, 0.32], [0, 0, -0.021], [0, 0, 0], 'clock_face');
      const hour = F.node(root, 'Hour', [0, 0, -0.024]); hour.userData.dynamic = true;
      F.box(hour, [0.012, 0.085, 0.003], [0, 0.035, 0], 'black');
      const minute = F.node(root, 'Minute', [0, 0, -0.027]); minute.userData.dynamic = true;
      F.box(minute, [0.008, 0.13, 0.003], [0, 0.055, 0], 'black');
      reg.clock = { hour, minute, drift: 0 };
      addIt(id, root, [0, 0, 0], [0.36, 0.36, 0.06]);
      break;
    }
    case 'notice': decal(F, reg, parent, id, 'notice', [0.4, 0.6], pos, rot, true); break;
    case 'calendar': decal(F, reg, parent, id, 'calendar', [0.3, 0.45], pos, rot, true); break;
    case 'sign': decal(F, reg, parent, 'Sign', p.tex || 'sign_room', p.size || [0.46, 0.23], pos, rot, false); break;
    case 'exitsign': {
      const root = F.node(parent, 'ExitSign', pos, rot);
      F.box(root, [0.42, 0.17, 0.06], [0, 0, 0], 'metal');
      F.quad(root, [0.38, 0.14], [0, 0, -0.031], [0, 0, 0], 'exit_sign');
      const l = new THREE.PointLight(0x5cff80, 1.6, 3.4, 1.6);
      place(l, [0, -0.15, -0.25]); root.add(l);
      break;
    }
    case 'elevator': {
      const root = F.node(parent, 'Elevator', pos, rot);
      F.quad(root, [1.2, 2.1], [0, 1.05, 0], [0, 180, 0], 'elevator');
      F.box(root, [0.06, 0.1, 0.02], [0.85, 1.15, 0.02], 'led_amber');
      break;
    }
    case 'cctv': {
      // CCTV 머리는 three 좌표로 직접 만든다 (lookAt 은 +z 를 대상으로 향함)
      const root = new THREE.Group(); root.name = id; root.position.set(p.pos[0], p.y || 2.6, -p.pos[1]); parent.add(root);
      root.userData.dynamic = true;
      const mount = new THREE.Mesh(boxGeo(0.14, 0.04, 0.14), F.M.get('plastic')); mount.position.y = -0.02; root.add(mount);
      const head = new THREE.Group(); head.position.y = -0.09; root.add(head);
      const body = new THREE.Mesh(boxGeo(0.11, 0.1, 0.18), F.M.get('plastic')); body.position.z = 0.02; head.add(body);
      const lens = new THREE.Mesh(boxGeo(0.06, 0.06, 0.04), F.M.get('black')); lens.position.z = 0.12; head.add(lens);
      const led = new THREE.Mesh(boxGeo(0.015, 0.015, 0.01), F.M.get('black')); led.position.set(0.04, 0.035, 0.115); head.add(led);
      head.lookAt(new THREE.Vector3(-4.6, 1.0, 3.6));
      reg.cctv = { root, head, led, ledOn: F.M.get('led_red'), ledOff: F.M.get('black'), tracking: false, servoCd: 0 };
      reg.anchors.set(id, root);
      break;
    }
    default: console.warn('알 수 없는 소품', type);
  }
}

function buildAvatar(F, root) {
  const av = F.node(root, 'PlayerAvatar', [0, 0, 0]);
  av.userData.dynamic = true;
  const st = F.node(av, 'Standing');
  F.box(st, [0.15, 0.82, 0.18], [-0.11, 0.41, 0], 'cloth'); F.box(st, [0.15, 0.82, 0.18], [0.11, 0.41, 0], 'cloth');
  F.box(st, [0.42, 0.62, 0.24], [0, 1.13, 0], 'cloth');
  F.box(st, [0.1, 0.6, 0.12], [-0.27, 1.12, 0], 'cloth'); F.box(st, [0.1, 0.6, 0.12], [0.27, 1.12, 0], 'cloth');
  F.box(st, [0.2, 0.24, 0.22], [0, 1.58, 0], 'skin'); F.box(st, [0.21, 0.08, 0.23], [0, 1.69, -0.01], 'black');
  const se = F.node(av, 'Seated');
  F.box(se, [0.42, 0.6, 0.24], [0, 0.83, -0.05], 'cloth', [6, 0, 0]);
  for (const s of [-1, 1]) {
    F.box(se, [0.15, 0.14, 0.45], [0.11 * s, 0.55, 0.15], 'cloth');
    F.box(se, [0.14, 0.48, 0.15], [0.11 * s, 0.26, 0.36], 'cloth');
    F.box(se, [0.1, 0.12, 0.42], [0.24 * s, 0.95, 0.18], 'cloth');
  }
  F.box(se, [0.2, 0.24, 0.22], [0, 1.27, 0], 'skin'); F.box(se, [0.21, 0.08, 0.23], [0, 1.38, -0.01], 'black');
  se.visible = false;
  av.traverse((o) => { o.layers.set(1); o.castShadow = false; });
  av.userData.standingPose = st; av.userData.seatedPose = se;
  return av;
}

export function buildCat(F_or_mats, parent, x, zUnity) {
  const F = F_or_mats instanceof Factory ? F_or_mats : new Factory(F_or_mats);
  const root = F.node(parent, 'Chaser_Cat', [x, 0, zUnity]);
  root.userData.dynamic = true;
  const v = F.node(root, 'Visual');
  v.scale.setScalar(1.7);
  F.box(v, [0.26, 0.22, 0.44], [0, 0.24, 0], 'cat_fur', [0, 0, 0], 0);
  F.box(v, [0.18, 0.16, 0.06], [0, 0.22, 0.21], 'cat_white');
  F.box(v, [0.24, 0.2, 0.2], [0, 0.38, 0.26], 'cat_fur', [0, 0, 0], 0);
  F.box(v, [0.11, 0.06, 0.04], [0, 0.33, 0.37], 'cat_white');
  F.box(v, [0.03, 0.02, 0.012], [0, 0.355, 0.393], 'cat_pink');
  F.box(v, [0.04, 0.045, 0.01], [-0.055, 0.405, 0.362], 'cat_eye');
  F.box(v, [0.04, 0.045, 0.01], [0.055, 0.405, 0.362], 'cat_eye');
  for (const s of [-1, 1]) {
    F.box(v, [0.07, 0.07, 0.03], [0.075 * s, 0.49, 0.25], 'cat_fur', [0, 0, 45], 0);
    F.box(v, [0.04, 0.04, 0.01], [0.075 * s, 0.485, 0.268], 'cat_pink', [0, 0, 45]);
    F.box(v, [0.07, 0.15, 0.07], [0.08 * s, 0.075, 0.15], 'cat_white');
    F.box(v, [0.07, 0.15, 0.07], [0.08 * s, 0.075, -0.15], 'cat_white');
    F.box(v, [0.12, 0.004, 0.004], [0.1 * s, 0.335, 0.38], 'cat_white', [0, 0, 8 * s]);
  }
  const tail = [];
  for (let k = 0; k <= 8; k++) { const a = k / 8; tail.push([0.04 * Math.sin(a * 3), 0.28 + a * 0.32, -0.22 - a * 0.12 + a * a * 0.1]); }
  F.mesh(v, tubeGeo(tail, 0.03), 'cat_fur', [0, 0, 0], [0, 0, 0]);
  return { root, visual: v };
}


// ---------- 괴물 "회수 담당": 키 2.3m, 깡마른 몸, 깨진 CRT 머리에 얼굴, 등 뒤로 끌리는 케이블 ----------
// three 좌표로 직접 만든다 (앞 = -z). 관절 그룹(P)을 game.js 가 움직인다.
export function buildMonster(mats, parent, faceTex) {
  const skin = mats.get('monster_skin'), bone = mats.get('monster_bone'), dark = mats.get('plastic_dark'), cable = mats.get('cable');
  const root = new THREE.Group(); root.name = 'Monster'; root.userData.dynamic = true; parent.add(root);
  const P = {};
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
  const limb = (g, r1, r2, len, mat, up = false) => { const m = mesh(new THREE.CylinderGeometry(r1, r2, len, 7), mat, 0, up ? len / 2 : -len / 2, 0); g.add(m); return m; };
  const hips = new THREE.Group(); hips.position.y = 1.1; root.add(hips); P.hips = hips;
  hips.add(mesh(boxGeo(0.3, 0.14, 0.17, 0), skin));
  for (const s of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(0.12 * s, -0.04, 0); hips.add(thigh);
    limb(thigh, 0.075, 0.055, 0.56, skin);
    const knee = mesh(new THREE.SphereGeometry(0.06, 6, 5), bone, 0, -0.56, 0); thigh.add(knee);
    const shin = new THREE.Group(); shin.position.y = -0.56; thigh.add(shin);
    limb(shin, 0.055, 0.035, 0.5, skin);
    const foot = mesh(boxGeo(0.08, 0.05, 0.26, 0), skin, 0, -0.52, -0.06); shin.add(foot);
    P['thigh' + s] = thigh; P['shin' + s] = shin;
  }
  const spine = new THREE.Group(); spine.position.y = 0.05; spine.rotation.x = -0.32; hips.add(spine); P.spine = spine;
  const chest = mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.66, 8), skin, 0, 0.33, 0); chest.scale.z = 0.62; spine.add(chest);
  for (let k = 0; k < 4; k++) {
    const rib = mesh(boxGeo(0.34 - k * 0.03, 0.018, 0.2, 0), bone, 0, 0.5 - k * 0.09, -0.02); spine.add(rib);
  }
  const spikes = [];
  for (let k = 0; k < 6; k++) { const v = mesh(boxGeo(0.03, 0.05, 0.04, 0), bone, 0, 0.1 + k * 0.1, 0.11); spine.add(v); spikes.push(v); }
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.22 * s, 0.6, 0); sh.rotation.z = 0.12 * s; spine.add(sh);
    sh.add(mesh(new THREE.SphereGeometry(0.065, 6, 5), bone));
    limb(sh, 0.05, 0.035, 0.66, skin);
    const elbow = new THREE.Group(); elbow.position.y = -0.66; sh.add(elbow);
    limb(elbow, 0.036, 0.026, 0.62, skin);
    const hand = new THREE.Group(); hand.position.y = -0.62; elbow.add(hand);
    hand.add(mesh(boxGeo(0.07, 0.1, 0.03, 0), skin, 0, -0.04, 0));
    for (let f = 0; f < 4; f++) {
      const fg = new THREE.Group(); fg.position.set((f - 1.5) * 0.018, -0.09, 0); fg.rotation.z = (f - 1.5) * 0.12; fg.rotation.x = 0.15; hand.add(fg);
      limb(fg, 0.008, 0.004, 0.17 + (f === 1 || f === 2 ? 0.04 : 0), bone);
    }
    P['shoulder' + s] = sh; P['elbow' + s] = elbow;
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.66, -0.02); spine.add(neck); P.neck = neck;
  limb(neck, 0.035, 0.045, 0.2, skin, true);
  const head = new THREE.Group(); head.position.y = 0.32; neck.add(head); P.head = head;
  head.add(mesh(boxGeo(0.42, 0.34, 0.1, 0), dark, 0, 0, -0.12));
  const shell = mesh(frustumGeo([0.38, 0.3], [0.22, 0.18], 0.3, 0.02), dark, 0, 0, 0.08); shell.rotation.y = Math.PI; head.add(shell);
  // 깨진 화면 (앞 = -z)
  const face = crtMaterial(faceTex, [1.0, 0.92, 0.9], 1.7, 1);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), face);
  scr.position.set(0, 0, -0.171); scr.rotation.y = Math.PI; head.add(scr);
  const crack = mesh(boxGeo(0.02, 0.3, 0.01, 0), mats.get('black'), 0.05, 0, -0.175); crack.rotation.z = 0.5; head.add(crack);
  // 등 뒤로 끌리는 케이블 (등뼈에서 바닥까지)
  for (let k = 0; k < 5; k++) {
    const pts = [];
    const ox = (k - 2) * 0.06, oz = 0.12;
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(ox * (1 + t), 0.6 - t * 1.75 + Math.sin(t * 3 + k) * 0.05, oz + t * t * (0.5 + k * 0.12))); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012, 5, false);
    const c = new THREE.Mesh(g, cable); c.castShadow = true; spine.add(c);
  }
  return { root, P, face, screen: scr, phase: 0, jitter: 0, jitterT: 0, head };
}

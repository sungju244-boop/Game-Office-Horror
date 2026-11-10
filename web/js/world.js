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
      case 'led_blue': return new THREE.MeshBasicMaterial({ color: C(0.3, 0.6, 1.0) });
      case 'glass': return new THREE.MeshPhongMaterial({ color: C(0.08, 0.12, 0.16), specular: C(0.9, 0.95, 1.0), shininess: 120, transparent: true, opacity: 0.16, depthWrite: false });
      case 'void_floor': return new THREE.MeshBasicMaterial({ map: this.tex('void_floor', 2.0), color: C(0.55, 0.6, 0.75) });
      case 'door_staff': return this.lit('wall', C(0.66, 0.7, 0.74), 2.0, 0.05);
      case 'rack': return this.lit('rack_front', C(0.9, 0.9, 0.9), 0, 0.3, C(0.7, 0.7, 0.7), 'rack_front');
      case 'printer_body': return this.lit('plastic', C(0.78, 0.78, 0.76), 0.5, 0.25);
      case 'note116': return this.lit('note116', C(1, 1, 1), 0, 0.02);
      case 'ent_black': return new THREE.MeshBasicMaterial({ color: C(0.004, 0.004, 0.006) });
      case 'ent_hand': return this.lit(null, C(0.05, 0.05, 0.06), 1, 0.4, C(0.012, 0.012, 0.016));
      case 'uncle_skin': return this.lit(null, C(0.86, 0.66, 0.52), 1, 0.15);
      case 'uncle_shirt': return this.lit(null, C(0.93, 0.9, 0.82), 1, 0.05);
      case 'uncle_pants': return this.lit(null, C(0.78, 0.68, 0.52), 1, 0.05);
      case 'uncle_shoe': return this.lit(null, C(0.04, 0.04, 0.045), 1, 0.3);
      case 'uncle_face': return this.lit('uncle_face', C(1, 1, 1), 0, 0.1);
    }
    if (this.textures.get(key)) return this.lit(key, C(1, 1, 1), 0, 0.15);
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
    this.ext = 1; this.minLevel = 0; this.calm = false; this.mood = 1;
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
    const k = Math.max(this.level * this.mood, this.minLevel) * this.mul * this.ext;
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
const RES = 0.05;
export class CollisionGrid {
  constructor(floors) {
    let x0 = -8, x1 = 8, z0 = -8.5, z1 = 14;
    if (floors && floors.length) {
      x0 = Math.min(...floors.map((f) => f.min[0])) - 1; x1 = Math.max(...floors.map((f) => f.max[0])) + 1;
      z0 = Math.min(...floors.map((f) => f.min[1])) - 1; z1 = Math.max(...floors.map((f) => f.max[1])) + 1;
    }
    this.X0 = x0; this.Z0 = z0;
    this.w = Math.round((x1 - x0) / RES); this.h = Math.round((z1 - z0) / RES);
    this.block = new Uint8Array(this.w * this.h);
    this.floor = new Uint8Array(this.w * this.h);
    this.doors = [];
  }
  cell(x, z) { return [Math.floor((z - this.Z0) / RES), Math.floor((x - this.X0) / RES)]; }
  rect(cx, cz, sx, sz, yawDeg, arr) {
    const r = yawDeg * D, cs = Math.cos(r), sn = Math.sin(r);
    const hx = sx / 2, hz = sz / 2;
    const ext = Math.abs(hx * cs) + Math.abs(hz * sn) + RES, extz = Math.abs(hx * sn) + Math.abs(hz * cs) + RES;
    const [j0, i0] = this.cell(cx - ext, cz - extz), [j1, i1] = this.cell(cx + ext, cz + extz);
    for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) {
        const x = this.X0 + (i + 0.5) * RES - cx, z = this.Z0 + (j + 0.5) * RES - cz;
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
    dead: [], hit: [], ceiling: [], grid: new CollisionGrid(layout.floors), proxyMat: new THREE.MeshBasicMaterial({ visible: false }),
    live: null, crtLight: null, crtGlow: null, chairSeat: null, cctv: null, cctvs: new Map(), cctvMonitor: null, clock: null, avatar: null,
    rooms: new Map(), glass: [], printer: null, monitors: new Map(), voidFloor: null, powerStrip: null, chairs: new Map(), projector: null,
    fallCabs: [], ceilingParts: [],
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
  const sup = layout.supSpawn || layout.catSpawn || [0, 0];
  at('SupSpawn', [sup[0], 0, sup[1]]);
  at('ExitPoint', [layout.exitPoint[0], 0, layout.exitPoint[1]]);
  if (layout.voidPoint) at('VoidPoint', [layout.voidPoint[0], 0, layout.voidPoint[1]]);
  reg.fog = layout.fog ?? 0.075;

  const structure = F.node(root, 'Structure');
  const grid = reg.grid;

  // 바닥·천장
  for (const f of layout.floors) {
    const [ax, az] = f.min, [bx, bz] = f.max, h = f.ceiling ?? 2.6;
    const w = bx - ax, d = bz - az, cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const fl = F.box(structure, [w, 0.1, d], [cx, -0.05, cz], f.mat || 'carpet');
    fl.castShadow = false;
    if (f.void) { fl.userData.dynamic = true; fl.visible = false; reg.voidFloor = fl; }
    if (f.ceilMat !== 'none') F.box(structure, [w + 0.4, 0.12, d + 0.4], [cx, h + 0.06, cz], f.ceilMat || 'ceiling');
    grid.rect(cx, cz, w, d, 0, grid.floor);
    reg.rooms.set(f.id, { min: f.min, max: f.max });
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
      if (o.glass) {
        const gx = ax + dx * o.c, gz = az + dz * o.c, gh = o.y1 - o.y0, gy = (o.y0 + o.y1) / 2;
        const pane = F.box(structure, alongX ? [o.w, gh, 0.02] : [0.02, gh, o.w], [gx, gy, gz], 'glass');
        pane.castShadow = false; pane.receiveShadow = false;
        F.box(structure, alongX ? [o.w, 0.05, 0.08] : [0.08, 0.05, o.w], [gx, o.y1 - 0.025, gz], 'metal_dark');
        F.box(structure, alongX ? [o.w, 0.05, 0.08] : [0.08, 0.05, o.w], [gx, o.y0 + 0.025, gz], 'metal_dark');
        for (let k = 1; k < Math.round(o.w / 1.3); k++) {
          const sx = -o.w / 2 + k * (o.w / Math.round(o.w / 1.3));
          F.box(structure, alongX ? [0.04, gh, 0.06] : [0.06, gh, 0.04], [gx + (alongX ? sx : 0), gy, gz + (alongX ? 0 : sx)], 'metal_dark');
        }
        proxy(reg, root, [gx, gy, gz], alongX ? [o.w, gh, 0.06] : [0.06, gh, o.w]);
        reg.glass.push({ x: gx, z: gz, w: o.w, alongX, y0: o.y0, y1: o.y1 });
      }
      s = o1;
    }
    if (len > s + 0.001) piece(s, len, 0, h, true);
  }

  for (const [id, r] of reg.rooms) at('Room_' + id, [(r.min[0] + r.max[0]) / 2, 1.2, (r.min[1] + r.max[1]) / 2]);

  // 문
  for (const dd of layout.doors) buildDoor(F, reg, root, dd);

  // 조명 (개수 고정: 고장 난 등기구는 빛을 만들지 않는다)
  for (const l of layout.lights) {
    const h = l.ceiling ?? 2.8;
    if (l.dead) {
      const g = F.node(root, l.id, [l.pos[0], h, l.pos[1]]);
      g.userData.dynamic = true; reg.ceilingParts.push(g);
      F.box(g, [1.22, 0.05, 0.62], [0, -0.025, 0], 'metal');
      F.box(g, [1.16, 0.012, 0.56], [0, -0.056, 0], 'plastic_dark');
      continue;
    }
    let g, pm = null, light;
    if (l.fixture === false) {
      g = F.node(root, l.id, [l.pos[0], l.y ?? 1.0, l.pos[1]]);
      g.userData.dynamic = true;
      const c = l.color || [1, 1, 1];
      light = new THREE.PointLight(new THREE.Color(c[0], c[1], c[2]), 1, l.range ?? 5, 1.6);
      g.add(light);
    } else {
      g = F.node(root, l.id, [l.pos[0], h, l.pos[1]]);
      g.userData.dynamic = true; reg.ceilingParts.push(g);
      F.box(g, [1.22, 0.05, 0.62], [0, -0.025, 0], 'metal');
      pm = new THREE.MeshLambertMaterial({ color: C(0.8, 0.82, 0.85), emissive: C(0.85, 0.95, 1.05), emissiveIntensity: 1 });
      F.mesh(g, boxGeo(1.16, 0.012, 0.56), pm, [0, -0.056, 0], [0, 0, 0], false);
      light = new THREE.PointLight(0xcce6ff, 1, l.range ?? (h < 2.65 ? 7 : 9.5), 1.4);
      light.position.set(0, -0.35, 0);
      g.add(light);
    }
    const cl = new CeilingLight(light, pm, l.base ?? 5.5, l.level ?? 1, !!l.flicker);
    cl.id = l.id; cl.group = l.group || 'ceiling';
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
  const ceil = F.node(root, 'CeilingParts'); ceil.userData.dynamic = true; reg.ceilingParts.push(ceil);
  for (const hpos of layout.holes || []) F.quad(ceil, [0.6, 0.6], [hpos[0], 2.796, hpos[1]], [-90, 0, 0], 'hole');
  for (const c of layout.cables || []) {
    if (c.hang) {
      const top = [c.hang[0], 2.8, c.hang[1]], len = c.len || 0.8, seed = top[0] * 3.1 + top[2] * 1.7, pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([top[0] + Math.sin(seed + t * 2.5) * 0.05 * t, top[1] - len * t, top[2] + Math.cos(seed * 0.7 + t * 2) * 0.04 * t]); }
      const last = pts[pts.length - 1]; pts.push([last[0] + 0.04, last[1] + 0.03, last[2] + 0.02]);
      F.cable(ceil, pts, 0.012);
    } else if (c.a) F.cable(ceil, sag(c.a, c.b, c.sag ?? 0.3, 16), 0.011);
    else if (c.floor) {
      const pts = c.floor.map((q) => [q[0], 0.012, q[1]]), sm = [];
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 6; k++) { const t = k / 6; sm.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, 0.012, pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t + Math.sin(i * 2 + k) * 0.01]); }
      sm.push(pts[pts.length - 1]);
      F.cable(structure, sm, 0.009);
    }
  }

  // 창밖
  const bd = layout.backdrop || {};
  const bw = bd.width || 30, bh = bd.height || 12;
  const bq = bd.pos
    ? F.quad(root, [bw, bh], [bd.pos[0], (bd.y ?? 0.5) + bh * 0.25, bd.pos[1]], [0, 180, 0], 'window_night') // 남쪽(건물)을 본다
    : F.quad(root, [bw, bh], [bd.x || 12, (bd.y ?? 0.5) + bh * 0.25, 0], [0, 90, 0], 'window_night');
  bq.userData.dynamic = true;
  reg.backdrop = bq;
  const moon = new THREE.DirectionalLight(0x7590d0, 0.9);
  const mo = layout.moon || { dir: [-1, -0.6, 0.25], center: [2, 2.3, 0], extent: 12 };
  const md = new THREE.Vector3(mo.dir[0], mo.dir[1], -mo.dir[2]).normalize(); // 배치(Unity) 좌표 → z 반전
  const mc = new THREE.Vector3(mo.center[0], mo.center[1], -mo.center[2]);
  const ex = mo.extent || 12;
  moon.position.copy(mc).sub(md.clone().multiplyScalar(ex * 1.4));
  moon.target.position.copy(mc).add(md.clone().multiplyScalar(4));
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -ex, right: ex, top: ex, bottom: -ex, near: 0.5, far: ex * 3.2 });
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
  const fm = d.handle === false ? 'wall_dark' : 'metal_dark';
  F.box(frame, [0.05, 2.12, 0.19], [-0.025, 1.06, 0], fm);
  F.box(frame, [0.05, 2.12, 0.19], [w + 0.025, 1.06, 0], fm);
  F.box(frame, [w + 0.1, 0.06, 0.19], [w / 2, 2.13, 0], fm);
  const pivot = F.node(root, id, [hx, 0, hz], 0);
  pivot.userData.dynamic = true;
  F.box(pivot, [w - 0.02, 2.06, 0.045], [w / 2, 1.03, 0], d.mat || 'door', [0, 0, 0], d.mat === 'door_staff' ? 2.0 : 0);
  if (d.handle !== false) {
    for (const s of [-1, 1]) {
      F.box(pivot, [0.13, 0.02, 0.025], [w - 0.14, 1.0, 0.045 * s], 'metal');
      F.box(pivot, [0.05, 0.05, 0.012], [w - 0.09, 1.0, 0.03 * s], 'metal');
    }
  }
  if (d.pushbar) F.box(pivot, [w * 0.7, 0.05, 0.05], [w / 2, 1.0, -0.06], 'metal');
  const door = new Door(id, pivot, yaw, d.openYaw ?? -95, !!d.locked);
  if (d.open) { door.amount = door.to = d.open; door.applyRot(); }
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
        if (p.glow) {
          glow = new THREE.PointLight(0x80b3ff, 0, 2.6, 1.5);
          place(glow, [0, 0.28, -0.5]); c.root.add(glow);
        }
        const ms = new MonitorScreen(c.screen, F.M.get('screen_dead'), glow);
        ms.id = id; ms.root = c.root;
        reg.dead.push(ms);
        reg.monitors.set(id, ms);
        addIt('crt_' + id, c.root, [0, 0.27, 0.16], [0.46, 0.46, 0.42]);
      }
      if (p.chair) {
        const ch = chair(F, reg, root, [off[0], 0, off[1]], p.chairRot || 0);
        if (id && p.chairDynamic) { reg.chairs.set(id, ch); ch.userData.dynamic = true; }
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
        } else if (item === 'powerstrip') {
          // 책상 왼쪽 다리 옆 바닥의 멀티탭 (본체로 가는 케이블)
          const ps = F.node(root, 'PowerStrip', [-0.86, 0, -0.18], 8);
          ps.userData.dynamic = true;
          F.box(ps, [0.07, 0.04, 0.32], [0, 0.02, 0], 'plastic');
          for (let k = 0; k < 4; k++) F.box(ps, [0.035, 0.012, 0.035], [0, 0.045, -0.11 + k * 0.075], 'plastic_dark');
          F.box(ps, [0.012, 0.01, 0.012], [0.024, 0.045, 0.14], 'led_red');
          const plug = F.node(ps, 'Plug', [0, 0.045, -0.035]);
          F.box(plug, [0.05, 0.045, 0.05], [0, 0.022, 0], 'plastic_dark');
          F.cable(root, [[-0.86, 0.06, -0.21], [-0.8, 0.03, -0.05], [-0.62, 0.012, 0.1], [-0.45, 0.06, 0.05]], 0.006);
          F.cable(root, [[-0.86, 0.01, 0.0], [-0.95, 0.008, 0.25], [-1.1, 0.008, 0.6]], 0.006);
          const it = new Interactable('PowerStrip'); reg.its.set('PowerStrip', it); reg.anchors.set('PowerStrip', ps);
          proxy(reg, ps, [0, 0.1, 0], [0.34, 0.24, 0.5], it);
          reg.powerStrip = { root: ps, plug };
        } else if (item === 'note116' && c) {
          // 116 모니터 테두리의 볼펜 미로 + 쪽지
          const n = F.quad(c.root, [0.11, 0.11], [-0.17, 0.42, -0.0365], [0, 0, 5], 'note116');
          reg.anchors.set('Note116', n);
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
      if (p.fall) {
        // 앞쪽 아래 모서리를 축으로 넘어지는 캐비닛 (추격 장애물)
        const r = rot * D;
        const pivot = new THREE.Group(); pivot.name = id; pivot.rotation.order = 'YXZ';
        pivot.position.set(p.pos[0] - Math.sin(r) * 0.31, 0, -(p.pos[1] - Math.cos(r) * 0.31));
        pivot.rotation.y = -r; pivot.userData.dynamic = true; parent.add(pivot);
        const body = new THREE.Group(); body.position.z = -0.31; pivot.add(body);
        F.box(body, [0.46, 1.32, 0.62], [0, 0.66, 0], 'metal');
        for (let k = 0; k < 4; k++) {
          const y = 0.18 + k * 0.32;
          F.box(body, [0.42, 0.29, 0.012], [0, y, -0.315], 'metal');
          F.box(body, [0.14, 0.02, 0.025], [0, y + 0.07, -0.33], 'metal_dark');
        }
        proxy(reg, body, [0, 0.66, 0], [0.46, 1.32, 0.62]);
        grid.rect(p.pos[0], p.pos[1], 0.46, 0.62, rot, grid.block);
        reg.fallCabs.push({ id, pivot, rot, pos: [p.pos[0], p.pos[1]], edge: [p.pos[0] - Math.sin(r) * 0.31, p.pos[1] - Math.cos(r) * 0.31], dir: [-Math.sin(r), -Math.cos(r)], state: 0, t: 0 });
        break;
      }
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
    case 'decal': decal(F, reg, parent, id || 'Decal', p.tex, p.size || [0.46, 0.23], pos, rot, !!(p.hit && id)); break;
    case 'exitsign': {
      const root = F.node(parent, 'ExitSign', pos, rot);
      F.box(root, [0.42, 0.17, 0.06], [0, 0, 0], 'metal');
      F.quad(root, [0.38, 0.14], [0, 0, -0.031], [0, 0, 0], 'exit_sign');
      if (p.light !== false) {
        const l = new THREE.PointLight(0x5cff80, 1.8, 4.2, 1.6);
        place(l, [0, -0.15, -0.25]); root.add(l);
      }
      break;
    }
    case 'printer': {
      const root = F.node(parent, id || 'Printer', pos, rot);
      F.box(root, [0.9, 0.72, 0.6], [0, 0.36, 0], 'metal_dark');            // 받침장
      F.box(root, [0.62, 0.3, 0.5], [0, 0.87, 0.02], 'printer_body');     // 본체
      F.box(root, [0.56, 0.05, 0.22], [0, 1.045, 0.1], 'plastic_dark');   // 덮개
      F.box(root, [0.46, 0.02, 0.26], [0, 0.765, -0.32], 'plastic');      // 출력 받침
      F.box(root, [0.2, 0.05, 0.02], [0.18, 0.95, -0.231], 'plastic_dark'); // 조작부
      const led = F.box(root, [0.02, 0.012, 0.006], [0.25, 0.97, -0.242], 'led_green');
      led.userData.dynamic = true;
      // 나오는 종이 (처음엔 본체 안에 숨어 있다)
      const sheet = F.node(root, 'Sheet', [0, 0.79, -0.06]);
      sheet.userData.dynamic = true;
      const paper = F.box(sheet, [0.21, 0.004, 0.297], [0, 0, 0], 'paper', [-6, 0, 0], 0);
      paper.castShadow = false;
      const pile = F.node(root, 'Pile', [0, 0.776, -0.33]); pile.userData.dynamic = true; pile.visible = false;
      F.box(pile, [0.21, 0.01, 0.297], [0, 0, 0], 'paper', [0, 4, 0], 0);
      const it = new Interactable(id || 'Printer'); reg.its.set(id || 'Printer', it); reg.anchors.set(id || 'Printer', root);
      proxy(reg, root, [0, 0.55, 0], [0.92, 1.1, 0.7], it);
      grid.rect(p.pos[0], p.pos[1], 0.9, 0.62, rot, grid.block);
      reg.printer = { root, sheet, pile, led, ledOn: F.M.get('led_amber'), ledIdle: F.M.get('led_green'), t: -1, closedZ: -0.06 };
      break;
    }
    case 'projector': {
      const root = F.node(parent, id || 'Projector', pos, rot);
      root.userData.dynamic = true;
      F.box(root, [0.3, 0.1, 0.24], [0, 0.05, 0], 'plastic');
      F.cyl(root, 0.035, 0.03, [0, 0.05, -0.13], 'black', [90, 0, 0], 10);
      const led = F.box(root, [0.015, 0.008, 0.006], [0.11, 0.08, -0.121], 'led_blue');
      const it = new Interactable(id || 'Projector'); reg.its.set(id || 'Projector', it); reg.anchors.set(id || 'Projector', root);
      proxy(reg, root, [0, 0.08, 0], [0.4, 0.2, 0.36], it);
      // 벽에 비치는 화면과 빛줄기 (처음엔 꺼짐)
      let screen = null, beam = null;
      if (p.screen) {
        const sc = p.screen, sz = sc.size || [2.0, 1.2];
        const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.42, 0.58) });
        screen = F.node(parent, (id || 'Projector') + '_Screen', [sc.pos[0], sc.y ?? 1.4, sc.pos[1]], sc.rot || 0);
        screen.userData.dynamic = true;
        F.mesh(screen, new THREE.PlaneGeometry(sz[0], sz[1]), sm, [0, 0, 0], [0, 0, 0], false);
        screen.visible = false;
        const dx = sc.pos[0] - p.pos[0], dz = sc.pos[1] - p.pos[1], len = Math.hypot(dx, dz);
        const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.45, 0.6), transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(sz[0] * 0.5, 0.03, len, 4, 1, true), bm);
        const mid = new THREE.Vector3((p.pos[0] + sc.pos[0]) / 2, ((p.y || 0.76) + 0.05 + (sc.y ?? 1.4)) / 2, -(p.pos[1] + sc.pos[1]) / 2);
        cone.position.copy(mid);
        cone.lookAt(new THREE.Vector3(sc.pos[0], sc.y ?? 1.4, -sc.pos[1]));
        cone.rotateX(-Math.PI / 2);
        cone.userData.dynamic = true; cone.visible = false;
        reg.root.add(cone); beam = cone;
      }
      reg.projector = { root, led, screen, beam, on: false };
      break;
    }
    case 'rack': {
      const root = F.node(parent, 'Rack', pos, rot);
      F.box(root, [0.62, 2.0, 0.9], [0, 1.0, 0], 'metal_dark');
      F.quad(root, [0.56, 1.9], [0, 1.0, -0.452], [0, 0, 0], 'rack');
      proxy(reg, root, [0, 1.0, 0], [0.62, 2.0, 0.9]);
      grid.rect(p.pos[0], p.pos[1], 0.62, 0.9, rot, grid.block);
      break;
    }
    case 'table': {
      const [tw, td] = p.size || [3.0, 1.2];
      const root = F.node(parent, id || 'Table', pos, rot);
      F.box(root, [tw, 0.04, td], [0, 0.74, 0], 'desk_top');
      for (const sx of [-1, 1]) F.box(root, [0.08, 0.72, td * 0.6], [sx * (tw / 2 - 0.25), 0.36, 0], 'metal_dark');
      if (id) addIt(id, root, [0, 0.38, 0], [tw, 0.76, td]); else proxy(reg, root, [0, 0.38, 0], [tw, 0.76, td]);
      grid.rect(p.pos[0], p.pos[1], tw, td, rot, grid.block);
      const n = p.chairs || 6, per = Math.ceil(n / 2);
      for (let k = 0; k < n; k++) {
        const side = k < per ? -1 : 1, idx = k % per;
        const cx = -tw / 2 + (idx + 0.5) * (tw / per) + (Math.sin(k * 7.1) * 0.08);
        const cz = side * (td / 2 + 0.38);
        const r = rot * D, cs = Math.cos(r), sn = Math.sin(r);
        const wx = p.pos[0] + cx * cs + cz * sn, wz = p.pos[1] - cx * sn + cz * cs;
        chair(F, reg, root, [cx, 0, cz], (side < 0 ? 0 : 180) + Math.sin(k * 3.3) * 14);
        grid.rect(wx, wz, 0.5, 0.5, rot, grid.block);
      }
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
      const lk = p.look || [-4.6, 1.0, -3.6];
      root.updateMatrixWorld(true);
      head.lookAt(new THREE.Vector3(lk[0], lk[1], -lk[2]));
      const cam = { id, root, head, led, ledOn: F.M.get('led_red'), ledOff: F.M.get('black'), tracking: false, servoCd: 0, look: lk };
      reg.cctvs.set(id, cam);
      if (!reg.cctv) reg.cctv = cam;
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

// ---------- 빛나는 점·연기 텍스처 (캔버스로 만든다) ----------
function radialTex(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let EYE_TEX = null, SMOKE_TEX = null;
function eyeTex() { return EYE_TEX || (EYE_TEX = radialTex([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(235,242,255,1)'], [0.4, 'rgba(150,180,255,0.45)'], [1, 'rgba(60,90,200,0)']])); }
function smokeTex() { return SMOKE_TEX || (SMOKE_TEX = radialTex([[0, 'rgba(0,0,0,0.95)'], [0.5, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']])); }

// ---------- 그것 (존재): 빛 없이 검은 형체 + 빛나는 눈. 구하지 못한 사람마다 눈이 늘어난다 ----------
// three 좌표로 만든다 (앞 = -z). 빛을 만들지 않아 셰이더·조명 수가 그대로다.
export function buildEntity(mats, parent) {
  const black = mats.get('ent_black');
  const root = new THREE.Group(); root.name = 'Entity'; root.userData.dynamic = true; parent.add(root);
  const P = {};
  const mesh = (geo, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, black); m.position.set(x, y, z); return m; };
  const hips = new THREE.Group(); hips.position.y = 1.18; root.add(hips); P.hips = hips;
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.09 * s, 0, 0); hips.add(leg);
    leg.add(mesh(new THREE.CylinderGeometry(0.06, 0.025, 1.2, 6), 0, -0.6, 0));
    P['leg' + s] = leg;
  }
  const spine = new THREE.Group(); spine.rotation.x = -0.28; hips.add(spine); P.spine = spine;
  const torso = mesh(new THREE.CylinderGeometry(0.17, 0.08, 0.78, 7), 0, 0.39, 0); torso.scale.z = 0.55; spine.add(torso);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.17 * s, 0.72, 0); sh.rotation.z = 0.08 * s; spine.add(sh);
    sh.add(mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.78, 5), 0, -0.39, 0));
    const el = new THREE.Group(); el.position.y = -0.78; sh.add(el);
    el.add(mesh(new THREE.CylinderGeometry(0.022, 0.012, 0.74, 5), 0, -0.37, 0));
    for (let f = 0; f < 4; f++) {
      const fg = mesh(new THREE.CylinderGeometry(0.006, 0.002, 0.22, 4), (f - 1.5) * 0.014, -0.84, 0);
      fg.rotation.z = (f - 1.5) * 0.1; el.add(fg);
    }
    P['sh' + s] = sh; P['el' + s] = el;
  }
  const neck = new THREE.Group(); neck.position.set(0, 0.78, -0.02); spine.add(neck); P.neck = neck;
  neck.add(mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.2, 5), 0, 0.1, 0));
  const head = new THREE.Group(); head.position.y = 0.3; neck.add(head); P.head = head;
  const skull = mesh(new THREE.SphereGeometry(0.12, 8, 6)); skull.scale.set(0.85, 1.35, 0.9); head.add(skull);
  // 눈: 머리 → 목 → 어깨 순서로 늘어난다
  const eyeMat = new THREE.MeshBasicMaterial({ map: eyeTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const spots = [
    [head, -0.042, 0.02, -0.11], [head, 0.042, 0.02, -0.11],
    [head, 0.0, 0.11, -0.095], [head, -0.07, -0.06, -0.09], [head, 0.075, 0.075, -0.085], [head, 0.02, -0.1, -0.09],
    [spine, -0.06, 0.62, -0.1], [spine, 0.08, 0.55, -0.1], [spine, -0.11, 0.42, -0.09], [spine, 0.03, 0.35, -0.1],
    [spine, 0.12, 0.66, -0.08], [spine, -0.02, 0.5, -0.11], [spine, 0.07, 0.25, -0.09], [spine, -0.09, 0.2, -0.08],
  ];
  const eyes = spots.map(([par, x, y, z], i) => {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(i < 2 ? 0.05 : 0.038, i < 2 ? 0.05 : 0.038), eyeMat);
    e.position.set(x, y, z); e.rotation.y = Math.PI; e.visible = false; par.add(e); return e;
  });
  // 가장자리 연기 (반투명 검은 점들)
  const smokeMat = new THREE.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.55, color: 0x000000 });
  const smoke = [];
  for (let k = 0; k < 9; k++) {
    const sp = new THREE.Sprite(smokeMat); const sc = 0.35 + (k % 3) * 0.12; sp.scale.set(sc, sc * 1.4, 1);
    sp.userData.ph = k * 0.7; sp.userData.r = 0.12 + (k % 4) * 0.05; sp.userData.y = 0.5 + k * 0.17;
    root.add(sp); smoke.push(sp);
  }
  const ent = { root, P, eyes, smoke, eyeMat, phase: 0, jitter: 0, jitterT: 0, n: 2 };
  ent.setEyes = (n) => { ent.n = n; eyes.forEach((e, i) => { e.visible = i < n; }); };
  ent.setEyes(2);
  return ent;
}

export function animEntity(e, dt, time, speed = 0) {
  const P = e.P, moving = speed > 0.1;
  e.phase += dt * (moving ? 2.2 : 0.6);
  P.hips.position.y = 1.18 + Math.sin(e.phase) * (moving ? 0.03 : 0.012);
  P.spine.rotation.x = -0.28 + Math.sin(time * 0.7) * 0.03;
  for (const s of [-1, 1]) {
    P['leg' + s].rotation.x = moving ? Math.sin(e.phase + (s > 0 ? 0 : Math.PI)) * 0.25 : 0;
    P['sh' + s].rotation.x = 0.15 + Math.sin(time * 0.9 + s) * 0.05 + (moving ? 0.2 : 0);
    P['el' + s].rotation.x = 0.1 + Math.sin(time * 1.3 + s * 2) * 0.04;
  }
  e.jitterT -= dt;
  if (e.jitterT <= 0) { e.jitterT = 0.15 + Math.random() * 1.2; e.jitter = (Math.random() * 2 - 1) * (Math.random() < 0.25 ? 0.6 : 0.15); }
  P.head.rotation.z += (e.jitter - P.head.rotation.z) * Math.min(1, dt * 20);
  P.head.rotation.x = 0.2;
  for (const sp of e.smoke) {
    const u = sp.userData, a = time * 0.5 + u.ph;
    sp.position.set(Math.cos(a) * u.r, u.y + Math.sin(time * 0.8 + u.ph) * 0.06, Math.sin(a) * u.r * 0.6);
  }
  const pulse = 0.75 + 0.25 * Math.sin(time * 3.1);
  e.eyeMat.opacity = pulse;
}

// ---------- 모니터 옆에서 뻗어 나오는 손 ----------
// three 좌표: 손끝 = -z 방향, 팔은 +z(어둠) 쪽으로 길게 이어진다
export function buildHand(mats, parent) {
  const m = mats.get('ent_hand');
  const root = new THREE.Group(); root.name = 'Hand'; root.userData.dynamic = true; parent.add(root);
  const mk = (geo, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; };
  const arm = mk(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 6), 0, 0, 0.5); arm.rotation.x = Math.PI / 2; root.add(arm);
  const palm = mk(new THREE.BoxGeometry(0.075, 0.022, 0.09), 0, 0, 0.0); root.add(palm);
  const fingers = [];
  for (let f = 0; f < 4; f++) {
    const base = new THREE.Group(); base.position.set((f - 1.5) * 0.02, 0, -0.045); root.add(base);
    let par = base;
    const segs = [];
    for (let k = 0; k < 3; k++) {
      const len = [0.075, 0.06, 0.05][k] * (f === 1 || f === 2 ? 1.15 : 1);
      const g = new THREE.Group(); par.add(g);
      if (k > 0) g.position.z = -[0.075, 0.06, 0.05][k - 1] * (f === 1 || f === 2 ? 1.15 : 1);
      const seg = mk(new THREE.CylinderGeometry(0.0075 - k * 0.0015, 0.0085 - k * 0.0015, len, 5), 0, 0, -len / 2); seg.rotation.x = Math.PI / 2; g.add(seg);
      segs.push(g); par = g;
    }
    fingers.push(segs);
  }
  const thumb = new THREE.Group(); thumb.position.set(-0.04, 0, -0.01); thumb.rotation.y = 0.7; root.add(thumb);
  const ts = mk(new THREE.CylinderGeometry(0.008, 0.009, 0.07, 5), 0, 0, -0.035); ts.rotation.x = Math.PI / 2; thumb.add(ts);
  root.position.set(0, -60, 0);
  return { root, fingers, thumb };
}
/** curl: 0 = 펴짐, 1 = 책상 모서리를 움켜쥠. tap: 검지를 들었다 내림 (0..1) */
export function poseHand(h, curl, tap = 0) {
  h.fingers.forEach((segs, f) => {
    const c = curl * (f === 1 ? 1 - tap * 0.9 : 1);
    segs[0].rotation.x = -c * 0.55 + (f === 1 ? tap * 0.5 : 0);
    segs[1].rotation.x = -c * 0.75;
    segs[2].rotation.x = -c * 0.6;
  });
}

// ---------- 겁쟁이 모드: 춤추는 아저씨 (오리지널 로우폴리) ----------
// 민머리, 아이보리 V넥 반팔, 베이지 통바지, 검은 쿵후화. three 좌표 (앞 = -z)
export function buildUncle(mats, parent) {
  const skin = mats.get('uncle_skin'), shirt = mats.get('uncle_shirt'), pants = mats.get('uncle_pants'), shoe = mats.get('uncle_shoe');
  const root = new THREE.Group(); root.name = 'Uncle'; root.userData.dynamic = true; parent.add(root);
  const P = {};
  const mk = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips); P.hips = hips;
  hips.add(mk(boxGeo(0.36, 0.16, 0.22, 0), pants, 0, 0, 0));
  for (const s of [-1, 1]) {
    const th = new THREE.Group(); th.position.set(0.1 * s, -0.04, 0); hips.add(th);
    const leg = mk(new THREE.CylinderGeometry(0.085, 0.12, 0.84, 7), pants, 0, -0.42, 0); th.add(leg); // 통바지: 아래로 넓어진다
    th.add(mk(boxGeo(0.1, 0.06, 0.26, 0), shoe, 0, -0.86, -0.04));
    P['th' + s] = th;
  }
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine); P.spine = spine;
  const body = mk(boxGeo(0.4, 0.5, 0.24, 0), shirt, 0, 0.25, 0); spine.add(body);
  const belly = mk(new THREE.SphereGeometry(0.16, 8, 6), shirt, 0, 0.14, -0.06); belly.scale.set(1.15, 0.9, 0.8); spine.add(belly);
  const vneck = mk(new THREE.CylinderGeometry(0.0, 0.07, 0.11, 3), skin, 0, 0.45, -0.121); vneck.rotation.set(Math.PI / 2, 0, Math.PI); vneck.scale.z = 0.05; spine.add(vneck);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.23 * s, 0.45, 0); spine.add(sh);
    sh.add(mk(new THREE.CylinderGeometry(0.065, 0.06, 0.16, 7), shirt, 0, -0.07, 0)); // 반팔 소매
    sh.add(mk(new THREE.CylinderGeometry(0.045, 0.04, 0.26, 6), skin, 0, -0.27, 0));
    const el = new THREE.Group(); el.position.y = -0.4; sh.add(el);
    el.add(mk(new THREE.CylinderGeometry(0.04, 0.034, 0.26, 6), skin, 0, -0.13, 0));
    el.add(mk(boxGeo(0.06, 0.08, 0.035, 0), skin, 0, -0.3, 0));
    P['sh' + s] = sh; P['el' + s] = el;
  }
  const neck = new THREE.Group(); neck.position.y = 0.5; spine.add(neck); P.neck = neck;
  neck.add(mk(new THREE.CylinderGeometry(0.06, 0.065, 0.08, 7), skin, 0, 0.04, 0));
  const head = new THREE.Group(); head.position.y = 0.2; neck.add(head); P.head = head;
  const skull = mk(new THREE.SphereGeometry(0.135, 10, 8), skin, 0, 0, 0); skull.scale.set(0.95, 1.08, 1.0); head.add(skull);
  for (const s of [-1, 1]) head.add(mk(new THREE.SphereGeometry(0.03, 6, 5), skin, 0.13 * s, -0.01, 0));
  // 얼굴 (오리지널 만화풍 텍스처)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mats.get('uncle_face'));
  face.position.set(0, -0.005, -0.128); face.rotation.y = Math.PI; head.add(face);
  root.position.set(0, -60, 0);
  return { root, P, phase: 0 };
}

/** 옆으로 빠지는 보법 + 팔을 활짝 벌리는 춤 */
export function animUncle(u, dt, time) {
  const P = u.P;
  u.phase += dt * 4.2;
  const ph = u.phase, beat = Math.sin(ph), half = Math.sin(ph * 0.5);
  P.hips.position.x = half * 0.16;
  P.hips.position.y = 0.92 - Math.abs(beat) * 0.06;
  P.hips.rotation.z = half * 0.08;
  P.spine.rotation.z = -half * 0.12;
  P.spine.rotation.y = Math.sin(ph * 0.5 + 0.6) * 0.25;
  for (const s of [-1, 1]) {
    P['th' + s].rotation.z = (half * s > 0 ? 0.35 : 0.05) * s;
    P['th' + s].rotation.x = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI))) * 0.25;
    const open = 1.25 + Math.sin(ph + s) * 0.25;
    P['sh' + s].rotation.z = open * s;
    P['sh' + s].rotation.x = Math.sin(ph * 0.5 + s) * 0.3;
    P['el' + s].rotation.z = (0.35 + Math.sin(ph * 2 + s) * 0.25) * s;
  }
  P.head.rotation.z = Math.sin(ph) * 0.12;
  P.head.rotation.x = -0.05 + Math.abs(beat) * 0.08;
}

// ---------- 추격용 길찾기 (거친 격자 BFS + 시야 잇기) ----------
export class NavGrid {
  constructor(grid, cell = 0.25, r = 0.28) {
    this.grid = grid; this.cell = cell;
    this.x0 = grid.X0; this.z0 = grid.Z0;
    this.w = Math.floor((grid.w * 0.05) / cell); this.h = Math.floor((grid.h * 0.05) / cell);
    this.free = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = this.x0 + (i + 0.5) * cell, z = this.z0 + (j + 0.5) * cell;
      this.free[j * this.w + i] = grid.circleFree(x, z, r) ? 1 : 0;
    }
    this.prev = new Int32Array(this.w * this.h);
    this.queue = new Int32Array(this.w * this.h);
  }
  idx(x, z) { const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell); if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1; return j * this.w + i; }
  nearestFree(k) {
    if (k >= 0 && this.free[k]) return k;
    if (k < 0) return -1;
    const ci = k % this.w, cj = (k / this.w) | 0;
    for (let rad = 1; rad < 8; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const q = j * this.w + i; if (this.free[q]) return q;
    }
    return -1;
  }
  /** 배치(Unity) 좌표 a → b 경로점들 (없으면 null) */
  path(ax, az, bx, bz) {
    const s = this.nearestFree(this.idx(ax, az)), g = this.nearestFree(this.idx(bx, bz));
    if (s < 0 || g < 0) return null;
    const prev = this.prev; prev.fill(-1);
    const q = this.queue; let qh = 0, qt = 0;
    q[qt++] = s; prev[s] = s;
    const W = this.w;
    const nb = [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1];
    while (qh < qt) {
      const k = q[qh++]; if (k === g) break;
      const ki = k % W;
      for (let n = 0; n < 8; n++) {
        const d = nb[n], nk = k + d;
        if (nk < 0 || nk >= this.free.length || prev[nk] !== -1 || !this.free[nk]) continue;
        const ni = nk % W; if (Math.abs(ni - ki) > 1) continue;
        if (n >= 4 && (!this.free[k + (d > 0 ? (d === W + 1 ? 1 : -1) : (d === -W + 1 ? 1 : -1))] || !this.free[k + (d > 0 ? W : -W)])) continue;
        prev[nk] = k; q[qt++] = nk;
      }
    }
    if (prev[g] === -1) return null;
    const pts = [];
    for (let k = g; k !== s; k = prev[k]) pts.push([this.x0 + ((k % W) + 0.5) * this.cell, this.z0 + (((k / W) | 0) + 0.5) * this.cell]);
    pts.reverse();
    pts.push([bx, bz]);
    return pts;
  }
}
